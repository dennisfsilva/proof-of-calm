import fc from 'fast-check';
import { IMPORT_MATCH_DAYS, IMPORT_TYPED_DAYS } from '../../src/constants';
import { addDays, type CalendarDate, daysBetween } from '../../src/dates/calendar';
import type { ExchangeFile, Movement } from '../../src/import/exchange/kraken';
import { compare, isPositive, type Money, minus, product, round } from '../../src/money/decimal';
import { plannedParts } from '../../src/plan/parts';
import { slots } from '../../src/plan/slots';
import type { Entry } from '../../src/schema/entry';
import type { CoinId, EntityId } from '../../src/schema/ids';
import type { Plan } from '../../src/schema/plan';
import { anEntry, instant, money, units } from '../builders';
import { LISBON, testId } from './plan-fixture';

// The generated lumps of the exchange import's properties (plan-arbitraries.ts): amounts that reach a `lump`'s claim
// by its amount in step 2, a starting amount bought late beside a monthly buy, and the cut that splits such a date.

const planCoin = fc.constantFrom('BTC', 'ETH') as fc.Arbitrary<CoinId>;
const amountOf = fc.integer({ min: 1, max: 999 }).map((n) => money(`${n}.50`));

/** The coin's part of `total` in the plan, or 0. */
export const partOf = (plan: Plan, total: Money, coin: CoinId) =>
  plannedParts(plan, total).find((part) => part.coin === coin)?.amount ?? ('0' as Money);

/** A lump's amount: the coin's monthly part, its starting part, 1,000 or any amount. */
export const lumpPick = fc.record({ pick: fc.constantFrom('part', 'start', '1000', 'any'), any: amountOf });
export const lumpAmount = (plan: Plan, coin: CoinId, drawn: { pick: string; any: Money }): Money => {
  const start = partOf(plan, plan.startingAmount, coin);
  if (drawn.pick === 'part') return partOf(plan, plan.monthlyAmount, coin);
  if (drawn.pick === 'start') return isPositive(start) ? start : money('1000');
  return drawn.pick === '1000' ? money('1000') : drawn.any;
};

/** The due dates past the first buy's 15 days, where Today still offers the starting amount. */
export const laterDues = (plan: Plan) =>
  slots(plan)
    .filter((each) => each.due > addDays(plan.firstBuy, IMPORT_MATCH_DAYS))
    .map((each) => each.due);

export const lateStart = fc.record({
  slot: fc.nat(),
  coin: planCoin,
  startOff: fc.integer({ min: -3, max: 3 }),
  tapOff: fc.integer({ min: -3, max: 3 }),
  split: fc.boolean(),
  share: fc.integer({ min: 1, max: 9 }),
  monthly: fc.boolean(),
  size: fc.constantFrom('start', '1000'),
  source: fc.constantFrom<Entry['source']>('one-tap', 'one-tap', 'manual'),
  lump: fc.constantFrom(true, true, false),
});
type LateStart = typeof lateStart extends fc.Arbitrary<infer U> ? U : never;

/**
 * A starting amount bought late, within 3 days of a due date past the first buy's 15 days, beside that month's buy;
 * half of them in two fills at 08:00Z and 16:00Z; and, mostly, its lump near it.
 */
export function lateOf(plan: Plan, late: LateStart, idOf: (key: string) => EntityId) {
  const later = laterDues(plan);
  if (later.length === 0) return { movements: [] as Movement[], lumps: [] as Entry[] };
  const due = later[late.slot % later.length] as CalendarDate;
  const day = addDays(due, late.startOff);
  const own = partOf(plan, plan.startingAmount, late.coin);
  const start = isPositive(own) && late.size === 'start' ? own : money('1000');
  const part = partOf(plan, plan.monthlyAmount, late.coin);
  const movement = (ref: string, at: string, amount: Money): Movement => ({
    key: `poc-csv-1|kraken|LS-${ref}|${late.coin}|in`,
    lines: [3000 + 2 * ref.length, 3001 + 2 * ref.length],
    at: instant(at),
    role: 'purchase',
    coin: late.coin,
    units: units('0.0125'),
    unitsCut: false,
    currency: 'EUR',
    amount,
    fee: money('0.10'),
    feeInCoin: false,
  });
  const first = round(product<Money>(start, money(`0.${late.share}`)), 2, 'half-up');
  const fills = late.split
    ? [movement('a', `${day}T08:00:00Z`, first), movement('bb', `${day}T16:00:00Z`, minus(start, first))]
    : [movement('a', `${day}T08:00:00Z`, start)];
  const monthly = late.monthly && isPositive(part) ? [movement('mmm', `${due}T10:00:00Z`, part)] : [];
  const lumps = late.lump
    ? [
        anEntry({
          id: idOf(`late-lump|${late.coin}|${late.tapOff}`),
          kind: 'lump',
          coin: late.coin,
          slot: null,
          date: addDays(day, late.tapOff),
          amount: start,
          units: units('0.0122'),
          source: late.source,
          venue: 'Bitvavo',
        }),
      ]
    : [];
  return { movements: [...monthly, ...fills], lumps };
}

/**
 * Whether `part`, some of the file's movements, splits one date of a coin's purchases within 3 days of a live `lump`
 * of that coin whose amount is not the coin's monthly part, whichever side (it ends inside it, begins inside it, or
 * both). A cut at this width can store a purchase of a date a hand entry claims in one import, so it counts twice with
 * the one-tap estimates it replaced, and can move the date a hand entry that falls back to its nearest date claims,
 * docs/DOMAIN.md §3.13 step 2's one exception; the prefix and window properties skip it and
 * plan-lump-cut.property.test.ts covers it.
 */
export function splitsLumpDay(
  drawn: { readonly file: ExchangeFile; readonly plan: Plan; readonly entries: readonly Entry[] },
  part: readonly Movement[],
): boolean {
  const lumps = drawn.entries.filter(
    (entry) =>
      entry.deletedAt === null &&
      entry.kind === 'lump' &&
      compare(entry.amount as Money, partOf(drawn.plan, drawn.plan.monthlyAmount, entry.coin)) !== 0,
  );
  if (lumps.length === 0) return false;
  const inPart = new Set(part.map((movement) => movement.key));
  const groups = new Map<string, { all: number; inside: number }>();
  for (const movement of drawn.file.movements.filter((each) => each.role === 'purchase')) {
    const key = `${movement.coin}|${LISBON.dateOf(movement.at)}`;
    const group = groups.get(key) ?? { all: 0, inside: 0 };
    group.all += 1;
    if (inPart.has(movement.key)) group.inside += 1;
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.inside === 0 || group.inside === group.all) continue;
    const [coin, day] = key.split('|') as [string, CalendarDate];
    const near = (entry: Entry) => Math.abs(daysBetween(entry.date, day)) <= IMPORT_TYPED_DAYS;
    if (lumps.some((entry) => entry.coin === coin && near(entry))) return true;
  }
  return false;
}

const share = fc.record({ of: fc.constantFrom('lump', 'part'), tenths: fc.integer({ min: 1, max: 10 }) });
const near = fc.record({ of: fc.constantFrom('lump', 'lump', 'part'), tenths: fc.integer({ min: 1, max: 10 }) });
/** A `lump` near a date of its coin's purchases in two or three fills, and an export that cuts inside that date. */
export const lumpCut = fc.record({
  slot: fc.nat(),
  coin: planCoin,
  dayOff: fc.integer({ min: -3, max: 3 }),
  tapOff: fc.oneof(fc.constant(0), fc.integer({ min: -3, max: 3 })),
  size: fc.constantFrom('above', 'below', 'below', 'below', 'part'),
  times: fc.integer({ min: 2, max: 10 }),
  fills: fc.array(share, { minLength: 2, maxLength: 3 }),
  others: fc.array(fc.record({ off: fc.integer({ min: -3, max: 3 }), share: near }), { minLength: 1, maxLength: 3 }),
  side: fc.constantFrom('ends', 'begins', 'slice'),
  from: fc.nat(),
  to: fc.nat(),
  source: fc.constantFrom<Entry['source']>('one-tap', 'manual'),
});
type LumpCut = typeof lumpCut extends fc.Arbitrary<infer U> ? U : never;

/**
 * `drawn` with `cut`'s lump and purchases added, the cut date, and the export `cut` keeps: the movements up to a fill
 * of that date (`ends`), from one (`begins`), or a run of its fills alone (`slice`), never all of them. Null when the
 * plan has no due date past the first buy's 15 days.
 */
export function withLumpCut<W extends { file: ExchangeFile; plan: Plan; entries: Entry[] }>(drawn: W, cut: LumpCut) {
  const later = laterDues(drawn.plan);
  if (later.length === 0) return null;
  const day = addDays(later[cut.slot % later.length] as CalendarDate, cut.dayOff);
  const part = partOf(drawn.plan, drawn.plan.monthlyAmount, cut.coin);
  const tenth = (base: Money, tenths: number) => round(product<Money>(base, money(`${tenths / 10}`)), 2, 'half-up');
  const below = tenth(part, 1 + (cut.times % 5));
  const amount =
    cut.size === 'part' ? part : cut.size === 'above' ? product<Money>(part, money(`${cut.times}`)) : below;
  const of = (drawnShare: { of: string; tenths: number }) => {
    const value = tenth(drawnShare.of === 'lump' ? amount : part, drawnShare.tenths);
    return isPositive(value) ? value : money('0.01');
  };
  const movement = (index: number, at: string, value: Money): Movement => ({
    key: `poc-csv-1|kraken|LC-${index}|${cut.coin}|in`,
    lines: [4000 + 2 * index, 4001 + 2 * index],
    at: instant(at),
    role: 'purchase',
    coin: cut.coin,
    units: units(`0.00${index + 1}`),
    unitsCut: false,
    currency: 'EUR',
    amount: value,
    fee: money('0.10'),
    feeInCoin: false,
  });
  const hour = (index: number) => String(8 + 4 * index).padStart(2, '0');
  const fills = cut.fills.map((each, index) => movement(index, `${day}T${hour(index)}:00:00Z`, of(each)));
  const others = cut.others.map((each, index) =>
    movement(4 + index, `${addDays(day, each.off)}T10:00:00Z`, of(each.share)),
  );
  const lump = anEntry({
    id: testId(`cut-lump|${cut.coin}|${cut.tapOff}`),
    kind: 'lump',
    coin: cut.coin,
    slot: null,
    date: addDays(day, cut.tapOff),
    amount,
    units: units('0.0122'),
    source: cut.source,
    venue: 'Bitvavo',
  });
  const movements = [...drawn.file.movements, ...fills, ...others];
  const onDay = (each: Movement) =>
    each.coin === cut.coin && each.role === 'purchase' && LISBON.dateOf(each.at) === day;
  const sorted = movements
    .filter(onDay)
    .map((each) => each.at as string)
    .sort();
  const n = sorted.length;
  const [lo, hi] = [cut.from % n, cut.to % n].sort((a, b) => a - b) as [number, number];
  const keeps = (at: string) =>
    cut.side === 'ends'
      ? at <= (sorted[cut.from % (n - 1)] as string)
      : cut.side === 'begins'
        ? at >= (sorted[1 + (cut.from % (n - 1))] as string)
        : at >= (sorted[lo] as string) && at <= (sorted[lo === 0 && hi === n - 1 ? n - 2 : hi] as string);
  const kept = movements.filter((each) => keeps(each.at));
  const file = { ...drawn.file, rows: drawn.file.rows + 2 * (fills.length + others.length), movements };
  const shorter: ExchangeFile = { ...drawn.file, rows: 2 * kept.length, movements: kept, leftOut: [] };
  return { drawn: { ...drawn, file, entries: [...drawn.entries, lump] }, day, lump, part, shorter };
}

/** The cuts this test file's properties skipped as `splitsLumpDay` (each file runs in its own module scope). */
export const skipped = { cuts: 0 };

/**
 * Skips (`fc.pre`) and counts a cut at `splitsLumpDay`'s width, which can count a claimed date's purchases twice with
 * their estimates, or move a fallback hand claim (docs/DOMAIN.md §3.13 step 2's one exception);
 * plan-lump-cut.property.test.ts covers that width.
 */
export function preCut(drawn: Parameters<typeof splitsLumpDay>[0], part: readonly Movement[]) {
  const splits = splitsLumpDay(drawn, part);
  if (splits) skipped.cuts += 1;
  fc.pre(!splits);
}
