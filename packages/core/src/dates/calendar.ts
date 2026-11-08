// The one calendar-date module (ADR-0018). Calendar dates are `YYYY-MM-DD` strings in the user's
// calendar; month keys are `YYYY-MM`. All arithmetic is integer arithmetic on days since 1970-01-01
// (proleptic Gregorian), so nothing here builds a Date, reads a clock or depends on a time zone.
// Deriving `today` from an instant and a zone is the shell's job (packages/app/src/lib/adapters/clock.ts).
import * as z from 'zod/mini';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
// An instant always carries its offset: 2026-10-16T08:00:00+01:00 or …Z (docs/DOMAIN.md §1).
const INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

const MIN_YEAR = 1;
const MAX_YEAR = 9999;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  const length = MONTH_LENGTHS[month - 1];
  if (length === undefined) throw new RangeError(`Month ${month} is not 1 to 12`);
  return length;
}

function isValidParts(year: number, month: number, day: number): boolean {
  return (
    year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  return match !== null && isValidParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function isValidMonthKey(value: string): boolean {
  const match = MONTH_PATTERN.exec(value);
  return match !== null && isValidParts(Number(match[1]), Number(match[2]), 1);
}

export function isValidInstant(value: string): boolean {
  const match = INSTANT_PATTERN.exec(value);
  return match?.[1] !== undefined && isValidCalendarDate(match[1]);
}

export const CalendarDateSchema = z
  .string()
  .check(z.refine(isValidCalendarDate, 'Expected a calendar date YYYY-MM-DD'))
  .brand<'CalendarDate'>();
export type CalendarDate = z.infer<typeof CalendarDateSchema>;

export const MonthKeySchema = z
  .string()
  .check(z.refine(isValidMonthKey, 'Expected a month YYYY-MM'))
  .brand<'MonthKey'>();
export type MonthKey = z.infer<typeof MonthKeySchema>;

export const InstantSchema = z
  .string()
  .check(z.refine(isValidInstant, 'Expected an ISO 8601 instant with an offset'))
  .brand<'Instant'>();
export type Instant = z.infer<typeof InstantSchema>;

export type DateParts = { readonly year: number; readonly month: number; readonly day: number };

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** Builds a date from its parts; an impossible date is a programmer error. */
export function calendarDate(year: number, month: number, day: number): CalendarDate {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !isValidParts(year, month, day)
  ) {
    throw new RangeError(`${year}-${month}-${day} is not a calendar date`);
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as CalendarDate;
}

export function parseCalendarDate(value: string): CalendarDate | null {
  return isValidCalendarDate(value) ? (value as CalendarDate) : null;
}

export function parseMonthKey(value: string): MonthKey | null {
  return isValidMonthKey(value) ? (value as MonthKey) : null;
}

export function dateParts(date: CalendarDate): DateParts {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

// Howard Hinnant's days_from_civil / civil_from_days: exact on the proleptic Gregorian calendar.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): DateParts {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Days since 1970-01-01. */
export function epochDay(date: CalendarDate): number {
  const { year, month, day } = dateParts(date);
  return daysFromCivil(year, month, day);
}

export function fromEpochDay(days: number): CalendarDate {
  const { year, month, day } = civilFromDays(days);
  return calendarDate(year, month, day);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromEpochDay(epochDay(date) + days);
}

/** `to − from` in whole days; no DST effect exists because calendar dates have no time. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return epochDay(to) - epochDay(from);
}

/** The date in the target month with the day clamped to that month's length. */
export function clampDay(year: number, month: number, day: number): CalendarDate {
  return calendarDate(year, month, Math.min(day, daysInMonth(year, month)));
}

/**
 * Moves by whole months and clamps the day. The anchor (the plan's buy day, or the original day)
 * is kept separately, so 31 Jan → 28 Feb → 31 Mar rather than drifting to 28 Mar.
 */
export function addMonthsClamped(date: CalendarDate, months: number, anchorDay?: number): CalendarDate {
  const { year, month, day } = dateParts(date);
  const index = year * 12 + (month - 1) + months;
  return clampDay(Math.floor(index / 12), (index % 12) + 1, anchorDay ?? day);
}

/** Moves by whole years; 29 February becomes 28 February in a common year. */
export function addYearsClamped(date: CalendarDate, years: number): CalendarDate {
  const { year, month, day } = dateParts(date);
  return clampDay(year + years, month, day);
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 7)}-01` as CalendarDate;
}

export function monthKey(date: CalendarDate): MonthKey {
  return date.slice(0, 7) as MonthKey;
}

export function monthStart(key: MonthKey): CalendarDate {
  return `${key}-01` as CalendarDate;
}

export function addMonthsToKey(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonthsClamped(monthStart(key), months));
}

/** Calendar order; ISO strings sort like the dates they name. */
export function compareDates<T extends CalendarDate | MonthKey>(a: T, b: T): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function minDate(first: CalendarDate, ...rest: CalendarDate[]): CalendarDate {
  return rest.reduce((min, date) => (date < min ? date : min), first);
}

export function maxDate(first: CalendarDate, ...rest: CalendarDate[]): CalendarDate {
  return rest.reduce((max, date) => (date > max ? date : max), first);
}

/**
 * Orders two instants by the moment they name, whatever their offsets: 10:00+02:00 is before 09:00Z.
 * Integer arithmetic on the parts, so no Date is built; sub-millisecond digits break exact ties.
 */
export function compareInstants(a: Instant, b: Instant): -1 | 0 | 1 {
  const [msA, fractionA] = instantParts(a);
  const [msB, fractionB] = instantParts(b);
  if (msA !== msB) return msA < msB ? -1 : 1;
  if (fractionA === fractionB) return 0;
  return fractionA < fractionB ? -1 : 1;
}

function instantParts(value: Instant): [number, string] {
  const match = INSTANT_PATTERN.exec(value);
  if (match === null) throw new RangeError(`${value} is not an instant`);
  const [date = '', time = ''] = value.split('T');
  const [hours = 0, minutes = 0] = time.slice(0, 5).split(':').map(Number);
  const seconds = match[3] === undefined ? 0 : Number(match[3].slice(1, 3));
  const digits = (match[4] ?? '.').slice(1).padEnd(9, '0');
  // The pattern guarantees a zone at the end: Z or ±HH:MM.
  const zone = value.endsWith('Z') ? 'Z' : value.slice(-6);
  const offsetMinutes =
    zone === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const minutesOfDay = hours * 60 + minutes - offsetMinutes;
  const ms =
    ((epochDay(date as CalendarDate) * 1440 + minutesOfDay) * 60 + seconds) * 1000 + Number(digits.slice(0, 3));
  return [ms, digits.slice(3)];
}

/**
 * `now` when it is later than every one of `stored`, else one millisecond after the latest of them, so a write
 * over a stored row wins whatever this device's clock says (ADR-0021: only a strictly later write wins).
 */
export function stampAfter(now: Instant, ...stored: readonly Instant[]): Instant {
  if (stored.every((stamp) => compareInstants(now, stamp) > 0)) return now;
  const latest = stored.reduce((max, stamp) => (compareInstants(stamp, max) > 0 ? stamp : max));
  return instantFromEpochMs(instantParts(latest)[0] + 1);
}

const DAY_MS = 86_400_000;

/**
 * Milliseconds since 1970-01-01T00:00Z (the prototype's timestamps, §7) as a UTC instant, by integer
 * arithmetic; a value that is not a whole number is a programmer error.
 */
export function instantFromEpochMs(ms: number): Instant {
  if (!Number.isSafeInteger(ms)) throw new RangeError(`${ms} is not a whole number of milliseconds`);
  const day = Math.floor(ms / DAY_MS);
  const rest = ms - day * DAY_MS;
  const time = [Math.floor(rest / 3_600_000), Math.floor(rest / 60_000) % 60, Math.floor(rest / 1000) % 60];
  return `${fromEpochDay(day)}T${time.map((part) => pad(part, 2)).join(':')}.${pad(rest % 1000, 3)}Z` as Instant;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. 1970-01-01 was a Thursday. */
export function weekday(date: CalendarDate): number {
  return ((((epochDay(date) + 3) % 7) + 7) % 7) + 1;
}
