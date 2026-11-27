import { addDays, addMonthsClamped, type CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { buyDayFor, defaultWindow } from './simulator-dates';

// The simulator's default dates (docs/EDUCATION.md §7): the end is the earliest last close of the chosen coins and
// the start W, the first day whose 11 months before are within the closes, while a year from W still fits; else the
// first close. Synthetic dates only.

const d = (value: string) => value as CalendarDate;
const range = (first: string, last: string) => ({ first: d(first), last: d(last) });
/** One coin from `first` to far beyond any year from it. */
const from = (first: string) => defaultWindow([range(first, '2035-12-31')]);

describe('defaultWindow', () => {
  it('gives null with no coin chosen', () => {
    expect(defaultWindow([])).toBeNull();
  });

  it('starts 11 months after a first close on the 28th, whose day every month has', () => {
    expect(from('2026-01-28')?.start).toBe('2026-12-28');
  });

  it.each([
    ['2026-03-29', '2027-03-01'],
    ['2026-03-30', '2027-03-01'],
    ['2026-03-31', '2027-03-01'],
  ])('moves past a common February: first close %s starts on %s', (first, start) => {
    expect(from(first)?.start).toBe(start);
  });

  it.each([
    ['2027-03-29', '2028-02-29'],
    ['2027-03-30', '2028-03-01'],
    ['2027-03-31', '2028-03-01'],
  ])('moves past a leap February only when the 29th is short: first close %s starts on %s', (first, start) => {
    expect(from(first)?.start).toBe(start);
  });

  it('moves past a 30-day month for a first close on the 31st', () => {
    expect(from('2026-05-31')?.start).toBe('2027-05-01');
  });

  it.each(['2026-01-28', '2026-03-29', '2026-03-31', '2027-03-29', '2027-03-31', '2026-05-31'])(
    'takes the earliest start whose table of 12 rows stays within closes from %s',
    (first) => {
      const start = from(first)?.start as CalendarDate;
      expect(addMonthsClamped(start, -11) >= first).toBe(true);
      expect(addMonthsClamped(addDays(start, -1), -11) < first).toBe(true);
    },
  );

  it.each([
    [-1, '2026-03-31'],
    [0, '2027-03-01'],
    [1, '2027-03-01'],
  ])('switches to the first close when a year from W ends after the last close (offset %i)', (offset, start) => {
    // W is 2027-03-01 for a first close on 2026-03-31, and a year from it is 2028-03-01.
    const last = addDays(d('2028-03-01'), offset);
    expect(defaultWindow([range('2026-03-31', last)])).toEqual({
      start,
      end: last,
      first: '2026-03-31',
      last,
    });
  });

  it('reads the latest first close and the earliest last close among the coins', () => {
    const window = defaultWindow([range('2026-01-10', '2030-06-30'), range('2026-02-05', '2030-05-15')]);
    expect(window).toEqual({ start: '2027-01-05', end: '2030-05-15', first: '2026-02-05', last: '2030-05-15' });
  });

  it('starts on the first close over a few weeks of closes', () => {
    expect(defaultWindow([range('2026-11-26', '2026-12-31')])).toEqual({
      start: '2026-11-26',
      end: '2026-12-31',
      first: '2026-11-26',
      last: '2026-12-31',
    });
  });

  it('gives null when the coins share no day of closes', () => {
    expect(defaultWindow([range('2026-01-01', '2026-03-31'), range('2026-04-01', '2026-12-31')])).toBeNull();
  });
});

describe('buyDayFor', () => {
  it.each([
    ['2026-03-27', 27],
    ['2026-03-28', 28],
    ['2026-03-29', 28],
    ['2026-03-31', 28],
  ])('gives the buy day for a start on %s: %i', (start, day) => {
    expect(buyDayFor(d(start))).toBe(day);
  });
});
