// The two steps of the exchange import's plan that leave purchases out before any month is filled (docs/DOMAIN.md
// §3.13): the starting amount (step 3) and the coins the person added (step 4).
import { IMPORT_MATCH_DAYS } from '../../constants';
import { addDays, type CalendarDate } from '../../dates/calendar';
import { isPositive, sum, type Units } from '../../money/decimal';
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
  readonly heldUnits: Units;
  readonly heldDate: CalendarDate;
  readonly heldVenue: string | null;
};

const within = (day: Day, from: CalendarDate, to: CalendarDate) => from <= day.date && day.date <= to;
export const near = (day: Day, date: CalendarDate, days: number) =>
  within(day, addDays(date, -days), addDays(date, days));

/**
 * Step 3: "In a plan with a starting amount above 0, the purchases dated within 15 days of `firstBuy` are left out and
 * named, since the file cannot tell the starting amount from the first monthly buy; a one-tap `lump` estimate is never
 * replaced." A date step 2 claimed is `looks recorded already` and is not counted here.
 */
export function startingGuard(plan: Plan, days: readonly Day[]) {
  if (!isPositive(plan.startingAmount)) return null;
  const guarded = days.filter(
    (day) => !day.claimed && day.role === 'purchase' && near(day, plan.firstBuy, IMPORT_MATCH_DAYS),
  );
  for (const day of guarded) day.claimed = true;
  const purchases = guarded.flatMap((day) => day.items).length;
  return purchases === 0 ? null : { purchases, firstBuy: plan.firstBuy };
}

/**
 * Step 4: "C's purchases and receipts dated on or before the latest live `held` entry of C, at any venue, are `may be
 * the coins you added`: left out unless the person ticks `Add these transactions too`, one answer for all of them." A
 * `held` entry an exchange import added (a receipt) is not one the person added, so it guards nothing.
 */
export function heldGuard(plan: Plan, live: readonly Entry[], days: readonly Day[], addHeld: boolean) {
  const coins: HeldCoin[] = [];
  for (const { id: coin } of plan.coins) {
    const own = live.filter((entry) => entry.kind === 'held' && entry.coin === coin && entry.source !== 'import-csv');
    const latest = own.sort(compareEntries).at(-1);
    if (latest === undefined) continue;
    const guarded = days.filter(
      (day) => !day.claimed && day.coin === coin && day.role !== 'sale' && day.date <= latest.date,
    );
    const items = guarded.flatMap((day) => day.items);
    if (items.length === 0) continue;
    for (const day of guarded) day.claimed = !addHeld;
    const units = sum(items.map((item) => item.movement.units));
    const [heldUnits, heldDate, heldVenue] = [latest.units, latest.date, latest.venue];
    coins.push({ coin, purchases: items.length, units, through: latest.date, heldUnits, heldDate, heldVenue });
  }
  return coins.length === 0 ? null : { added: addHeld, coins };
}
