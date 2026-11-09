import {
  addDays,
  type CalendarDate,
  drawdowns,
  type Money,
  redDay,
  redDayEpisode,
  redDays,
  type ValuePoint,
} from '@proofofcalm/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recentEpisode } from './red-day-model';

// The red-day model reads the episode from the last weeks of the held value series, and earlier blocks only while the
// episode may have started before them (docs/ENGINEERING.md §4: no long task on Today's load). It must find what
// redDayEpisode finds over the whole series, with the same drawdown on every day it read.

const START = '2025-10-01' as CalendarDate;

type Series = readonly [ValuePoint, ...ValuePoint[]];

/** Values on days `gaps` apart from `start`: a gap of one is the next day. */
function seriesOf(values: readonly number[], gaps: readonly number[] = [], start = START): Series {
  let date = start;
  const points = values.map((value, index) => {
    if (index > 0) date = addDays(date, gaps[index] ?? 1);
    return { date, value: String(value) as Money };
  });
  return points as unknown as Series;
}

/** `days` closes falling 2 % a day from a million, rounded to whole units. */
const falling = (days: number, from = 1_000_000) =>
  Array.from({ length: days }, (_, n) => Math.round(from * 0.98 ** n));

const whole = (series: Series, today: CalendarDate) => ({
  episode: redDayEpisode(redDays(series), today),
  points: new Map(drawdowns(series).map((point) => [point.date, { ...point, red: redDay(point) }])),
});

/** recentEpisode against the whole series: the same episode, and the whole series' drawdowns on every day it read. */
async function matchesWhole(series: Series, today: CalendarDate) {
  const expected = whole(series, today);
  const { episode, flags } = await recentEpisode(series, today);
  expect(episode).toEqual(expected.episode);
  expect(flags.at(-1)?.date).toBe(series.at(-1)?.date);
  for (const flag of flags) {
    const point = expected.points.get(flag.date);
    expect(flag).toEqual({
      date: flag.date,
      sevenDay: point?.sevenDay,
      fromHigh90: point?.fromHigh90,
      red: point?.red,
    });
  }
  return { episode, flags };
}

describe('recentEpisode', () => {
  it('finds the episode of the whole series, with its drawdowns on every day it read', async () => {
    // size 'max' lets the arrays reach their maxLength: fast-check's default size keeps them near ten items, too
    // short to make the model read more than one earlier block. Random closes keep an episode going for most of a
    // series, so the deep path is the common one; the rare long gap splits a series into separate stretches.
    const day = fc.oneof(fc.integer({ min: 40, max: 120 }), fc.constantFrom(1, 100, 1000));
    const gap = fc.oneof(
      { arbitrary: fc.constant(1), weight: 100 },
      { arbitrary: fc.integer({ min: 2, max: 9 }), weight: 8 },
      { arbitrary: fc.integer({ min: 91, max: 200 }), weight: 1 },
    );
    const numRuns = 25;
    let runs = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(day, { minLength: 1, maxLength: 500, size: 'max' }),
        fc.array(gap, { maxLength: 500, size: 'max' }),
        fc.integer({ min: 0, max: 20 }),
        async (values, gaps, after) => {
          runs += 1;
          const series = seriesOf(values, gaps);
          await matchesWhole(series, addDays(series[series.length - 1]?.date ?? START, after));
        },
      ),
      // Shrinking a failure of hundreds of points outlasts the test's timeout: stop it after 2 s and report the
      // smallest counterexample found by then.
      { numRuns, interruptAfterTimeLimit: 2000 },
    );
    // Every generated series ran: a run cut by a time limit passes silently and drops the deep, gappy series.
    expect(runs).toBe(numRuns);
  });

  it('reads the last two weeks of a calm year and no further', async () => {
    const series = seriesOf(Array.from({ length: 365 }, (_, n) => 100 + n));
    const today = addDays(series[364]?.date ?? START, 1);
    const { episode, flags } = await recentEpisode(series, today);
    expect(episode).toBeNull();
    expect(flags.map((flag) => flag.date)).toEqual(series.slice(-14).map((point) => point.date));
  });

  it('reads back in blocks to the start of an episode that began months ago', async () => {
    // 200 days at 100, then 60: Red for the 90 days the high stays in the window, from day 200 on.
    const series = seriesOf([...Array.from({ length: 200 }, () => 100), ...Array.from({ length: 80 }, () => 60)]);
    const today = addDays(series[279]?.date ?? START, 1);
    const { episode, flags } = await recentEpisode(series, today);
    expect(episode).toEqual({ start: series[200]?.date, last: series[279]?.date });
    expect(flags.length).toBeLessThan(series.length);
  });

  it('follows a fall of 300 days back to its first Red day', async () => {
    // Red from the first day with a close a week older: 1 − 0.98⁷ is a fall of 13 %.
    const series = seriesOf(falling(300), [], '2025-01-01' as CalendarDate);
    const today = addDays(series[299]?.date ?? START, 1);
    const { episode } = await matchesWhole(series, today);
    expect(episode).toEqual({ start: '2025-01-08', last: series[299]?.date });
  });

  it('reads two earlier blocks for an episode that began five months ago, and not the year before it', async () => {
    // 200 calm days, then 150 falling: the episode starts 144 days before today, past 14 + 90 days, within 14 + 180.
    const series = seriesOf([...Array.from({ length: 200 }, (_, n) => 1_000_000 + n), ...falling(150, 1_000_199)]);
    const today = addDays(series[349]?.date ?? START, 1);
    const { episode, flags } = await matchesWhole(series, today);
    expect(episode).toEqual({ start: series[206]?.date, last: series[349]?.date });
    expect(addDays(episode?.start ?? today, 97) < today).toBe(true);
    expect(flags[0]?.date).toBe(addDays(today, -(14 + 180)));
    expect(flags.length).toBeLessThan(series.length);
  });

  it('starts an episode after a gap of more than 90 days, against the close before the gap', async () => {
    // A missing day counts as clear, so the gap of 120 days ends the first fall's episode. The first close after it is
    // 20 % under the last close before it, Red at once, and the fall goes on for 150 days: two earlier blocks back.
    const before = falling(120);
    const after = falling(150, Math.round((before[119] ?? 0) * 0.8));
    const series = seriesOf(
      [...before, ...after],
      Array.from({ length: 121 }, (_, n) => (n === 120 ? 120 : 1)),
    );
    const today = addDays(series[269]?.date ?? START, 1);
    const { episode, flags } = await matchesWhole(series, today);
    expect(episode).toEqual({ start: series[120]?.date, last: series[269]?.date });
    expect(flags[0]?.date).toBe(series[120]?.date);
  });
});
