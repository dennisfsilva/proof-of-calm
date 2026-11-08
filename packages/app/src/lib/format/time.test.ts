import type { CalendarDate, Instant } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '.';

const instant = (value: string) => value as Instant;
const day = (value: string) => value as CalendarDate;
// English copy is British, so its UI locale is en-GB; Ireland formats as en-IE (format.test.ts).
const en = createFormatters('en-IE', 'en-GB');
const pt = createFormatters('pt-PT', 'pt-PT');
const de = createFormatters('de-DE', 'de-DE');

const AFTERNOON = instant('2026-10-16T13:05:00Z');
const SAME_SEASON = instant('2026-10-16T15:00:00Z');
const WINTER = instant('2026-12-01T10:00:00Z');

describe('time (docs/DESIGN.md §5.9: times show the zone when it matters)', () => {
  it('writes the time in the device’s zone with the locale’s clock face', () => {
    expect(en.time(AFTERNOON, 'Europe/Lisbon')).toBe('14:05');
    expect(pt.time(AFTERNOON, 'Europe/Lisbon')).toBe('14:05');
    expect(de.time(AFTERNOON, 'Europe/Berlin')).toBe('15:05');
    expect(en.time(instant('2026-10-16T08:05:00Z'), 'Europe/Lisbon')).toBe('09:05');
    expect(createFormatters('en-US', 'en-GB').time(AFTERNOON, 'America/New_York')).toBe('9:05 AM');
  });

  it('leaves the zone out while the clocks have not changed since', () => {
    expect(en.time(AFTERNOON, 'Europe/Lisbon', SAME_SEASON)).toBe('14:05');
    expect(en.time(AFTERNOON, 'UTC', WINTER)).toBe('13:05');
  });

  it('names the zone, in the UI language, once the clocks have changed', () => {
    expect(en.time(AFTERNOON, 'Europe/Lisbon', WINTER)).toBe('14:05 WEST');
    expect(pt.time(AFTERNOON, 'Europe/Lisbon', WINTER)).toBe('14:05 WEST');
    expect(de.time(AFTERNOON, 'Europe/Berlin', WINTER)).toBe('15:05 MESZ');
    expect(en.time(AFTERNOON, 'Europe/Berlin', WINTER)).toBe('15:05 CEST');
    expect(en.time(WINTER, 'Europe/Lisbon', AFTERNOON)).toBe('10:00 WET');
  });

  it('tells the two 01:30s of the autumn change apart (Lisbon, 25 Oct 2026)', () => {
    const afterwards = instant('2026-10-25T03:00:00Z');
    expect(en.time(instant('2026-10-25T00:30:00Z'), 'Europe/Lisbon', afterwards)).toBe('01:30 WEST');
    expect(en.time(instant('2026-10-25T01:30:00Z'), 'Europe/Lisbon', afterwards)).toBe('01:30');
  });
});

describe('instantDate', () => {
  // Written like a date, its parts joined by no-break spaces (docs/CONTENT-STYLE.md §4).
  it('names the instant’s day in the device’s zone, written like a date', () => {
    const lateEvening = instant('2026-10-16T23:30:00Z');
    const nb = (text: string) => text.replaceAll(' ', '\u00a0');
    expect(en.instantDate(lateEvening, 'Europe/Berlin')).toBe(nb('17 Oct 2026'));
    expect(en.instantDate(lateEvening, 'America/Sao_Paulo')).toBe(nb('16 Oct 2026'));
    expect(pt.instantDate(lateEvening, 'Europe/Lisbon')).toBe(nb('17 de outubro de 2026'));
    expect(de.instantDate(lateEvening, 'Europe/Berlin')).toBe(nb('17. Okt. 2026'));
  });
});

describe('relativeDays (docs/CONTENT-STYLE.md §3: "Buy day was 1 October, 15 days ago")', () => {
  it('counts calendar days from today in the UI language', () => {
    const today = day('2026-10-16');
    expect(en.relativeDays(day('2026-10-01'), today)).toBe('15 days ago');
    expect(pt.relativeDays(day('2026-10-01'), today)).toBe('há 15 dias');
    expect(de.relativeDays(day('2026-10-01'), today)).toBe('vor 15 Tagen');
    expect([day('2026-10-15'), today, day('2026-10-19')].map((date) => en.relativeDays(date, today))).toEqual([
      'yesterday',
      'today',
      'in 3 days',
    ]);
  });

  it('counts across a month end and the spring clock change without drift', () => {
    expect(en.relativeDays(day('2026-02-27'), day('2026-03-30'))).toBe('31 days ago');
  });
});
