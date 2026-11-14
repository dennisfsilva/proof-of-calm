import fc from 'fast-check';
import { IMPORT_MATCH_DAYS } from '../../src/constants';
import { addDays, type CalendarDate } from '../../src/dates/calendar';
import type { ExchangeFile, LeftOutRow, Movement } from '../../src/import/exchange/kraken';
import { compare, isPositive, isZero } from '../../src/money/decimal';
import { slots } from '../../src/plan/slots';
import type { Entry } from '../../src/schema/entry';
import type { CoinId, EntityId } from '../../src/schema/ids';
import type { Plan } from '../../src/schema/plan';
import { aMove, anEntry, date, instant, money, units } from '../builders';
import { LISBON, NOW, PLAN, STARTING_PLAN, testId } from './plan-fixture';

// The generated files and Logs of the exchange import's properties (plan.property.test.ts, apply.property.test.ts).

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
/** A date up to 90 days before the plans' earliest first buy, for step 3's reach back. */
const early = fc.integer({ min: -90, max: 0 }).map((offset) => addDays(date('2026-03-01'), offset));
const day = fc.oneof(uniformDay, nearDue, nearDue, early);
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
export const fileOf = (movements: readonly Movement[], leftOut: readonly LeftOutRow[] = []): ExchangeFile => ({
  exchange: 'kraken',
  rows: movements.length * 2 + leftOut.length,
  first: null,
  last: null,
  movements,
  leftOut,
  cancelled: [],
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
function log(
  plan: Plan,
  movements: readonly Movement[],
  bases: readonly CalendarDate[],
  idOf: (key: string) => EntityId,
) {
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
      held: unitsOf,
    })
    .map(({ coin, day, source, cost, held: drawnUnits }) =>
      anEntry({
        kind: 'held',
        coin,
        slot: null,
        date: day,
        units: drawnUnits,
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
          id: idOf(movement.key),
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

/** Worlds whose earlier imported rows carry the ids `idOf` gives (`testId`, or the write's `importId`). */
export const worldOf = (idOf: (key: string) => EntityId) =>
  fc
    .record({
      drawn: file,
      plan: fc.constantFrom(...PLANS),
      addHeld: fc.boolean(),
      venue: fc.constantFrom('Kraken', null),
    })
    .chain(({ drawn, ...rest }) =>
      log(rest.plan, drawn.file.movements, drawn.bases, idOf).map((entries) => ({
        ...rest,
        file: drawn.file,
        entries,
      })),
    );
export const world = worldOf(testId);

/**
 * Step 4 over an added entry (docs/DOMAIN.md §3.13): a live hand `held` entry of its coin dated on or after it holds at
 * least its units, and the added entry is a receipt (a `held` entry) or a purchase while that entry's cost is not 0.
 */
export const heldGuards = (log: readonly Entry[], added: Entry) =>
  added.kind !== 'sell' &&
  log.some(
    (entry) =>
      entry.deletedAt === null &&
      entry.kind === 'held' &&
      entry.source !== 'import-csv' &&
      entry.coin === added.coin &&
      added.date <= entry.date &&
      compare(added.units, entry.units) <= 0 &&
      (added.kind === 'held' || entry.amount === null || !isZero(entry.amount)),
  );

/** Step 3 over an added purchase: dated on or before `firstBuy` + 15 days, in a plan with a starting amount or for a coin with a live `lump`. */
export const startingGuards = (plan: Plan, log: readonly Entry[], added: Entry) =>
  (added.kind === 'dca' || added.kind === 'extra') &&
  added.date <= addDays(plan.firstBuy, IMPORT_MATCH_DAYS) &&
  (isPositive(plan.startingAmount) ||
    log.some((entry) => entry.deletedAt === null && entry.kind === 'lump' && entry.coin === added.coin));
export type World = { file: ExchangeFile; plan: Plan; addHeld: boolean; venue: string | null; entries: Entry[] };
