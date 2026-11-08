import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  addMonthsToKey,
  addYearsClamped,
  type CalendarDate,
  CalendarDateSchema,
  calendarDate,
  clampDay,
  compareDates,
  compareInstants,
  dateParts,
  daysBetween,
  daysInMonth,
  epochDay,
  fromEpochDay,
  type Instant,
  InstantSchema,
  instantFromEpochMs,
  isLeapYear,
  isValidCalendarDate,
  isValidInstant,
  isValidMonthKey,
  type MonthKey,
  MonthKeySchema,
  maxDate,
  minDate,
  monthKey,
  monthStart,
  parseCalendarDate,
  parseMonthKey,
  stampAfter,
  startOfMonth,
  weekday,
} from './calendar';

const d = (value: string) => value as CalendarDate;
const k = (value: string) => value as MonthKey;

describe('leap years (docs/DOMAIN.md §8)', () => {
  it('2024 and 2028 are leap years, 2100 is not, 2000 is', () => {
    expect([2023, 2024, 2028, 2100, 2000].map(isLeapYear)).toEqual([false, true, true, false, true]);
  });

  it('gives February its length', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('rejects a month outside 1 to 12', () => {
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
  });
});

describe('validation', () => {
  it.each([
    ['2026-10-16', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2100-02-29', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-04-31', false],
    ['0000-01-01', false],
    ['0001-01-01', true],
    ['9999-12-31', true],
    ['2026-1-1', false],
    ['2026-10-16T00:00:00Z', false],
    ['', false],
  ])('calendar date %s → %s', (value, valid) => {
    expect(isValidCalendarDate(value)).toBe(valid);
    expect(CalendarDateSchema.safeParse(value).success).toBe(valid);
  });

  it.each([
    ['2026-10', true],
    ['2026-00', false],
    ['2026-13', false],
    ['2026-1', false],
    ['2026-10-01', false],
  ])('month key %s → %s', (value, valid) => {
    expect(isValidMonthKey(value)).toBe(valid);
    expect(MonthKeySchema.safeParse(value).success).toBe(valid);
  });

  it.each([
    ['2026-10-16T08:00:00+01:00', true],
    ['2026-10-16T08:00:00Z', true],
    ['2026-10-16T08:00Z', true],
    ['2026-10-16T23:59:59.123456789-03:00', true],
    ['2026-10-16T08:00:00', false],
    ['2026-10-16 08:00:00Z', false],
    ['2026-02-30T08:00:00Z', false],
    ['2026-10-16T24:00:00Z', false],
    ['2026-10-16T08:60:00Z', false],
    ['2026-10-16T08:00:00+24:00', false],
  ])('instant %s → %s', (value, valid) => {
    expect(isValidInstant(value)).toBe(valid);
    expect(InstantSchema.safeParse(value).success).toBe(valid);
  });

  it('parses or returns null', () => {
    expect(parseCalendarDate('2026-10-16')).toBe('2026-10-16');
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseMonthKey('2026-10')).toBe('2026-10');
    expect(parseMonthKey('2026-10-01')).toBeNull();
  });
});

describe('calendarDate', () => {
  it('pads the parts', () => {
    expect(calendarDate(2026, 3, 1)).toBe('2026-03-01');
    expect(calendarDate(999, 12, 31)).toBe('0999-12-31');
  });

  it('treats an impossible date as a programmer error', () => {
    expect(() => calendarDate(2026, 2, 29)).toThrow('2026-2-29 is not a calendar date');
    expect(() => calendarDate(2026, 1.5, 1)).toThrow(RangeError);
    expect(() => calendarDate(10000, 1, 1)).toThrow(RangeError);
  });

  it('splits a date into its parts', () => {
    expect(dateParts(d('2026-10-16'))).toEqual({ year: 2026, month: 10, day: 16 });
  });
});

describe('epoch days', () => {
  it('counts from 1970-01-01', () => {
    expect(epochDay(d('1970-01-01'))).toBe(0);
    expect(epochDay(d('2000-03-01'))).toBe(11017);
    expect(fromEpochDay(-1)).toBe('1969-12-31');
    expect(fromEpochDay(epochDay(d('2028-02-29')))).toBe('2028-02-29');
  });
});

describe('addDays and daysBetween', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(d('2026-03-01'), 365)).toBe('2027-03-01');
  });

  it('measures whole days', () => {
    expect(daysBetween(d('2026-03-01'), d('2027-03-01'))).toBe(365);
    expect(daysBetween(d('2028-02-28'), d('2028-03-01'))).toBe(2);
    expect(daysBetween(d('2027-03-01'), d('2026-03-01'))).toBe(-365);
    expect(daysBetween(d('2026-10-16'), d('2026-10-16'))).toBe(0);
  });

  it('has no DST effect on the transition days in Lisbon and Berlin', () => {
    // 2026-03-29 and 2026-10-25 are the EU transition days; calendar dates carry no time.
    expect(daysBetween(d('2026-03-28'), d('2026-03-30'))).toBe(2);
    expect(daysBetween(d('2026-10-24'), d('2026-10-26'))).toBe(2);
  });
});

describe('month arithmetic', () => {
  it('clamps the day to the target month', () => {
    expect(clampDay(2026, 2, 31)).toBe('2026-02-28');
    expect(clampDay(2028, 2, 31)).toBe('2028-02-29');
    expect(clampDay(2026, 4, 31)).toBe('2026-04-30');
    expect(clampDay(2026, 5, 31)).toBe('2026-05-31');
  });

  it('moves month ends without drifting when the anchor is kept (ADR-0018)', () => {
    expect(addMonthsClamped(d('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonthsClamped(d('2026-02-28'), 1, 31)).toBe('2026-03-31');
    expect(addMonthsClamped(d('2026-02-28'), 1)).toBe('2026-03-28');
    expect(addMonthsClamped(d('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonthsClamped(d('2026-03-31'), -1)).toBe('2026-02-28');
    expect(addMonthsClamped(d('2026-12-15'), 1)).toBe('2027-01-15');
    expect(addMonthsClamped(d('2026-01-15'), -13)).toBe('2024-12-15');
  });

  it('moves years and clamps 29 February to 28 February', () => {
    expect(addYearsClamped(d('2024-02-29'), 1)).toBe('2025-02-28');
    expect(addYearsClamped(d('2024-02-29'), 4)).toBe('2028-02-29');
    expect(addYearsClamped(d('2026-03-15'), 1)).toBe('2027-03-15');
  });

  it('works with month keys', () => {
    expect(startOfMonth(d('2026-10-16'))).toBe('2026-10-01');
    expect(monthKey(d('2026-10-16'))).toBe('2026-10');
    expect(monthStart(k('2026-10'))).toBe('2026-10-01');
    expect(addMonthsToKey(k('2026-12'), 1)).toBe('2027-01');
    expect(addMonthsToKey(k('2026-01'), -13)).toBe('2024-12');
  });
});

describe('ordering', () => {
  it('compares dates and month keys as strings', () => {
    expect(compareDates(d('2026-10-16'), d('2026-10-17'))).toBe(-1);
    expect(compareDates(d('2026-10-17'), d('2026-10-16'))).toBe(1);
    expect(compareDates(d('2026-10-16'), d('2026-10-16'))).toBe(0);
    expect(compareDates(k('2026-09'), k('2026-10'))).toBe(-1);
  });

  it('finds the earliest and the latest', () => {
    expect(minDate(d('2026-10-16'), d('2025-01-01'), d('2027-01-01'))).toBe('2025-01-01');
    expect(maxDate(d('2026-10-16'), d('2025-01-01'), d('2027-01-01'))).toBe('2027-01-01');
    expect(minDate(d('2026-10-16'))).toBe('2026-10-16');
  });
});

describe('compareInstants', () => {
  const i = (value: string) => value as Instant;

  it('orders by the moment, whatever the offsets', () => {
    expect(compareInstants(i('2026-10-16T10:00:00+02:00'), i('2026-10-16T09:00:00Z'))).toBe(-1);
    expect(compareInstants(i('2026-10-16T09:00:00Z'), i('2026-10-16T10:00:00+02:00'))).toBe(1);
    expect(compareInstants(i('2026-10-16T08:00:00Z'), i('2026-10-16T10:00:00+02:00'))).toBe(0);
    expect(compareInstants(i('2026-10-16T23:30:00-03:00'), i('2026-10-17T02:30Z'))).toBe(0);
    expect(compareInstants(i('2026-10-16T00:30:00+05:45'), i('2026-10-15T18:44:59Z'))).toBe(1);
  });

  it('breaks ties on the fraction of a second', () => {
    expect(compareInstants(i('2026-10-16T08:00:00.123Z'), i('2026-10-16T08:00:00.124Z'))).toBe(-1);
    expect(compareInstants(i('2026-10-16T08:00:00.1234Z'), i('2026-10-16T08:00:00.123Z'))).toBe(1);
    expect(compareInstants(i('2026-10-16T08:00:00.1230Z'), i('2026-10-16T08:00:00.123Z'))).toBe(0);
    expect(compareInstants(i('2026-10-16T08:00:00.1231Z'), i('2026-10-16T08:00:00.1232Z'))).toBe(-1);
  });

  it('treats a malformed instant as a programmer error', () => {
    expect(() => compareInstants(i('2026-10-16'), i('2026-10-16T08:00:00Z'))).toThrow('is not an instant');
  });
});

describe('instantFromEpochMs', () => {
  it('writes milliseconds since the epoch as a UTC instant', () => {
    expect(instantFromEpochMs(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(instantFromEpochMs(1_760_601_906_007)).toBe('2025-10-16T08:05:06.007Z');
    expect(instantFromEpochMs(-1)).toBe('1969-12-31T23:59:59.999Z');
  });

  it('wants a whole number', () => {
    expect(() => instantFromEpochMs(1.5)).toThrow('is not a whole number of milliseconds');
  });
});

describe('stampAfter (ADR-0021)', () => {
  const i = (value: string) => value as Instant;
  const now = i('2026-10-17T10:00:00+02:00');

  it('keeps now when it is later than every stored stamp, or there is none', () => {
    expect(stampAfter(now)).toBe(now);
    expect(stampAfter(now, i('2026-10-17T07:59:59.999Z'), i('2026-10-16T10:00:00Z'))).toBe(now);
  });

  it('stamps one millisecond after the latest stored stamp when now is not later, whatever the offsets', () => {
    expect(stampAfter(now, i('2026-10-17T08:00:00Z'))).toBe('2026-10-17T08:00:00.001Z');
    expect(stampAfter(now, i('2026-10-17T09:00:00Z'), i('2026-10-17T12:00:00+02:00'))).toBe('2026-10-17T10:00:00.001Z');
    expect(stampAfter(now, i('2026-10-17T09:00:00.000500Z'))).toBe('2026-10-17T09:00:00.001Z');
  });
});

describe('weekday', () => {
  it('uses ISO numbering, Monday 1 to Sunday 7', () => {
    expect(weekday(d('1970-01-01'))).toBe(4);
    expect(weekday(d('2026-10-16'))).toBe(5);
    expect(weekday(d('2026-10-18'))).toBe(7);
    expect(weekday(d('2026-10-19'))).toBe(1);
    expect(weekday(d('1969-12-29'))).toBe(1);
  });
});
