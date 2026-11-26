import type { CalendarDate, Instant } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import type { Clock } from '../../../lib/ports';
import en from '../messages/en.json';
import { KEYS, type PricesKey, type PricesValues, widestPrices } from './prices-reserve';

const clockAt = (now: string, timeZone = 'Europe/Lisbon'): Clock => ({
  timeZone,
  now: () => now as Instant,
  today: () => now.slice(0, 10) as CalendarDate,
});
const NOW = '2026-11-26T10:00:00.000Z';
const HOUR_MS = 3_600_000;

/** The prices line's English words, with its values put in as use-intl would. */
const line = (key: PricesKey, { time, date }: PricesValues) =>
  en.prices[key.slice('prices.'.length) as keyof typeof en.prices].replace('{time}', time).replace('{date}', date);
const words = (text: string) => text.replace(/\d/gu, '');
const codes = Object.values(KEYS).flatMap((keys) => [keys.live, keys.other]);

describe('widestPrices (the prices line held at its widest, docs/ENGINEERING.md §4)', () => {
  it('holds every code’s form, as itself or the start of a wider one', () => {
    const format = createFormatters('en-GB', 'en-GB');
    const clock = clockAt(NOW);
    const lines = widestPrices(format, clock, line);
    const at = '2026-03-28T10:00:00.000Z' as Instant;
    const values = { time: format.time(at, clock.timeZone, clock.now()), date: format.instantDate(at, clock.timeZone) };
    for (const key of codes) {
      expect(lines.some((reserved) => words(reserved).startsWith(words(line(key, values))))).toBe(true);
    }
    // The credit's lines start with the others' words, so only theirs are held.
    expect(lines.every((reserved) => reserved.endsWith(' · Price data by CoinGecko'))).toBe(true);
    expect(new Set(lines).size).toBe(lines.length);
    // Built once for the same formatters' locales, zone, year, clocks and words.
    expect(widestPrices(createFormatters('en-GB', 'en-GB'), clockAt('2026-11-27T18:00:00.000Z'), line)).toBe(lines);
  });

  it('is never shorter than a line the prices can draw, on any day of the year at any hour', () => {
    const format = createFormatters('en-US', 'en-US');
    const clock = clockAt(NOW, 'America/New_York');
    const lines = widestPrices(format, clock, line);
    for (let ms = Date.parse('2026-01-01T00:00:00.000Z'); ms < Date.parse('2027-01-01'); ms += 13 * HOUR_MS) {
      const at = new Date(ms).toISOString() as Instant;
      const values = {
        time: format.time(at, clock.timeZone, clock.now()),
        date: format.instantDate(at, clock.timeZone),
      };
      for (const key of codes) {
        const drawn = line(key, values);
        expect(
          lines.some((reserved) => words(reserved).startsWith(words(drawn)) && reserved.length >= drawn.length),
        ).toBe(true);
      }
    }
  });
});
