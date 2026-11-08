import { type CalendarDate, calendarDate, dateParts, type Instant, instantFromEpochMs } from '@proofofcalm/core';
import type { Formatters } from '../../../lib/format';
import type { Clock } from '../../../lib/ports';

// The value chart's source line at its widest (docs/ENGINEERING.md §4): the lines the chart lays out,
// unseen and unread, under the drawn one, so the line's place has its height before the closes arrive.

export type SourceValues = { start: string; end: string; time: string; date: string };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const PROBE: SourceValues = { start: '\u0001', end: '\u0002', time: '\u0003', date: '\u0004' };

/** The lines built, by locales, zone, year, clocks and words: each mount of Portfolio makes its formatters. */
const built = new Map<string, readonly string[]>();

const midnight = (date: CalendarDate): Instant => `${date}T00:00:00.000Z` as Instant;

/**
 * The source line at its widest, whatever the closes turn out to be: their dates and fetch time are known
 * only once they arrive (from the network or the device's copy, up to a day old), and a date or a time of
 * another width wraps the line onto another number of lines. Every figure is as wide as another (`nums`),
 * so one line per month on its 28th, with each shape the time takes (one or two figures for the hour,
 * before or after noon, with the zone's name when its clocks then differed from now's), outwidths each
 * line the closes can draw. The lines depend on the formatters, the zone, the year, the words and which
 * months' clocks differ from now's, so they are built once for each and reused.
 */
export function widestSources(
  format: Formatters,
  clock: Clock,
  source: (values: SourceValues) => string,
): readonly string[] {
  const now = clock.now();
  const { year } = dateParts(clock.today());
  const months = Array.from({ length: 12 }, (_, index) => calendarDate(year, index + 1, 28));
  const { timeZone } = clock;
  // Which times carry the zone's name: each month's against now, and a day on from now (a change of the
  // clocks before then); the figures go, so any moment of the same clocks keys the same lines.
  const clocks = [...months.map(midnight), instantFromEpochMs(Date.parse(now) + DAY_MS - HOUR_MS)]
    .map((instant) => format.time(instant, timeZone, now).replace(/\d/gu, ''))
    .join('\u0000');
  const key = [format.locales.numbers, format.locales.ui, timeZone, year, clocks, source(PROBE)].join('\u0000');
  const known = built.get(key);
  if (known !== undefined) return known;

  // Each shape of the time once, its figures as zeros; a shape with fewer figures than another of the same
  // words is narrower, so it goes.
  const shapes = new Map<string, string>();
  for (const from of [now, ...months.map(midnight)]) {
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
        const day = format.date(month);
        return times.map((time) => source({ start: day, end: day, time, date: day }));
      }),
    ),
  ];
  built.set(key, made);
  return made;
}
