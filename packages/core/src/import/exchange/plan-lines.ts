// The import's estimates left (docs/DOMAIN.md §3.13): the one-tap estimates it leaves while a purchase of their calendar
// month counts for a month whose buy day is nearer. The line names a state only where every sentence it shows holds.
import { IMPORT_TYPED_DAYS } from '../../constants';
import { type CalendarDate, daysBetween, type MonthKey, monthKey } from '../../dates/calendar';
import type { SlotStatus } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import type { Entry } from '../../schema/entry';
import type { EntityId } from '../../schema/ids';
import { byHand } from './plan-claims';

export type EstimateLeft = { readonly estimate: Entry; readonly date: CalendarDate; readonly countsFor: MonthKey };

/**
 * "A live one-tap estimate of C for S that the file does not replace is named with the earliest added monthly buy of C
 * dated in S's calendar month that counts for another month T by T's buy day: nearer than S's, and nearer than any
 * one-tap estimate of C for T." A buy that counts for T through T's own estimate is not named, since the line gives
 * the buy day as the reason; nor is an estimate for a month the plan no longer lists, nor one whose month holds a live
 * hand monthly buy of C, since step 2's claim would take the date the line names before the estimate could. `live` is
 * the Log as it is now.
 */
export function estimatesLeft(
  groups: Iterable<{ readonly estimates: readonly Entry[]; readonly by: readonly EntityId[] }>,
  months: readonly SlotStatus[],
  added: readonly Entry[],
  taps: readonly Entry[],
  live: readonly Entry[],
): EstimateLeft[] {
  const dueOf = new Map(months.map((each) => [each.key, each.due]));
  const hand = new Set(live.filter((each) => each.kind === 'dca' && byHand(each)).map((e) => `${e.coin}|${e.slot}`));
  const left: EstimateLeft[] = [];
  for (const { estimates, by } of groups) {
    const estimate = estimates[0] as Entry;
    const own = dueOf.get(estimate.slot as MonthKey);
    if (by.length > 0 || own === undefined || hand.has(`${estimate.coin}|${estimate.slot}`)) continue;
    const nearer = (entry: Entry) => {
      const away = Math.abs(daysBetween(dueOf.get(entry.slot as MonthKey) as CalendarDate, entry.date));
      const typed = taps.some((tap) => {
        const off = daysBetween(tap.date, entry.date);
        const reaches = off >= -IMPORT_TYPED_DAYS && off <= 1;
        return tap.coin === entry.coin && tap.slot === entry.slot && reaches && Math.abs(off) < away;
      });
      return away < Math.abs(daysBetween(own, entry.date)) && !typed;
    };
    const [buy] = added
      .filter((entry) => entry.kind === 'dca' && entry.coin === estimate.coin && entry.slot !== estimate.slot)
      .filter((entry) => monthKey(entry.date) === estimate.slot && nearer(entry))
      .sort(compareEntries);
    if (buy !== undefined) left.push({ estimate, date: buy.date, countsFor: buy.slot as MonthKey });
  }
  return left;
}
