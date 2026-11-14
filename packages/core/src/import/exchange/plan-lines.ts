// The import's named months (docs/DOMAIN.md §3.13): the months still late after it that no purchase in the file counts
// for, and the one-tap estimates it leaves while a purchase of their calendar month counts for a month whose buy day is
// nearer. Each line names a state only where every sentence it shows holds.
import { IMPORT_TYPED_DAYS } from '../../constants';
import { type CalendarDate, daysBetween, type MonthKey, monthKey } from '../../dates/calendar';
import { actionsNow, isOpen, type SlotStatus } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import type { Entry } from '../../schema/entry';
import type { EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';

export type EstimateLeft = { readonly estimate: Entry; readonly date: CalendarDate; readonly countsFor: MonthKey };

/**
 * "A month is still late when it is late once the import's entries are stored, its due date lies within the file's
 * first and last dates, and no purchase of the plan's coins in the file counts for it, stored or not." The months are
 * named in the order the Log's Record opens them (`actionsNow`), up to the first open action that is not such a
 * month, so "record it in the Log" opens each named month in turn. `after` is the Log once the import is stored.
 */
export function stillLate(
  plan: Plan,
  after: readonly Entry[],
  today: CalendarDate,
  span: readonly [CalendarDate, CalendarDate] | null,
  counted: ReadonlySet<MonthKey>,
): MonthKey[] {
  if (span === null) return [];
  const named: MonthKey[] = [];
  for (const { slot, status, due } of actionsNow(plan, after, today).filter((action) => isOpen(action.status))) {
    if (slot === null || status !== 'late' || due < span[0] || due > span[1] || counted.has(slot)) break;
    named.push(slot);
  }
  return named;
}

/**
 * "A live one-tap estimate of C for S that the file does not replace is named with the earliest added monthly buy of C
 * dated in S's calendar month that counts for another month T by T's buy day: nearer than S's, and nearer than any
 * one-tap estimate of C for T." A buy that counts for T through T's own estimate is not named, since the line gives
 * the buy day as the reason; nor is an estimate for a month the plan no longer lists.
 */
export function estimatesLeft(
  groups: Iterable<{ readonly estimates: readonly Entry[]; readonly by: readonly EntityId[] }>,
  months: readonly SlotStatus[],
  added: readonly Entry[],
  taps: readonly Entry[],
): EstimateLeft[] {
  const dueOf = new Map(months.map((each) => [each.key, each.due]));
  const left: EstimateLeft[] = [];
  for (const { estimates, by } of groups) {
    const estimate = estimates[0] as Entry;
    const own = dueOf.get(estimate.slot as MonthKey);
    if (by.length > 0 || own === undefined) continue;
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
