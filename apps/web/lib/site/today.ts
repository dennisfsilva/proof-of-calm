import { type CalendarDate, fromEpochDay, parseCalendarDate } from '@proofofcalm/core';

const DAY_MS = 86_400_000;

/**
 * The day the public pages are rendered at (their review lines): the UTC date of `now`, or `SITE_TODAY`, which the
 * e2e and snapshot builds pin so no test or baseline changes on the day a review date passes (ADR-0045 Deviations
 * of 2026-11-15). A value that is not a real calendar date stops the build.
 */
export function siteToday(value: string | undefined, now: Date): CalendarDate {
  if (value === undefined) return fromEpochDay(Math.floor(now.getTime() / DAY_MS));
  const today = parseCalendarDate(value);
  if (today === null) throw new Error(`SITE_TODAY is ${JSON.stringify(value)}, not a calendar date YYYY-MM-DD`);
  return today;
}
