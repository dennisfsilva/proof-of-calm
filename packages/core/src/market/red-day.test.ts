import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { date } from '../../test/builders';
import { RED_DAY } from '../constants';
import { addDays, type CalendarDate, daysBetween } from '../dates/calendar';
import { compare, type Money, minus, type Percent, product, quotient } from '../money/decimal';
import { drawdownNow, drawdowns, type RedDayFlag, redDay, redDayEpisode, redDays } from './red-day';
import type { ValuePoint } from './series';

const START = date('2026-01-01');
const daily = (values: readonly string[], start = START): ValuePoint[] =>
  values.map((value, offset) => ({ date: addDays(start, offset), value: value as Money }));
const at = (offsets: readonly number[], values: readonly string[]): ValuePoint[] =>
  offsets.map((offset, index) => ({ date: addDays(START, offset), value: values[index] as Money }));
const repeat = (value: string, times: number) => Array.from({ length: times }, () => value);

describe('drawdowns (docs/DOMAIN.md §3.11)', () => {
  it('measures the week against the latest value at least seven days earlier', () => {
    const week = daily([...repeat('100', 7), '90', '95']);
    expect(drawdowns(week).map((point) => point.sevenDay)).toEqual([...repeat(null as never, 7), '-10', '-5']);
    expect(drawdowns(at([0, 2, 9], ['100', '80', '120'])).map((point) => point.sevenDay)).toEqual([null, null, '50']);
  });

  it('measures the distance from the high of the 90 days ending on the date, and from the highest value', () => {
    const quarter = daily(['100', ...repeat('75', 88), '70', '70']);
    const [day89, day90] = drawdowns(quarter).slice(-2);
    expect(day89).toEqual(expect.objectContaining({ date: '2026-03-31', fromHigh90: '-30', fromAllTimeHigh: '-30' }));
    expect(day90).toEqual(
      expect.objectContaining({ date: '2026-04-01', fromHigh90: '-6.6666', fromAllTimeHigh: '-30' }),
    );
  });

  it('truncates toward zero, so a threshold is crossed only when the exact figure crosses it', () => {
    const [below, above] = [daily([...repeat('100', 7), '89.99999']), daily([...repeat('100', 7), '90.00001'])];
    expect(drawdownNow(below)?.sevenDay).toBe('-10');
    expect(drawdownNow(above)?.sevenDay).toBe('-9.9999');
  });

  it('reports no fall from a high of zero and no weekly change from a zero value', () => {
    expect(drawdowns(daily(repeat('0', 9))).at(-1)).toEqual({
      date: '2026-01-09',
      sevenDay: null,
      fromHigh90: '0',
      fromAllTimeHigh: '0',
    });
  });

  it('gives the latest point, or nothing for an empty series', () => {
    expect(drawdownNow(daily(['100', '50']))).toEqual({
      date: '2026-01-02',
      sevenDay: null,
      fromHigh90: '-50',
      fromAllTimeHigh: '-50',
    });
    expect(drawdownNow([])).toBeNull();
  });
});

describe('drawdowns properties', () => {
  const pointsArb = fc
    .array(fc.record({ gap: fc.integer({ min: 1, max: 12 }), cents: fc.integer({ min: 0, max: 1_000_000 }) }), {
      minLength: 1,
      maxLength: 160,
    })
    .map((steps) => {
      let offset = 0;
      return steps.map((step) => {
        offset += step.gap;
        return { date: addDays(START, offset), value: (step.cents / 100).toFixed(2) as Money };
      });
    });
  const percentChange = (now: Money, then: Money) =>
    quotient<Percent>(product(minus(now, then), '100' as Money), then, 4, 'down');
  const highest = (points: readonly ValuePoint[]) =>
    points.reduce((high, point) => (compare(point.value, high) > 0 ? point.value : high), '0' as Money);

  it('match a direct scan of the series for every date', () => {
    fc.assert(
      fc.property(pointsArb, (series) => {
        const expected = series.map((point, index) => {
          const upTo = series.slice(0, index + 1);
          const weekAgo = upTo.filter((earlier) => daysBetween(earlier.date, point.date) >= 7).at(-1);
          const high90 = highest(upTo.filter((earlier) => daysBetween(earlier.date, point.date) < 90));
          const high = highest(upTo);
          return {
            date: point.date,
            sevenDay:
              weekAgo === undefined || compare(weekAgo.value, '0' as Money) === 0
                ? null
                : percentChange(point.value, weekAgo.value),
            fromHigh90: compare(high90, '0' as Money) === 0 ? '0' : percentChange(point.value, high90),
            fromAllTimeHigh: compare(high, '0' as Money) === 0 ? '0' : percentChange(point.value, high),
          };
        });
        expect(drawdowns(series)).toEqual(expected);
      }),
    );
  });

  it('stay between −100 % and zero, the all-time figure never above the 90-day one', () => {
    fc.assert(
      fc.property(pointsArb, (series) => {
        for (const point of drawdowns(series)) {
          expect(compare(point.fromHigh90, '0' as Percent)).toBeLessThanOrEqual(0);
          expect(compare(point.fromAllTimeHigh, '-100' as Percent)).toBeGreaterThanOrEqual(0);
          expect(compare(point.fromAllTimeHigh, point.fromHigh90)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });

  it('do not depend on the size of the holding', () => {
    fc.assert(
      fc.property(pointsArb, fc.integer({ min: 2, max: 1000 }), (series, factor) => {
        const scaled = series.map((point) => ({
          date: point.date,
          value: product<Money>(point.value, String(factor) as Money),
        }));
        expect(drawdowns(scaled)).toEqual(drawdowns(series));
      }),
    );
  });
});

describe('redDay (RED_DAY at its boundaries)', () => {
  const day = (sevenDay: string | null, fromHigh90: string) => ({
    sevenDay: sevenDay as Percent | null,
    fromHigh90: fromHigh90 as Percent,
    fromAllTimeHigh: fromHigh90 as Percent,
  });

  it('is a seven-day fall of 10 % or more, or 30 % or more below the 90-day high', () => {
    expect(redDay(day('-10', '0'))).toBe(true);
    expect(redDay(day('-9.9999', '-29.9999'))).toBe(false);
    expect(redDay(day(null, '-30'))).toBe(true);
    expect(redDay(day(null, '-29.9999'))).toBe(false);
    expect(redDay(day('3', '-45'))).toBe(true);
  });

  it('takes other thresholds when given', () => {
    expect(redDay(day('-6', '0'), { sevenDay: '-5' as Percent, fromHigh90: '-20' as Percent })).toBe(true);
  });

  it('flags each day of a series with that day’s own drawdown', () => {
    expect(redDays(daily([...repeat('100', 7), '90', '99']))).toEqual([
      ...repeat('100', 7).map((_, offset) => ({ date: addDays(START, offset), red: false })),
      { date: '2026-01-08', red: true },
      { date: '2026-01-09', red: false },
    ]);
  });
});

describe('redDayEpisode (docs/DOMAIN.md §3.11)', () => {
  const flags = (reds: readonly number[], length: number): RedDayFlag[] =>
    Array.from({ length }, (_, offset) => ({ date: addDays(START, offset), red: reds.includes(offset) }));
  const day = (offset: number) => addDays(START, offset);

  it('runs from the first Red day until the condition has been clear for seven days', () => {
    const days = flags([0, 1, 2], 10);
    expect(redDayEpisode(days, day(8))).toEqual({ start: day(0), last: day(2) });
    expect(redDayEpisode(days, day(9))).toBeNull();
  });

  it('keeps one episode through six clear days and starts another after seven', () => {
    expect(redDayEpisode(flags([0, 7], 8), day(7))).toEqual({ start: day(0), last: day(7) });
    expect(redDayEpisode(flags([0, 8], 9), day(8))).toEqual({ start: day(8), last: day(8) });
  });

  it('has no episode without a Red day', () => {
    expect(redDayEpisode(flags([], 30), day(29))).toBeNull();
    expect(redDayEpisode([], day(0))).toBeNull();
  });

  it('is the episode its definition describes, for any run of days', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 60 }), fc.integer({ min: 0, max: 10 }), (reds, after) => {
        const days = reds.map((red, offset) => ({ date: day(offset), red }));
        const today = day(reds.length - 1 + after);
        const redDates = days.filter((flag) => flag.red).map((flag) => flag.date);
        const episode = redDayEpisode(days, today);
        const clear = RED_DAY.episodeClearDays;
        if (episode === null) {
          for (const red of redDates) expect(daysBetween(red, today)).toBeGreaterThanOrEqual(clear);
          return;
        }
        expect(redDates).toContain(episode.start);
        expect(redDates.at(-1)).toBe(episode.last);
        expect(daysBetween(episode.last, today)).toBeLessThan(clear);
        const inside = redDates.filter((red) => red >= episode.start);
        inside.slice(1).forEach((red, index) => {
          expect(daysBetween(inside[index] as CalendarDate, red)).toBeLessThanOrEqual(clear);
        });
        const before = redDates.filter((red) => red < episode.start).at(-1);
        if (before !== undefined) expect(daysBetween(before, episode.start)).toBeGreaterThan(clear);
      }),
    );
  });
});
