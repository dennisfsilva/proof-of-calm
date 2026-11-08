// The Clock adapter (ADR-0018, ADR-0042): the one place that turns the device clock into a calendar date,
// in the user's IANA timezone, from Intl's date parts, never from a formatted string.
import { type CalendarDate, type Instant, instantFromEpochMs, parseCalendarDate } from '@proofofcalm/core';
import type { Clock } from '../ports';

// The instant pattern of the core (docs/DOMAIN.md §1), with the parts that differ from the one form every
// engine must parse: seconds may be missing and the fraction may have one to nine digits.
const INSTANT_PARTS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Milliseconds since 1970-01-01T00:00Z. The instant is rewritten to ECMA-262's Date Time String Format
 * (seconds and exactly three fraction digits) first, because other spellings parse differently from one
 * browser to the next. Digits below the millisecond are dropped; a malformed instant is a programmer error.
 */
export function epochMs(instant: Instant): number {
  const match = INSTANT_PARTS.exec(instant);
  const ms = match === null ? Number.NaN : Date.parse(canonical(match));
  if (Number.isNaN(ms)) throw new RangeError(`${instant} is not an instant`);
  return ms;
}

function canonical([, minutes, seconds = '00', fraction = '', zone]: RegExpExecArray): string {
  return `${minutes}:${seconds}.${fraction.padEnd(3, '0').slice(0, 3)}${zone}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar date at `instantMs` in `timeZone`. An unknown zone throws RangeError, as Intl does. */
export function todayIn(instantMs: number, timeZone: string): CalendarDate {
  const parts = formatterFor(timeZone).formatToParts(instantMs);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  const date = parseCalendarDate(`${part('year')}-${part('month')}-${part('day')}`);
  if (date === null) throw new RangeError(`No calendar date for ${instantMs} in ${timeZone}`);
  return date;
}

/** The device's own zone, or UTC where the runtime cannot name one. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

type Languages = { readonly languages?: readonly string[]; readonly language?: string };

/**
 * What the country suggestion reads (docs/JURISDICTIONS.md §3, never an IP address): the device's
 * languages in order and its zone, or null where the runtime names none.
 */
export function deviceLocale(
  device: Languages | undefined = globalThis.navigator,
  zone: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): { readonly languages: readonly string[]; readonly timeZone: string | null } {
  const languages = device?.languages?.length ? device.languages : device?.language ? [device.language] : [];
  return { languages: [...languages], timeZone: zone() || null };
}

/**
 * The system clock in `timeZone`; `currentMs` is injectable for tests and Storybook. `now()` is strictly
 * increasing per clock (at least 1 ms after its previous answer), so a write queued behind a read in the
 * same millisecond stamps a later moment and `backupNeeded` sees it (ADR-0042, Readings).
 */
export function systemClock(timeZone: string = deviceTimeZone(), currentMs: () => number = Date.now): Clock {
  let last = Number.NEGATIVE_INFINITY;
  return {
    timeZone,
    now: () => {
      last = Math.max(currentMs(), last + 1);
      return instantFromEpochMs(last);
    },
    today: () => todayIn(currentMs(), timeZone),
  };
}
