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
import { abs, compare, type Money, minus, plus, sum, type Units } from '../../money/decimal';
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

const HAND = new Set<Entry['source']>(['manual', 'import-prototype', 'import-json']);

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

/**
 * "Hand monthly buys claim first: a live monthly buy of C for S claims C's purchase dates whose month is S, nearest
 * its target first, while each brings the sum nearer its amount; a monthly buy that claims nothing, and every other
 * hand-recorded purchase or sale, claims C's nearest date of the same role within 3 days of its own date." `known`
 * holds the file's purchase dates an earlier import stored, live or tombstoned. Sets `claimed` on the days it takes.
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
  const candidates = (coin: CoinId, slot: MonthKey) => {
    const byDate = new Map<CalendarDate, Candidate>();
    const purchases = (each: Day) =>
      each.coin === coin && each.role === 'purchase' && monthOf(coin, each.date) === slot;
    // The stored part of a date comes first, so a free part on the same date always joins it.
    for (const day of [...known, ...days.filter((each) => !each.claimed)].filter(purchases)) {
      const candidate = byDate.get(day.date);
      const free = day.claimed ? null : day;
      if (candidate === undefined) byDate.set(day.date, { date: day.date, amount: paid(day), free });
      else [candidate.amount, candidate.free] = [plus(candidate.amount, paid(day)), free];
    }
    return [...byDate.values()];
  };
  const hand = live
    .filter((each) => HAND.has(each.source) && each.kind !== 'held' && each.kind !== 'move')
    .sort(compareEntries);
  const rest: Entry[] = [];
  for (const entry of hand) {
    const slot = entry.slot;
    const target = slot !== null && monthOf(entry.coin, entry.date) === slot ? entry.date : null;
    const taken =
      slot === null ? [] : walk(candidates(entry.coin, slot), target ?? dueOf(plan, slot), entry.amount as Money);
    if (taken.length === 0) rest.push(entry);
    else record(entry, taken);
  }
  for (const entry of rest) {
    const role = entry.kind === 'sell' ? 'sale' : 'purchase';
    const free = days.filter((each) => !each.claimed && each.coin === entry.coin && each.role === role);
    const day = closest(free, entry.date, IMPORT_TYPED_DAYS);
    if (day !== null) record(entry, [day]);
  }
  return recorded.sort((a, b) => compareEntries(a.entry, b.entry));
}
