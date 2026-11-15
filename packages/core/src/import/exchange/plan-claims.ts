// Step 2 of the exchange import's plan (docs/DOMAIN.md §3.13): the purchases and sales of the file that an entry the
// person recorded by hand records already. First, so no later step stores what a hand entry records.
import { IMPORT_TYPED_DAYS } from '../../constants';
import {
  type CalendarDate,
  clampDay,
  compareDates,
  dateParts,
  daysBetween,
  type MonthKey,
  monthKey,
  monthStart,
} from '../../dates/calendar';
import { abs, compare, type Money, minus, plus, product, sum, type Units } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { compareEntries } from '../../portfolio/lots';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import { type Day, near } from './plan-guards';

export type Recorded = {
  /** Every date the entry claims, ascending. */
  readonly dates: readonly CalendarDate[];
  readonly coin: CoinId;
  readonly units: Units;
  readonly amount: Money | null;
  readonly count: number;
  readonly entry: Entry;
};

/** The plan month a purchase date of a coin belongs to (step 6's rule), or none. */
export type MonthOf = (coin: CoinId, date: CalendarDate) => MonthKey | undefined;

export const HAND = new Set<Entry['source']>(['manual', 'import-prototype', 'import-json']);

/** The due date of a plan month, as `slots` gives it, for any month key. */
function dueOf(plan: Plan, key: MonthKey): CalendarDate {
  const { year, month } = dateParts(monthStart(key));
  return key === monthKey(plan.firstBuy) ? plan.firstBuy : clampDay(year, month, plan.buyDay);
}

/** The unclaimed day nearest `date` within `span` days of it, the earlier on a tie (days are in date order). */
function closest(days: readonly Day[], date: CalendarDate, span: number) {
  let best: Day | null = null;
  for (const day of days) {
    if (!near(day, date, span)) continue;
    if (best === null || Math.abs(daysBetween(date, day.date)) < Math.abs(daysBetween(date, best.date))) best = day;
  }
  return best;
}

/** A purchase date of the file: all its movements' amount, and the part no earlier import stored, if any. */
type Candidate = { readonly date: CalendarDate; amount: Money; free: Day | null };

/**
 * "Order C's purchase dates whose month is S by nearness to the target, the earlier on a tie; take the nearest, then
 * each next date while it brings the sum nearer the entry's amount." A date stored by an earlier import takes its
 * place in the order and the sum but is never claimed.
 */
function walk(candidates: readonly Candidate[], target: CalendarDate, amount: Money): Day[] {
  const off = (each: Candidate) => Math.abs(daysBetween(target, each.date));
  const order = [...candidates].sort((a, b) => off(a) - off(b) || compareDates(a.date, b.date));
  const taken: Day[] = [];
  let total: Money | null = null;
  for (const candidate of order) {
    const next: Money = total === null ? candidate.amount : plus(total, candidate.amount);
    if (total !== null && compare(abs(minus(next, amount)), abs(minus(total, amount))) >= 0) break;
    total = next;
    if (candidate.free !== null) taken.push(candidate.free);
  }
  return taken;
}

const paid = (day: Day) => sum(day.items.map((item) => item.movement.amount as Money));

/** True when `amount` is at least as near `target` as the coin's monthly `part` (a tie counts): d*'s test (§3.13 step 3). */
export const nearTarget = (amount: Money, target: Money, part: Money) =>
  compare(abs(minus(amount, target)), abs(minus(amount, part))) <= 0;

/**
 * A `lump`'s gate in step 2: a date's amount `a` is as near the lump's `A` as the coin's monthly part `p` or nearer, as
 * a ratio: a x a at least A x p when A is above p, at most when A is below p, every date when A equals p.
 */
function asNear(a: Money, A: Money, p: Money) {
  const side = compare(A, p);
  const square = compare(product<Money>(a, a), product<Money>(A, p));
  return side === 0 || (side > 0 ? square >= 0 : square <= 0);
}

/**
 * "Hand monthly buys claim first: a live monthly buy of C for S claims C's purchase dates whose month is S, nearest
 * its target first, while each brings the sum nearer its amount; a monthly buy whose month has no date, and every other
 * hand-recorded purchase or sale, claims C's nearest date of the same role within 3 days of its own date." A `lump`,
 * hand or one-tap, walks instead: C's purchase dates within 3 days of its date that no hand monthly buy or earlier entry
 * claimed and that pass `asNear`, nearest its date first, while each brings the sum nearer its amount. `known` holds
 * the file's purchase dates an earlier import stored, live or tombstoned: they take their place in a walk's order and
 * sum but are never claimed. Sets `claimed` on the days it takes.
 */
export function claimRecorded(
  plan: Plan,
  live: readonly Entry[],
  days: readonly Day[],
  known: readonly Day[],
  monthOf: MonthOf,
): Recorded[] {
  const recorded: Recorded[] = [];
  const record = (entry: Entry, taken: readonly Day[]) => {
    for (const day of taken) day.claimed = true;
    const items = taken.flatMap((day) => day.items);
    const dates = taken.map((day) => day.date).sort(compareDates);
    const units = sum(items.map((item) => item.movement.units));
    const amount = sum(items.map((item) => item.movement.amount as Money));
    recorded.push({ dates, coin: entry.coin, units, amount, count: items.length, entry });
  };
  const inMonth = (coin: CoinId, slot: MonthKey) => (each: Day) =>
    each.coin === coin && each.role === 'purchase' && monthOf(coin, each.date) === slot;
  const candidates = (purchases: (day: Day) => boolean) => {
    const byDate = new Map<CalendarDate, Candidate>();
    // The stored part of a date comes first, so a free part on the same date always joins it.
    for (const day of [...known, ...days.filter((each) => !each.claimed)].filter(purchases)) {
      const candidate = byDate.get(day.date);
      const free = day.claimed ? null : day;
      if (candidate === undefined) byDate.set(day.date, { date: day.date, amount: paid(day), free });
      else [candidate.amount, candidate.free] = [plus(candidate.amount, paid(day)), free];
    }
    return [...byDate.values()];
  };
  // A live one-tap `lump` claims here too, within 3 days of its date and by its amount, and no later step
  // replaces it.
  const hand = live
    .filter(
      (each) =>
        (HAND.has(each.source) || (each.kind === 'lump' && each.source === 'one-tap')) &&
        each.kind !== 'held' &&
        each.kind !== 'move',
    )
    .sort(compareEntries);
  const rest: Entry[] = [];
  for (const entry of hand) {
    const slot = entry.slot;
    // Only a monthly buy whose month has no purchase date of its coin in the file, stored, claimed or free, falls back:
    // one that walks through stored dates alone claims nothing, since part of the file can claim a date the whole file
    // walks past, and one whose dates an earlier entry claimed claims nothing either, so neither depends on the other.
    if (slot === null || ![...known, ...days].some(inMonth(entry.coin, slot))) {
      rest.push(entry);
      continue;
    }
    const month = candidates(inMonth(entry.coin, slot));
    const target = monthOf(entry.coin, entry.date) === slot ? entry.date : dueOf(plan, slot);
    const taken = walk(month, target, entry.amount as Money);
    if (taken.length > 0) record(entry, taken);
  }
  const parts = plannedParts(plan, plan.monthlyAmount);
  // A date an entry claimed is out of a lump's walk whole, its stored part too.
  const busy = (day: Day) =>
    days.some((each) => each.claimed && each.coin === day.coin && each.role === day.role && each.date === day.date);
  for (const entry of rest) {
    const role = entry.kind === 'sell' ? 'sale' : 'purchase';
    if (entry.kind === 'lump') {
      const amount = entry.amount as Money;
      const part = parts.find((each) => each.coin === entry.coin)?.amount ?? ('0' as Money);
      const nearby = candidates(
        (day) => day.coin === entry.coin && day.role === role && near(day, entry.date, IMPORT_TYPED_DAYS) && !busy(day),
      );
      const taken = walk(
        nearby.filter((each) => asNear(each.amount, amount, part)),
        entry.date,
        amount,
      );
      if (taken.length > 0) record(entry, taken);
      continue;
    }
    const free = days.filter((each) => !each.claimed && each.coin === entry.coin && each.role === role);
    const day = closest(free, entry.date, IMPORT_TYPED_DAYS);
    if (day !== null) record(entry, [day]);
  }
  return recorded.sort((a, b) => compareEntries(a.entry, b.entry));
}
