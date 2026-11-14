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
import { LISBON } from './plan-fixture';

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
 * both): such a cut can change which date the lump claims. That is docs/DOMAIN.md §3.13 step 2's one exception ("but
 * one exception"), at this width: above the part, the cut date's stored part is then claimed whole (W2, 1,700 against
 * 1,400); below it, the cut part is claimed and the date the whole file's lump claims was stored (2,550 against
 * 2,450). The prefix and window properties skip it.
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

/** The cuts this test file's properties skipped as `splitsLumpDay` (each file runs in its own module scope). */
export const skipped = { cuts: 0 };

/**
 * Skips (`fc.pre`) docs/DOMAIN.md §3.13 step 2's one exception, as `splitsLumpDay` states it: any cut inside a purchase
 * date near a `lump` not of the monthly part, on either side (a prefix, a suffix or a middle slice), and counts it.
 */
export function preCut(drawn: Parameters<typeof splitsLumpDay>[0], part: readonly Movement[]) {
  const splits = splitsLumpDay(drawn, part);
  if (splits) skipped.cuts += 1;
  fc.pre(!splits);
}
