import { addDays, addMonthsClamped, type CalendarDate, dateParts, maxDate, minDate } from '@proofofcalm/core';

// The simulator's default dates (docs/EDUCATION.md §7): mechanical, editable, and taken from the chosen coins'
// closes alone. The start-date table runs the same plan from each of the 11 months before the start and the
// start itself (startDateSensitivity), so a start 11 months into the closes fills all 12 of its rows.

/** The first and the last day with a close, of one coin's history. */
export type ClosesRange = { readonly first: CalendarDate; readonly last: CalendarDate };

export type DefaultWindow = {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  /** The latest first close among the coins: the earliest start the core accepts. */
  readonly first: CalendarDate;
  /** The earliest last close among the coins: the latest end the core accepts. */
  readonly last: CalendarDate;
};

const MONTHS_BEFORE = 11;
const YEAR = 12;

/**
 * The earliest date whose date 11 months earlier is on or after `first`. 11 months after `first` is never too
 * late, and is short only when its month clamps the day (the 29th to the 31st), so a few days decide it.
 */
function tableStart(first: CalendarDate): CalendarDate {
  let start = addMonthsClamped(first, MONTHS_BEFORE);
  while (addMonthsClamped(start, -MONTHS_BEFORE) < first) start = addDays(start, 1);
  return start;
}

/**
 * The default start and end for coins with these closes: the end is the earliest last close; the start is the
 * table's start while a year from it ends by then, else the latest first close. Null with no coin, or when the
 * coins share no day of closes.
 */
export function defaultWindow(ranges: readonly ClosesRange[]): DefaultWindow | null {
  const [head, ...rest] = ranges;
  if (head === undefined) return null;
  const first = maxDate(head.first, ...rest.map((range) => range.first));
  const last = minDate(head.last, ...rest.map((range) => range.last));
  if (last < first) return null;
  const table = tableStart(first);
  const start = addMonthsClamped(table, YEAR) <= last ? table : first;
  return { start, end: last, first, last };
}

/** The start's day of the month, the buy day the core accepts: the 29th to the 31st give 28. */
export function buyDayFor(start: CalendarDate): number {
  return Math.min(dateParts(start).day, 28);
}
