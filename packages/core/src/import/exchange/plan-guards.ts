// The two steps of the exchange import's plan that leave purchases out before any month is filled (docs/DOMAIN.md
// §3.13): the starting amount (step 3) and the coins the person added (step 4).
import { IMPORT_MATCH_DAYS } from '../../constants';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { compare, isPositive, isZero, sum, type Units } from '../../money/decimal';
import { compareEntries } from '../../portfolio/lots';
import type { Entry } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { Movement } from './kraken';

type Item = {
  readonly movement: Movement;
  readonly id: EntityId;
  readonly date: CalendarDate;
  readonly coin: CoinId;
};

/** One date of a coin's purchases, sales or receipts: what the steps claim, with all its movements. */
export type Day = {
  readonly coin: CoinId;
  readonly role: Movement['role'];
  readonly date: CalendarDate;
  readonly items: Item[];
  claimed: boolean;
};

export type HeldCoin = {
  readonly coin: CoinId;
  readonly purchases: number;
  readonly units: Units;
  readonly through: CalendarDate;
  /** Every entry that guards a date, oldest first: the latest is `through`. */
  readonly entries: readonly { readonly units: Units; readonly date: CalendarDate; readonly venue: string | null }[];
};

const within = (day: Day, from: CalendarDate, to: CalendarDate) => from <= day.date && day.date <= to;
export const near = (day: Day, date: CalendarDate, days: number) =>
  within(day, addDays(date, -days), addDays(date, days));

/**
 * Step 3: "In a plan with a starting amount above 0, or for a coin with a live `lump`, C's purchases dated on or before
 * `firstBuy` + 15 days that step 2 left are left out and named, however long before `firstBuy` they are: the file
 * cannot tell the starting amount from them. A one-tap `lump` is never replaced."
 */
export function startingGuard(plan: Plan, live: readonly Entry[], days: readonly Day[]) {
  const through = addDays(plan.firstBuy, IMPORT_MATCH_DAYS);
  const lumps = new Set(live.filter((entry) => entry.kind === 'lump').map((entry) => entry.coin));
  const guarded = days.filter(
    (day) =>
      !day.claimed &&
      day.role === 'purchase' &&
      day.date <= through &&
      (isPositive(plan.startingAmount) || lumps.has(day.coin)),
  );
  for (const day of guarded) day.claimed = true;
  const purchases = guarded.flatMap((day) => day.items).length;
  return purchases === 0 ? null : { purchases, firstBuy: plan.firstBuy, through };
}

/**
 * Step 4: "Each live hand `held` entry of C guards C's purchase dates on or before its date that hold a purchase of at
 * most its units, unless its cost is 0, and C's receipt dates on or before its date that hold a receipt of at most its
 * units, whatever its cost. The dates any such entry guards are `may be the coins you added`, one answer for all. A
 * `held` entry an exchange import added guards nothing." The line names every entry that guards a date, in the Log's
 * order: every date guarded is on or before the latest.
 */
export function heldGuard(plan: Plan, live: readonly Entry[], days: readonly Day[], addHeld: boolean) {
  const coins: HeldCoin[] = [];
  for (const { id: coin } of plan.coins) {
    const own = live.filter((entry) => entry.kind === 'held' && entry.coin === coin && entry.source !== 'import-csv');
    const guards = (entry: Entry, day: Day, item: Item) =>
      day.date <= entry.date &&
      (day.role === 'receipt' || (day.role === 'purchase' && !(entry.amount !== null && isZero(entry.amount)))) &&
      compare(item.movement.units, entry.units) <= 0;
    const items: Item[] = [];
    const guarding = new Set<Entry>();
    for (const day of days.filter((each) => !each.claimed && each.coin === coin)) {
      const held = day.items.filter((item) => {
        const by = own.filter((entry) => guards(entry, day, item));
        for (const entry of by) guarding.add(entry);
        return by.length > 0;
      });
      items.push(...held);
      if (addHeld || held.length === 0) continue;
      // Left out, a guarded movement leaves its date's other movements to the later steps.
      day.items.splice(0, day.items.length, ...day.items.filter((item) => !held.includes(item)));
      day.claimed = day.items.length === 0;
    }
    const entries = [...guarding].sort(compareEntries).map(({ units, date, venue }) => ({ units, date, venue }));
    const latest = entries.at(-1);
    if (latest === undefined) continue;
    const units = sum(items.map((item) => item.movement.units));
    coins.push({ coin, purchases: items.length, units, through: latest.date, entries });
  }
  return coins.length === 0 ? null : { added: addHeld, coins };
}
