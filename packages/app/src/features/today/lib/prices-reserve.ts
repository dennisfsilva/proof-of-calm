import { calendarDate, dateParts, type Instant, instantFromEpochMs } from '@proofofcalm/core';
import type { Formatters } from '../../../lib/format';
import type { Clock } from '../../../lib/ports';

// The prices line at its widest (docs/ENGINEERING.md §4), after Portfolio's source line
// (portfolio/lib/source-reserve.ts): the lines it can draw, unseen and unread, under the drawn one, so its
// place has its height before the prices arrive and whichever code they then take.

/** Each code's message, with CoinGecko's credit for its prices and without for any other source. */
export const KEYS = {
  live: { live: 'prices.asOfLive', other: 'prices.asOf' },
  manual: { live: 'prices.asOfLive', other: 'prices.asOf' },
  delayed: { live: 'prices.delayedLive', other: 'prices.delayed' },
  offline: { live: 'prices.fromOfflineLive', other: 'prices.fromOffline' },
} as const;

export type PricesKey = (typeof KEYS)[keyof typeof KEYS]['live' | 'other'];
export type PricesValues = { time: string; date: string };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const PROBE: PricesValues = { time: '\u0001', date: '\u0002' };
const CODES: readonly PricesKey[] = [...new Set(Object.values(KEYS).flatMap((keys) => [keys.live, keys.other]))];

/** The lines built, by locales, zone, year, clocks and words: each mount of a screen makes its formatters. */
const built = new Map<string, readonly string[]>();

/**
 * The prices line at its widest, whatever the prices turn out to be: their time, date and code are known
 * only once they arrive. A code whose words start another's never wraps onto more lines, so it goes; each
 * other code is written on every month's 28th with each shape the time takes (as widestSources does), and
 * every figure is as wide as another (`nums`), so one of the lines outwidths each line the prices can draw.
 */
export function widestPrices(
  format: Formatters,
  clock: Clock,
  line: (key: PricesKey, values: PricesValues) => string,
): readonly string[] {
  const now = clock.now();
  const { year } = dateParts(clock.today());
  const { timeZone } = clock;
  const months = Array.from(
    { length: 12 },
    (_, index) => `${calendarDate(year, index + 1, 28)}T12:00:00.000Z` as Instant,
  );
  const clocks = [...months, instantFromEpochMs(Date.parse(now) + DAY_MS - HOUR_MS)]
    .map((instant) => format.time(instant, timeZone, now).replace(/\d/gu, ''))
    .join('\u0000');
  const probes = CODES.map((key) => line(key, PROBE));
  const key = [format.locales.numbers, format.locales.ui, timeZone, year, clocks, ...probes].join('\u0000');
  const known = built.get(key);
  if (known !== undefined) return known;

  const codes = CODES.filter((_, index) =>
    probes.every((other, at) => at === index || other === probes[index] || !other.startsWith(probes[index] ?? '')),
  );
  // Each shape of the time once, its figures as zeros; one with fewer figures than another of its words goes.
  const shapes = new Map<string, string>();
  for (const from of [now, ...months]) {
    for (let hour = 0; hour < 24; hour += 1) {
      const time = format.time(instantFromEpochMs(Date.parse(from) + hour * HOUR_MS), timeZone, now);
      shapes.set(time.replace(/\d/gu, '0'), time);
    }
  }
  const words = (shape: string) => shape.replace(/0/gu, '');
  const times = [...shapes]
    .filter(
      ([shape]) => ![...shapes.keys()].some((other) => words(other) === words(shape) && other.length > shape.length),
    )
    .map(([, time]) => time);
  const made = [
    ...new Set(
      months.flatMap((month) => {
        const date = format.instantDate(month, timeZone);
        return codes.flatMap((code) => times.map((time) => line(code, { time, date })));
      }),
    ),
  ];
  built.set(key, made);
  return made;
}
