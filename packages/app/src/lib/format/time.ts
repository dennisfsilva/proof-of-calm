// Instants as times and days in the device's zone, and calendar days relative to today, through Intl only
// (docs/DESIGN.md §5, docs/CONTENT-STYLE.md §3–4). The clock face (09:05, or 9:05 AM) follows the
// formatting locale; a zone's name, relative phrases and a day's month name are words, so they follow the
// UI language (ADR-0023).
import { type CalendarDate, daysBetween, type Instant } from '@proofofcalm/core';
import { epochMs } from '../adapters/clock';
import { LATIN_DIGITS } from './digits';

export type TimeFormatters = {
  /**
   * `14:05` in `timeZone`. With `now`, the zone's name joins the time (`14:05 WEST`) when the zone's UTC
   * offset at the instant differs from its offset now: the clocks have changed since, so the bare time
   * would read an hour off against the clock on the wall.
   */
  time(instant: Instant, timeZone: string, now?: Instant): string;
  /** `16 Oct 2026`: the instant's calendar day in `timeZone`, written like `date` (`dateOptions`). */
  instantDate(instant: Instant, timeZone: string): string;
  /** `15 days ago`, `yesterday`, `today`, `in 3 days`: `date` seen from `today`. */
  relativeDays(date: CalendarDate, today: CalendarDate): string;
};

/**
 * A date in copy: the day, the month's name and the year in the UI language (`4 Mar 2028`, `4. März
 * 2028`), so no date reads two ways across countries (ADR-0023, corrections of 2026-10-20). Where
 * CLDR's short month is digits (pt-PT: `4/03/2028`), the long name (`4 de março de 2028`).
 */
export function dateOptions(uiLocale: string): Intl.DateTimeFormatOptions {
  const short = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  const digits = new Intl.DateTimeFormat(uiLocale, { ...LATIN_DIGITS, ...short })
    .formatToParts(0)
    .some((part) => part.type === 'month' && /^\d+$/.test(part.value));
  return digits ? { ...short, month: 'long' } : short;
}

/** A date in copy never breaks across lines (docs/CONTENT-STYLE.md §4): its spaces become no-break spaces. */
export const unbroken = (text: string) => text.replaceAll(' ', '\u00a0');

export function createTimeFormatters(formattingLocale: string, uiLocale: string): TimeFormatters {
  const formats = new Map<string, Intl.DateTimeFormat>();
  const cached = (key: string, options: Intl.DateTimeFormatOptions, locale = formattingLocale) => {
    let format = formats.get(key);
    if (format === undefined) {
      format = new Intl.DateTimeFormat(locale, { ...LATIN_DIGITS, ...options });
      formats.set(key, format);
    }
    return format;
  };
  const hour = hourStyle(formattingLocale);
  const face = (timeZone: string, zone: boolean) =>
    cached(`face ${timeZone} ${zone}`, {
      timeZone,
      hour,
      minute: '2-digit',
      ...(zone ? { timeZoneName: 'short' } : {}),
    });
  const part = (format: Intl.DateTimeFormat, ms: number) =>
    format.formatToParts(ms).find((candidate) => candidate.type === 'timeZoneName')?.value;
  const offset = (timeZone: string, ms: number) =>
    part(cached(`offset ${timeZone}`, { timeZone, timeZoneName: 'longOffset' }, 'en'), ms);
  const zoneName = (timeZone: string, ms: number) =>
    part(cached(`name ${timeZone}`, { timeZone, timeZoneName: 'short' }, uiLocale), ms);
  const relative = new Intl.RelativeTimeFormat(uiLocale, { ...LATIN_DIGITS, numeric: 'auto' });
  // dateOptions builds a formatter to read the locale's month, so it is read once, not per day written.
  const day = dateOptions(uiLocale);

  return {
    time(instant, timeZone, now) {
      const ms = epochMs(instant);
      if (now === undefined || offset(timeZone, ms) === offset(timeZone, epochMs(now))) {
        return face(timeZone, false).format(ms);
      }
      const name = zoneName(timeZone, ms);
      return face(timeZone, true)
        .formatToParts(ms)
        .map((candidate) => (candidate.type === 'timeZoneName' && name !== undefined ? name : candidate.value))
        .join('');
    },
    instantDate: (instant, timeZone) =>
      unbroken(cached(`day ${timeZone}`, { timeZone, ...day }, uiLocale).format(epochMs(instant))),
    relativeDays: (date, today) => relative.format(daysBetween(today, date), 'day'),
  };
}

/** The locale's own short time pattern decides between 09:05 (en-GB, de-DE, pt-PT) and 9:05 AM (en-US). */
function hourStyle(locale: string): '2-digit' | 'numeric' {
  const hour = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' })
    .formatToParts(Date.UTC(2000, 0, 1, 9, 5))
    .find((part) => part.type === 'hour');
  return hour?.value.length === 2 ? '2-digit' : 'numeric';
}
