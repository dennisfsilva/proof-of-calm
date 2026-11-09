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

/** Values on days `gaps` apart from START: a gap of one is the next day. */
function seriesOf(values: readonly number[], gaps: readonly number[] = []): Series {
  let date = START;
  const points = values.map((value, index) => {
    if (index > 0) date = addDays(date, gaps[index] ?? 1);
    return { date, value: String(value) as Money };
  });
  return points as unknown as Series;
}

const whole = (series: Series, today: CalendarDate) => ({
  episode: redDayEpisode(redDays(series), today),
  points: new Map(drawdowns(series).map((point) => [point.date, { ...point, red: redDay(point) }])),
});

describe('recentEpisode', () => {
  it('finds the episode of the whole series, with its drawdowns on every day it read', async () => {
    const day = fc.oneof(fc.integer({ min: 40, max: 120 }), fc.constantFrom(1, 100, 1000));
    await fc.assert(
      fc.asyncProperty(
        fc.array(day, { minLength: 1, maxLength: 300 }),
        fc.array(fc.oneof(fc.constant(1), fc.integer({ min: 2, max: 9 }), fc.constant(120)), { maxLength: 300 }),
        fc.integer({ min: 0, max: 20 }),
        async (values, gaps, after) => {
          const series = seriesOf(values, gaps);
          const today = addDays(series[series.length - 1]?.date ?? START, after);
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
        },
      ),
      { numRuns: 60 },
    );
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
});
