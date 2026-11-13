import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, date, instant, money, month, units } from '../../../test/builders';
import { BERLIN, LISBON, NOW, PLAN, STARTING_PLAN, testId } from '../../../test/exchange/plan-fixture';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { sum } from '../../money/decimal';
import { slotStatuses } from '../../plan/statuses';
import { type Entry, EntrySchema, writtenEntryVersion } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ExchangeFile, LeftOutRow, Movement } from './kraken';
import { type ExchangeImportPlan, type ImportChoices, type ImportContext, planExchangeImport } from './plan';

// The exchange import's plan (docs/DOMAIN.md §3.13) over generated files and Logs: storing a plan's entries and
// planning again adds nothing, an import in two parts adds what one adds, and nothing but an estimate is touched.

const START = date('2026-02-01');
const day = fc.integer({ min: 0, max: 320 }).map((offset) => addDays(START, offset));
const coin = fc.constantFrom('BTC', 'ETH', 'SOL', 'XRP');
const planCoin = fc.constantFrom('BTC', 'ETH') as fc.Arbitrary<CoinId>;
const unitsOf = fc.integer({ min: 1, max: 99_999 }).map((n) => units(`0.${String(n).padStart(5, '0')}`));
const amountOf = fc.integer({ min: 1, max: 999 }).map((n) => money(`${n}.50`));

const movementAt = (index: number) =>
  fc
    .record({
      role: fc.constantFrom<Movement['role']>('purchase', 'purchase', 'purchase', 'sale', 'receipt'),
      coin,
      day,
      time: fc.constantFrom('T10:00:00Z', 'T23:30:00Z'),
      usd: fc.boolean(),
      units: unitsOf,
      amount: amountOf,
      unitsCut: fc.boolean(),
      feeInCoin: fc.boolean(),
    })
    .map(
      (drawn): Movement => ({
        key: `poc-csv-1|kraken|TP-${index}|${drawn.coin}|${drawn.role === 'sale' ? 'out' : 'in'}`,
        lines: [2 + 2 * index, 3 + 2 * index],
        at: instant(`${drawn.day}${drawn.time}`),
        role: drawn.role,
        coin: drawn.coin,
        units: drawn.units,
        unitsCut: drawn.unitsCut,
        currency: drawn.role === 'receipt' ? null : drawn.usd ? 'USD' : 'EUR',
        amount: drawn.role === 'receipt' ? null : drawn.amount,
        fee: drawn.role === 'receipt' ? null : money('0.10'),
        feeInCoin: drawn.feeInCoin,
      }),
    );
const REASONS = ['reward', 'coin-deposit', 'coin-withdrawal', 'cash', 'within', 'conversion', 'unpaired', 'other'];
const leftOutRow = fc
  .record({ reason: fc.constantFrom(...REASONS), coin: fc.option(planCoin), day, units: unitsOf, line: fc.nat(500) })
  .map(
    (drawn): LeftOutRow => ({
      reason: drawn.reason as LeftOutRow['reason'],
      lines: [1000 + drawn.line],
      at: instant(`${drawn.day}T10:00:00Z`),
      coin: drawn.reason === 'coin-withdrawal' ? 'BTC' : drawn.coin,
      units: drawn.reason === 'coin-withdrawal' || drawn.coin !== null ? drawn.units : null,
      column: null,
    }),
  );
const fileOf = (movements: readonly Movement[], leftOut: readonly LeftOutRow[]): ExchangeFile => ({
  exchange: 'kraken',
  rows: movements.length * 2 + leftOut.length,
  first: null,
  last: null,
  movements,
  leftOut,
});
const file = fc
  .integer({ min: 0, max: 24 })
  .chain((count) =>
    fc.tuple(
      fc.tuple(...Array.from({ length: count }, (_, index) => movementAt(index))),
      fc.array(leftOutRow, { maxLength: 4 }),
    ),
  )
  .map(([movements, leftOut]) => fileOf(movements, leftOut));

/** A Log: one-tap estimates, hand entries, `held` entries, moves, and rows of the file imported or deleted earlier. */
const slot = fc.integer({ min: 3, max: 12 }).map((n) => month(`2026-${String(n).padStart(2, '0')}`));
const estimate = fc
  .record({ coin: planCoin, slot, late: fc.integer({ min: -3, max: 20 }) })
  .map(({ coin, slot, late }) =>
    anEntry({ coin, slot, date: addDays(date(`${slot}-01`), late), source: 'one-tap', venue: 'Bitvavo' }),
  );
const hand = fc
  .record({
    kind: fc.constantFrom('dca', 'extra', 'sell'),
    coin: planCoin,
    slot,
    day,
    source: fc.constantFrom('manual', 'import-json'),
  })
  .map(({ kind, coin, slot, day, source }) =>
    anEntry({
      kind: kind as Entry['kind'],
      coin,
      slot: kind === 'dca' ? slot : null,
      date: day,
      source: source as Entry['source'],
    }),
  );
const held = fc
  .record({ coin: planCoin, day })
  .map(({ coin, day }) => anEntry({ kind: 'held', coin, slot: null, date: day, amount: null, venue: 'Ledger' }));
const move = fc
  .record({ day, units: unitsOf })
  .map(({ day, units: sent }) => aMove({ date: day, units: sent, received: sent }));
const log = (movements: readonly Movement[]) =>
  fc
    .record({
      estimates: fc.uniqueArray(estimate, { maxLength: 6, selector: (entry) => `${entry.coin}|${entry.slot}` }),
      hands: fc.array(hand, { maxLength: 4 }),
      helds: fc.array(held, { maxLength: 2 }),
      moves: fc.array(move, { maxLength: 2 }),
      earlier: fc.subarray([...movements], { maxLength: Math.min(4, movements.length) }),
      deleted: fc.boolean(),
    })
    .map(({ estimates, hands, helds, moves, earlier, deleted }) => [
      ...estimates,
      ...hands,
      ...helds,
      ...moves,
      ...earlier.map((movement, index) =>
        anEntry({
          id: testId(movement.key),
          coin: 'BTC' as CoinId,
          slot: null,
          kind: 'extra',
          source: 'import-csv',
          deletedAt: deleted && index === 0 ? NOW : null,
        }),
      ),
    ]);

const world = fc
  .record({
    file,
    plan: fc.constantFrom(PLAN, STARTING_PLAN),
    addHeld: fc.boolean(),
    venue: fc.constantFrom('Kraken', null),
  })
  .chain((drawn) => log(drawn.file.movements).map((entries) => ({ ...drawn, entries })));

const choicesOf = ({ addHeld, venue }: { addHeld: boolean; venue: string | null }): ImportChoices => ({
  addHeld,
  venue,
});

/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}

const unitsPerCoin = (entries: readonly Entry[]) =>
  Object.fromEntries(
    ['BTC', 'ETH', 'SOL'].map((coin) => [
      coin,
      sum(entries.filter((entry) => entry.coin === coin).map((e) => e.units)),
    ]),
  );

/**
 * The held guard (step 5) runs after the estimates (step 4), and an estimate is replaced one for one: a `held` entry of
 * the coin changes which purchase replaces an estimate between a prefix and the whole file, never how many are stored.
 * A prefix stores the estimate's choice, while at once a nearer date in the rest of the file takes it and the held
 * guard leaves out the prefix's date, so the ids differ. The prefix property draws `held` entries only of coins with no
 * estimate in the Log; hand-recorded entries claim before the estimates (step 3) and are drawn for every coin.
 */
const apart = (entries: readonly Entry[]) => {
  const estimated = new Set(entries.filter((entry) => entry.source === 'one-tap').map((entry) => entry.coin));
  return entries.filter((entry) => entry.kind !== 'held' || !estimated.has(entry.coin));
};

const run = (
  plan: Plan,
  entries: readonly Entry[],
  drawn: { addHeld: boolean; venue: string | null },
  movements: ExchangeFile,
  context: ImportContext = LISBON,
) => planExchangeImport(movements, { plan, entries }, choicesOf(drawn), context);

describe('planExchangeImport', () => {
  it('a second plan after its entries are stored adds nothing and replaces nothing', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const first = run(drawn.plan, drawn.entries, drawn, drawn.file);
        const second = run(drawn.plan, store(drawn.entries, first), drawn, drawn.file);
        expect([second.entries, second.replaced]).toEqual([[], []]);
      }),
    );
  });

  it("a prefix of a file's rows, stored, then the whole file adds the ids and units per coin the whole file adds at once", () => {
    fc.assert(
      fc.property(world, fc.nat(), (drawn, cut) => {
        const entries = apart(drawn.entries);
        const prefix = fileOf(drawn.file.movements.slice(0, cut % (drawn.file.movements.length + 1)), []);
        const first = run(drawn.plan, entries, drawn, prefix);
        const then = run(drawn.plan, store(entries, first), drawn, drawn.file);
        const once = run(drawn.plan, entries, drawn, drawn.file);
        const twice = [...first.entries, ...then.entries];
        expect(twice.map((entry) => entry.id).sort()).toEqual(once.entries.map((entry) => entry.id).sort());
        expect(unitsPerCoin(twice)).toEqual(unitsPerCoin(once.entries));
      }),
    );
  });

  it('no entry but a one-tap monthly estimate is tombstoned, and no hand, `held`, move or imported entry changes', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn.plan, drawn.entries, drawn, drawn.file);
        const stored = new Set(drawn.entries.map((entry) => entry.id));
        for (const { estimates } of plan.replaced) {
          for (const entry of estimates) {
            expect([entry.source, entry.kind, entry.deletedAt, drawn.entries.includes(entry)]).toEqual([
              'one-tap',
              'dca',
              null,
              true,
            ]);
          }
        }
        expect(plan.entries.filter((entry) => stored.has(entry.id))).toEqual([]);
      }),
    );
  });

  it("no month that was done, skipped or paused before the plan gets a monthly buy from it, and no month gets two coins' estimates replaced by one coin", () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn.plan, drawn.entries, drawn, drawn.file);
        const before = new Map(
          slotStatuses(drawn.plan, drawn.entries, LISBON.today).map((each) => [each.key, each.status]),
        );
        const replacing = new Set(plan.replaced.flatMap((replacement) => replacement.by));
        for (const entry of plan.entries.filter((each) => each.kind === 'dca' && !replacing.has(each.id))) {
          expect(['late', 'due', 'upcoming']).toContain(before.get(entry.slot as never));
        }
        for (const { estimates, by } of plan.replaced) {
          const [estimate] = estimates as [Entry];
          for (const entry of plan.entries.filter((each) => by.includes(each.id))) {
            expect([entry.coin, entry.slot]).toEqual([estimate.coin, estimate.slot]);
          }
        }
      }),
    );
  });

  it('every movement and left-out row is counted once', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn.plan, drawn.entries, drawn, drawn.file);
        const counted =
          plan.entries.length +
          plan.recorded.reduce((total, each) => total + each.count, 0) +
          (plan.held === null || plan.held.added
            ? 0
            : plan.held.coins.reduce((total, each) => total + each.purchases, 0)) +
          (plan.startingAmount?.purchases ?? 0) +
          plan.imported +
          plan.deleted +
          plan.leftOut.reduce((total, each) => total + each.count, 0) +
          [...plan.withdrawals.logged, ...plan.withdrawals.notLogged].reduce((total, each) => total + each.count, 0);
        expect(counted).toBe(drawn.file.movements.length + drawn.file.leftOut.length);
      }),
    );
  });

  it('every entry passes `EntrySchema` at `writtenEntryVersion` at most 3', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        for (const entry of run(drawn.plan, drawn.entries, drawn, drawn.file).entries) {
          expect(EntrySchema.safeParse(entry).success).toBe(true);
          expect(writtenEntryVersion(entry)).toBeLessThanOrEqual(3);
        }
      }),
    );
  });

  it('the ids do not depend on `dateOf`', () => {
    const shifted: ImportContext = { ...LISBON, dateOf: (at) => addDays(BERLIN.dateOf(at), 1) as CalendarDate };
    fc.assert(
      fc.property(world, (drawn) => {
        const keys = new Map(drawn.file.movements.map((movement) => [testId(movement.key), movement.at]));
        for (const context of [LISBON, BERLIN, shifted]) {
          for (const entry of run(drawn.plan, drawn.entries, drawn, drawn.file, context).entries) {
            expect(keys.get(entry.id)).toBe(entry.createdAt);
          }
        }
      }),
    );
  });
});
