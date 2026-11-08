import {
  differenceInCalendarDays,
  addDays as fnsAddDays,
  addMonths as fnsAddMonths,
  addYears as fnsAddYears,
  getISODay,
} from 'date-fns';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  addMonthsToKey,
  addYearsClamped,
  type CalendarDate,
  dateParts,
  daysBetween,
  daysInMonth,
  epochDay,
  fromEpochDay,
  instantFromEpochMs,
  monthKey,
  weekday,
} from './calendar';

// date-fns is a development-only oracle (ADR-0018). Local-time Dates at midnight are compared by
// their calendar parts, so the process's time zone cannot change the result.
const toLocal = (date: CalendarDate) => {
  const { year, month, day } = dateParts(date);
  return new Date(year, month - 1, day);
};
const fromLocal = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const LOW = epochDay('1900-01-01' as CalendarDate);
const HIGH = epochDay('2200-12-31' as CalendarDate);
const anyDate = fc.integer({ min: LOW, max: HIGH }).map(fromEpochDay);
const shift = fc.integer({ min: -3000, max: 3000 });

describe('instantFromEpochMs, against Date', () => {
  it('matches toISOString for any moment from 1900 to 2200', () => {
    fc.assert(
      fc.property(fc.integer({ min: LOW * 86_400_000, max: HIGH * 86_400_000 }), (ms) => {
        expect(instantFromEpochMs(ms)).toBe(new Date(ms).toISOString());
      }),
    );
  });
});

describe('calendar arithmetic, against date-fns and its own algebra', () => {
  it('epoch days round-trip and order like the strings', () => {
    fc.assert(
      fc.property(anyDate, anyDate, (a, b) => {
        expect(fromEpochDay(epochDay(a))).toBe(a);
        expect(Math.sign(epochDay(a) - epochDay(b))).toBe(a < b ? -1 : a > b ? 1 : 0);
      }),
    );
  });

  it('addDays matches date-fns', () => {
    fc.assert(
      fc.property(anyDate, shift, (date, days) => {
        expect(addDays(date, days)).toBe(fromLocal(fnsAddDays(toLocal(date), days)));
      }),
    );
  });

  it('daysBetween matches date-fns and is antisymmetric and additive', () => {
    fc.assert(
      fc.property(anyDate, anyDate, anyDate, (a, b, c) => {
        expect(daysBetween(a, b)).toBe(differenceInCalendarDays(toLocal(b), toLocal(a)));
        expect(daysBetween(a, b) + daysBetween(b, a)).toBe(0);
        expect(daysBetween(a, b) + daysBetween(b, c)).toBe(daysBetween(a, c));
        expect(addDays(a, daysBetween(a, b))).toBe(b);
      }),
    );
  });

  it('addMonthsClamped without an anchor matches date-fns addMonths', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -240, max: 240 }), (date, months) => {
        expect(addMonthsClamped(date, months)).toBe(fromLocal(fnsAddMonths(toLocal(date), months)));
      }),
    );
  });

  it('keeps the anchor day across steps, so a sequence never drifts', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 1, max: 31 }), fc.nat(60), fc.nat(60), (date, anchor, i, j) => {
        const stepped = addMonthsClamped(addMonthsClamped(date, i, anchor), j, anchor);
        expect(stepped).toBe(addMonthsClamped(date, i + j, anchor));
        const { year, month, day } = dateParts(stepped);
        expect(day).toBe(Math.min(anchor, daysInMonth(year, month)));
      }),
    );
  });

  it('month keys move with their dates', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -240, max: 240 }), (date, months) => {
        expect(addMonthsToKey(monthKey(date), months)).toBe(monthKey(addMonthsClamped(date, months)));
      }),
    );
  });

  it('addYearsClamped matches date-fns addYears (29 February becomes 28 February)', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -50, max: 50 }), (date, years) => {
        expect(addYearsClamped(date, years)).toBe(fromLocal(fnsAddYears(toLocal(date), years)));
      }),
    );
  });

  it('weekday matches date-fns getISODay', () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        expect(weekday(date)).toBe(getISODay(toLocal(date)));
      }),
    );
  });
});
