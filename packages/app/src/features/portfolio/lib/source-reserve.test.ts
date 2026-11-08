import type { CalendarDate, Instant } from '@proofofcalm/core';
import { describe, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import type { Clock } from '../../../lib/ports';
import { type SourceValues, widestSources } from './source-reserve';

const clockAt = (now: string, timeZone = 'Europe/London'): Clock => ({
  timeZone,
  now: () => now as Instant,
  today: () => now.slice(0, 10) as CalendarDate,
});
const source = ({ start, end, time, date }: SourceValues) => `${start} to ${end}, as of ${time}, ${date}`;
const AUTUMN = '2026-10-27T10:00:00.000Z';

describe('widestSources (the source line held at its widest, docs/ENGINEERING.md §4)', () => {
  it('writes each month’s 28th with each shape of the time, the zone named where the clocks differ from now', () => {
    const lines = widestSources(createFormatters('en-IE', 'en-GB'), clockAt(AUTUMN), source);
    for (const month of ['Jan', 'Mar', 'Jul', 'Sept', 'Dec']) {
      expect(
        lines.some((line) => line.startsWith(`28\u00a0${month}\u00a02026 to 28\u00a0${month}\u00a02026, as of `)),
      ).toBe(true);
    }
    // Now is in GMT: summer's times carry BST, and every month takes each shape; no time names GMT.
    expect(lines.some((line) => /^28\u00a0Jan\u00a02026 .* as of \d{2}:\d{2} BST, /u.test(line))).toBe(true);
    expect(lines.some((line) => /^28\u00a0Jan\u00a02026 .* as of \d{2}:\d{2}, /u.test(line))).toBe(true);
    expect(lines.some((line) => line.includes('GMT'))).toBe(false);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('builds the lines once per locales, zone, year and clocks, since each mount of Portfolio makes its formatters', () => {
    const first = widestSources(createFormatters('en-IE', 'en-GB'), clockAt(AUTUMN), source);
    const format = createFormatters('en-IE', 'en-GB');
    const time = vi.spyOn(format, 'time');
    const write = vi.fn(source);
    try {
      expect(widestSources(format, clockAt('2026-11-03T18:00:00.000Z'), write)).toBe(first);
      // The key alone: one probe of the words, and one time per month and one a day on.
      expect(write).toHaveBeenCalledTimes(1);
      expect(time.mock.calls.length).toBeLessThanOrEqual(13);
    } finally {
      time.mockRestore();
    }
  });

  it('builds again for other locales, another zone, another year, other clocks or other words', () => {
    const format = createFormatters('en-IE', 'en-GB');
    const autumn = widestSources(format, clockAt(AUTUMN), source);
    expect(widestSources(format, clockAt(AUTUMN, 'America/New_York'), source)).not.toBe(autumn);
    const american = widestSources(createFormatters('en-US', 'en-GB'), clockAt(AUTUMN), source);
    expect(american.some((line) => / [AP]M, /u.test(line))).toBe(true);
    expect(widestSources(format, clockAt('2027-10-27T10:00:00.000Z'), source)[0]).toMatch(/2027/u);
    // In summer the clocks differ from winter's instead.
    const summer = widestSources(format, clockAt('2026-07-01T10:00:00.000Z'), source);
    expect(summer.some((line) => line.includes(' GMT, '))).toBe(true);
    expect(summer.some((line) => line.includes('BST'))).toBe(false);
    const other = widestSources(format, clockAt(AUTUMN), (values) => `Closes ${source(values)}`);
    expect(other[0]).toMatch(/^Closes /u);
  });
});
