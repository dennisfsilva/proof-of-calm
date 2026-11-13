import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, date, instant, money, units } from '../../../test/builders';
import { BERLIN, LISBON, NOW, PLAN, STARTING_PLAN, testId } from '../../../test/exchange/plan-fixture';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { sum } from '../../money/decimal';
import { slots } from '../../plan/slots';
import { slotStatuses } from '../../plan/statuses';
import { type Entry, EntrySchema, writtenEntryVersion } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ExchangeFile, LeftOutRow, Movement } from './kraken';
import { type ExchangeImportPlan, type ImportChoices, type ImportContext, planExchangeImport } from './plan';

// The exchange import's plan (docs/DOMAIN.md §3.13) over generated files and Logs: storing a plan's entries and
// planning again adds nothing, an import in two parts leaves the Log one import leaves, the person's answer to the
// `held` question can come later, and nothing but an estimate is touched.

const pad = (n: number) => String(n).padStart(2, '0');
const START = date('2026-02-01');
const uniformDay = fc.integer({ min: 0, max: 320 }).map((offset) => addDays(START, offset));
/** A date near a due date of buy day 1 or 15, or of a first buy mid-month. */
const nearDue = fc
  .record({
    month: fc.integer({ min: 2, max: 12 }),
    anchor: fc.constantFrom(1, 1, 15, 20),
    offset: fc.integer({ min: -16, max: 20 }),
  })
  .map(({ month, anchor, offset }) => addDays(date(`2026-${pad(month)}-${pad(anchor)}`), offset));
const day = fc.oneof(uniformDay, nearDue, nearDue);
const planCoin = fc.constantFrom('BTC', 'ETH') as fc.Arbitrary<CoinId>;
const unitsOf = fc.integer({ min: 1, max: 99_999 }).map((n) => units(`0.${String(n).padStart(5, '0')}`));
const amountOf = fc.integer({ min: 1, max: 999 }).map((n) => money(`${n}.50`));

/** An order: one to three fills of one coin on one date, each a movement. */
type Order = {
  readonly role: Movement['role'];
  readonly coin: string;
  readonly day: CalendarDate;
  readonly late: boolean;
  readonly usd: boolean;
  readonly fills: readonly { units: Movement['units']; amount: Movement['amount']; cut: boolean; inCoin: boolean }[];
};
const fill = fc.record({ units: unitsOf, amount: amountOf, cut: fc.boolean(), inCoin: fc.boolean() });
const order: fc.Arbitrary<Order> = fc.record({
  role: fc.constantFrom<Movement['role']>('purchase', 'purchase', 'purchase', 'sale', 'receipt'),
  coin: fc.constantFrom('BTC', 'BTC', 'ETH', 'ETH', 'SOL', 'XRP'),
  day,
  late: fc.boolean(),
  usd: fc.constantFrom(false, false, false, true),
  fills: fc.array(fill, { minLength: 1, maxLength: 3 }),
});
/** Two or three purchase dates of one coin within 3 days of each other. */
const cluster = fc
  .record({
    coin: planCoin,
    base: day,
    members: fc.array(
      fc.record({ offset: fc.integer({ min: -3, max: 3 }), fills: fc.array(fill, { minLength: 1, maxLength: 2 }) }),
      { minLength: 2, maxLength: 3 },
    ),
  })
  .map(({ coin, base, members }) => ({
    base,
    orders: members.map(
      ({ offset, fills }): Order => ({
        role: 'purchase',
        coin,
        day: addDays(base, offset),
        late: false,
        usd: false,
        fills,
      }),
    ),
  }));

function movementsOf(orders: readonly Order[]): Movement[] {
  return orders.flatMap((drawn, index) =>
    drawn.fills.map((each, part): Movement => {
      const receipt = drawn.role === 'receipt';
      return {
        key: `poc-csv-1|kraken|TP-${index}-${part}|${drawn.coin}|${drawn.role === 'sale' ? 'out' : 'in'}`,
        lines: [2 + 2 * (index * 3 + part), 3 + 2 * (index * 3 + part)],
        at: instant(`${drawn.day}${drawn.late ? `T23:${30 + part}:00Z` : `T10:0${part}:00Z`}`),
        role: drawn.role,
        coin: drawn.coin,
        units: each.units,
        unitsCut: each.cut,
        currency: receipt ? null : drawn.usd ? 'USD' : 'EUR',
        amount: receipt ? null : each.amount,
        fee: receipt ? null : money('0.10'),
        feeInCoin: each.inCoin,
      };
    }),
  );
}
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
const fileOf = (movements: readonly Movement[], leftOut: readonly LeftOutRow[] = []): ExchangeFile => ({
  exchange: 'kraken',
  rows: movements.length * 2 + leftOut.length,
  first: null,
  last: null,
  movements,
  leftOut,
});
const file = fc
  .record({
    orders: fc.array(order, { maxLength: 12 }),
    clusters: fc.array(cluster, { maxLength: 2 }),
    sorted: fc.boolean(),
    leftOut: fc.array(leftOutRow, { maxLength: 4 }),
  })
  .map(({ orders, clusters, sorted, leftOut }) => {
    const all = [...orders, ...clusters.flatMap((each) => each.orders)];
    const listed = sorted ? [...all].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)) : all;
    return { file: fileOf(movementsOf(listed), leftOut), bases: clusters.map((each) => each.base) };
  });

const PLANS: readonly Plan[] = [
  PLAN,
  STARTING_PLAN,
  { ...PLAN, firstBuy: date('2026-03-20') },
  { ...STARTING_PLAN, buyDay: 15, firstBuy: date('2026-03-15') },
];

/**
 * A Log: one-tap estimates (3 days early to 35 days late, some tombstoned, two for one month), hand entries of every
 * hand source and `held` entries of every source near the file's dates, moves, a one-tap `lump`, another exchange's
 * monthly buy, tombstoned hand and `held` entries, and rows of the file imported or deleted earlier.
 */
function log(plan: Plan, movements: readonly Movement[], bases: readonly CalendarDate[]) {
  const slot = fc.constantFrom(...slots(plan));
  const dates = movements.map((movement) => LISBON.dateOf(movement.at));
  const around = (anchors: readonly CalendarDate[], spread: number) =>
    anchors.length === 0
      ? uniformDay
      : fc
          .record({ index: fc.nat(), offset: fc.integer({ min: -spread, max: spread }) })
          .map(({ index, offset }) => addDays(anchors[index % anchors.length] as CalendarDate, offset));
  const nearBase = (spread: number) => (bases.length === 0 ? around(dates, spread) : around(bases, spread));
  const estimate = fc
    .record({
      coin: planCoin,
      slot,
      late: fc.integer({ min: -3, max: 35 }),
      tombstoned: fc.constantFrom(false, false, false, false, false, true),
      note: fc.constantFrom('', 'card'),
    })
    .map(({ coin, slot: { key, due }, late, tombstoned, note }) =>
      anEntry({
        coin,
        slot: key,
        date: addDays(due, late),
        note,
        source: 'one-tap',
        venue: 'Bitvavo',
        deletedAt: tombstoned ? instant('2026-11-01T08:00:00Z') : null,
      }),
    );
  const hand = fc
    .record({
      kind: fc.constantFrom<Entry['kind']>('dca', 'dca', 'extra', 'sell', 'lump'),
      coin: planCoin,
      slot,
      day: fc.oneof(uniformDay, around(dates, 3), nearBase(1), nearBase(1)),
      source: fc.constantFrom<Entry['source']>('manual', 'manual', 'import-json', 'import-prototype'),
    })
    .map(({ kind, coin, slot: { key }, day, source }) =>
      anEntry({ kind, coin, slot: kind === 'dca' ? key : null, date: day, source }),
    );
  const held = fc
    .record({
      coin: planCoin,
      day: fc.oneof(uniformDay, nearDue, around(dates, 6), nearBase(3)),
      source: fc.constantFrom<Entry['source']>('manual', 'manual', 'import-json', 'import-csv'),
      cost: fc.constantFrom(null, '0', '120'),
    })
    .map(({ coin, day, source, cost }) =>
      anEntry({
        kind: 'held',
        coin,
        slot: null,
        date: day,
        amount: cost === null ? null : money(cost),
        venue: 'Ledger',
        source,
      }),
    );
  const move = fc
    .record({ day, units: unitsOf })
    .map(({ day, units: sent }) => aMove({ date: day, units: sent, received: sent }));
  const other = fc.oneof(
    fc
      .record({ kind: fc.constantFrom<Entry['kind']>('dca', 'extra'), coin: planCoin, slot, day })
      .map(({ kind, coin, slot: { key }, day }) =>
        anEntry({ kind, coin, slot: kind === 'dca' ? key : null, date: day, source: 'manual', deletedAt: NOW }),
      ),
    fc
      .record({ coin: planCoin, day })
      .map(({ coin, day }) =>
        anEntry({ kind: 'held', coin, slot: null, date: day, amount: null, venue: 'Ledger', deletedAt: NOW }),
      ),
    planCoin.map((coin) =>
      anEntry({ kind: 'lump', coin, slot: null, date: plan.firstBuy, source: 'one-tap', venue: 'Bitvavo' }),
    ),
    fc
      .record({ coin: planCoin, slot, late: fc.integer({ min: -3, max: 10 }) })
      .map(({ coin, slot: { key, due }, late }) =>
        anEntry({ coin, slot: key, date: addDays(due, late), source: 'import-csv', venue: 'Bitstamp' }),
      ),
  );
  return fc
    .record({
      estimates: fc.array(estimate, { maxLength: 6 }),
      hands: fc.array(hand, { maxLength: 4 }),
      helds: fc.array(held, { maxLength: 2 }),
      moves: fc.array(move, { maxLength: 2 }),
      others: fc.array(other, { maxLength: 2 }),
      earlier: fc.subarray([...movements], { maxLength: Math.min(4, movements.length) }),
      deleted: fc.boolean(),
    })
    .map(({ estimates, hands, helds, moves, others, earlier, deleted }) => [
      ...estimates,
      ...hands,
      ...helds,
      ...moves,
      ...others,
      ...earlier.map((movement, index) =>
        anEntry({
          id: testId(movement.key),
          coin: (['BTC', 'ETH', 'SOL'].includes(movement.coin) ? movement.coin : 'BTC') as CoinId,
          slot: null,
          kind: movement.role === 'sale' ? 'sell' : movement.role === 'receipt' ? 'held' : 'extra',
          date: LISBON.dateOf(movement.at),
          units: movement.units,
          amount: movement.amount ?? money('0'),
          source: 'import-csv',
          venue: 'Kraken',
          deletedAt: deleted && index === 0 ? NOW : null,
        }),
      ),
    ]);
}

const world = fc
  .record({
    drawn: file,
    plan: fc.constantFrom(...PLANS),
    addHeld: fc.boolean(),
    venue: fc.constantFrom('Kraken', null),
  })
  .chain(({ drawn, ...rest }) =>
    log(rest.plan, drawn.file.movements, drawn.bases).map((entries) => ({ ...rest, file: drawn.file, entries })),
  );
type World = { file: ExchangeFile; plan: Plan; addHeld: boolean; venue: string | null; entries: Entry[] };

const choicesOf = ({ addHeld, venue }: { addHeld: boolean; venue: string | null }): ImportChoices => ({
  addHeld,
  venue,
});

/** What the write does with a plan: tombstones the estimates it replaces and adds its entries. */
function store(entries: readonly Entry[], plan: ExchangeImportPlan): Entry[] {
  const replaced = new Set(plan.replaced.flatMap((replacement) => replacement.estimates.map((entry) => entry.id)));
  return [...entries.map((entry) => (replaced.has(entry.id) ? { ...entry, deletedAt: NOW } : entry)), ...plan.entries];
}

const ids = (entries: readonly Entry[]) => entries.map((entry) => entry.id).sort();
const live = (entries: readonly Entry[]) => entries.filter((entry) => entry.deletedAt === null);
const unitsPerCoin = (entries: readonly Entry[]) =>
  Object.fromEntries(
    ['BTC', 'ETH', 'SOL'].map((coin) => [
      coin,
      sum(entries.filter((entry) => entry.coin === coin).map((e) => e.units)),
    ]),
  );

const run = (
  drawn: World,
  entries: readonly Entry[],
  movements: ExchangeFile,
  addHeld = drawn.addHeld,
  context: ImportContext = LISBON,
) => planExchangeImport(movements, { plan: drawn.plan, entries }, choicesOf({ ...drawn, addHeld }), context);

/** One import of the whole file, and a prefix of its rows stored before the whole file. */
function twoWays(drawn: World, cut: number) {
  const prefix = fileOf(drawn.file.movements.slice(0, cut % (drawn.file.movements.length + 1)));
  const once = run(drawn, drawn.entries, drawn.file);
  const first = run(drawn, drawn.entries, prefix);
  const after = store(drawn.entries, first);
  const then = run(drawn, after, drawn.file);
  return { once, first, then, oneLog: store(drawn.entries, once), twoLog: store(after, then) };
}

/**
 * The two-import properties run 1,500 times with a 60 s timeout each (the core's default is Vitest's 5 s). Measured
 * on 2026-11-13 under the full core suite with coverage, seeds 1 to 8: 1.7 to 2.8 s locally per property (the first
 * one is the slowest every time; the generators' sizes are bounded and no seed stands out), and CI's runner is at
 * least 6 times slower, so 2.8 s × 6 = 17 s stays under a third of 60 s. At 2,000 runs the worst was 3.6 s, and
 * 3.6 s × 6 = 22 s overran the old 20 s. On the old order (a9664cfd), seeds 1 to 8 at 1,500 runs catch it 7 times
 * in the prefix-adds property (seed 2 first fails at run 2,026), 8 in the live-Log one and 8 in the `held` one (each
 * by run 54).
 */
const TWICE = { numRuns: 1500 };
const TIMEOUT = 60_000;

describe('planExchangeImport', () => {
  it('a second plan after its entries are stored adds nothing and replaces nothing', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const first = run(drawn, drawn.entries, drawn.file);
        const second = run(drawn, store(drawn.entries, first), drawn.file);
        expect([second.entries, second.replaced]).toEqual([[], []]);
      }),
    );
  });

  it(
    "a prefix of a file's rows, stored, then the whole file adds the ids and units per coin the whole file adds at once",
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays(drawn, cut);
          const twice = [...first.entries, ...then.entries];
          expect(ids(twice)).toEqual(ids(once.entries));
          expect(unitsPerCoin(twice)).toEqual(unitsPerCoin(once.entries));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    "a prefix of a file's rows, stored, then the whole file leaves the Log with the live ids and units per coin one import leaves",
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { oneLog, twoLog } = twoWays(drawn, cut);
          expect(ids(live(twoLog))).toEqual(ids(live(oneLog)));
          expect(unitsPerCoin(live(twoLog))).toEqual(unitsPerCoin(live(oneLog)));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'the whole file unticked, stored, then ticked leaves the Log one ticked import leaves',
    () => {
      fc.assert(
        fc.property(world, (drawn) => {
          const after = store(drawn.entries, run(drawn, drawn.entries, drawn.file, false));
          const yes = run(drawn, after, drawn.file, true);
          const ticked = run(drawn, drawn.entries, drawn.file, true);
          expect(ids(live(store(after, yes)))).toEqual(ids(live(store(drawn.entries, ticked))));
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a purchase a hand entry records is never stored, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const { once, first, then } = twoWays(drawn, cut);
          const known = new Set(drawn.entries.map((entry) => entry.id));
          const recorded = once.recorded.flatMap(({ coin, date: recordedOn, entry }) =>
            drawn.file.movements
              .filter(
                (movement) =>
                  movement.coin === coin &&
                  LISBON.dateOf(movement.at) === recordedOn &&
                  movement.role === (entry.kind === 'sell' ? 'sale' : 'purchase') &&
                  !known.has(testId(movement.key)),
              )
              .map((movement) => testId(movement.key)),
          );
          const stored = new Set(ids([...once.entries, ...first.entries, ...then.entries]));
          expect(recorded.filter((id) => stored.has(id))).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it(
    'a purchase dated on or before a hand-recorded `held` entry of its coin is never stored unticked, in one import or two',
    () => {
      fc.assert(
        fc.property(world, fc.nat(), (drawn, cut) => {
          const through = new Map<string, CalendarDate>();
          for (const entry of live(drawn.entries)) {
            const latest = through.get(entry.coin);
            if (entry.kind === 'held' && entry.source !== 'import-csv' && (latest === undefined || latest < entry.date))
              through.set(entry.coin, entry.date);
          }
          const { once, first, then } = twoWays({ ...drawn, addHeld: false }, cut);
          const leaked = [...once.entries, ...first.entries, ...then.entries].filter(
            (entry) => entry.kind !== 'sell' && entry.date <= (through.get(entry.coin) ?? ''),
          );
          expect(leaked).toEqual([]);
        }),
        TWICE,
      );
    },
    TIMEOUT,
  );

  it('no entry but a one-tap monthly estimate is tombstoned, and no hand, `held`, move or imported entry changes', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
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
        const plan = run(drawn, drawn.entries, drawn.file);
        const before = new Map(
          slotStatuses(drawn.plan, drawn.entries, LISBON.today).map((each) => [each.key, each.status]),
        );
        const replacing = new Set(plan.replaced.flatMap((replacement) => replacement.by));
        for (const entry of plan.entries.filter((each) => each.kind === 'dca' && !replacing.has(each.id))) {
          expect(['late', 'due', 'upcoming']).toContain(before.get(entry.slot as never));
        }
        for (const { estimates, by } of plan.replaced) {
          for (const estimate of estimates) {
            for (const entry of plan.entries.filter((each) => by.includes(each.id))) {
              expect([entry.coin, entry.slot]).toEqual([estimate.coin, estimate.slot]);
            }
          }
        }
      }),
    );
  });

  it('every movement and left-out row is counted once', () => {
    fc.assert(
      fc.property(world, (drawn) => {
        const plan = run(drawn, drawn.entries, drawn.file);
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
        for (const entry of run(drawn, drawn.entries, drawn.file).entries) {
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
          for (const entry of run(drawn, drawn.entries, drawn.file, drawn.addHeld, context).entries) {
            expect(keys.get(entry.id)).toBe(entry.createdAt);
          }
        }
      }),
    );
  });
});
