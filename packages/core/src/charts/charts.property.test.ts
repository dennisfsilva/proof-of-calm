import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, type CalendarDate } from '../dates/calendar';
import { compare, decimal, isZero, minus, type Price, quotient, type Ratio } from '../money/decimal';
import { downsample } from './downsample';
import { areaPath, linePath, type Point } from './path';
import { dateScale, linearScale } from './scale';
import { tickStep, ticks } from './ticks';
import { runningMax, underwaterSegments } from './underwater';

/** A decimal with up to `dp` places from an integer, e.g. (-12345, 2) → "-123.45". */
const decimalArb = (dp: number, max = 1_000_000_000) =>
  fc.integer({ min: -max, max }).map((n) => decimal<Price>((n / 10 ** dp).toFixed(dp)));
const pixelArb = fc.integer({ min: -20_000, max: 20_000 }).map((n) => n / 10);
const sorted = (values: Price[]) => [...values].sort(compare);

describe('scales (ADR-0022)', () => {
  it('hit both ends of the range exactly and never reverse the order of values', () => {
    fc.assert(
      fc.property(fc.array(decimalArb(4), { minLength: 4, maxLength: 4 }), pixelArb, pixelArb, (values, r0, r1) => {
        const [low, a, b, high] = sorted(values) as [Price, Price, Price, Price];
        const scale = linearScale([low, high], [r0, r1]);
        if (compare(low, high) === 0) {
          expect(scale(a)).toBe(scale(b));
          return;
        }
        expect([scale(low), scale(high)]).toEqual([r0, r1]);
        expect(Math.sign(scale(b) - scale(a)) * Math.sign(r1 - r0)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('place dates in order and both ends of a date domain exactly', () => {
    const day = fc.integer({ min: 0, max: 20_000 }).map((n) => addDays('1990-01-01' as CalendarDate, n));
    fc.assert(
      fc.property(fc.array(day, { minLength: 4, maxLength: 4 }), pixelArb, pixelArb, (days, r0, r1) => {
        const [from, a, b, to] = [...days].sort() as [CalendarDate, CalendarDate, CalendarDate, CalendarDate];
        const x = dateScale([from, to], [r0, r1]);
        if (from !== to) expect([x(from), x(to)]).toEqual([r0, r1]);
        expect(Math.sign(x(b) - x(a)) * Math.sign(r1 - r0)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe('ticks', () => {
  it('are multiples of a step of 1, 2 or 5 × 10^k, ascending, inside the domain, at least one', () => {
    fc.assert(
      fc.property(decimalArb(6, 10_000_000), decimalArb(6, 10_000_000), fc.integer({ min: 2, max: 12 }), (x, y, n) => {
        const [low, high] = sorted([x, y]) as [Price, Price];
        fc.pre(compare(low, high) < 0);
        const step = tickStep(low, high, n);
        expect(step).toMatch(/^(0\.0*)?[125]0*$/);
        const values = ticks(low, high, n);
        expect(values.length).toBeGreaterThanOrEqual(1);
        // span / step stays below n × √10 / 2 (a raw step just under √10 × 10^k takes the step 2 × 10^k).
        expect(values.length).toBeLessThanOrEqual(Math.floor((n * Math.sqrt(10)) / 2) + 1);
        values.forEach((tick, index) => {
          expect(compare(tick, low)).toBeGreaterThanOrEqual(0);
          expect(compare(tick, high)).toBeLessThanOrEqual(0);
          expect(isZero(minus(quotient<Ratio>(tick, step, 0, 'down'), quotient<Ratio>(tick, step, 30, 'down')))).toBe(
            true,
          );
          if (index > 0) expect(minus(tick, values[index - 1] as Price)).toBe(step);
        });
      }),
    );
  });
});

describe('paths', () => {
  const points = fc.array(fc.tuple(pixelArb, pixelArb) as fc.Arbitrary<Point>, { maxLength: 50 });

  it('write one command per point, and an area adds its two baseline corners and a close', () => {
    fc.assert(
      fc.property(points, pixelArb, (line, baseline) => {
        expect(linePath(line).match(/[ML]/g)?.length ?? 0).toBe(line.length);
        const area = areaPath(line, baseline);
        expect(area.match(/[ML]/g)?.length ?? 0).toBe(line.length === 0 ? 0 : line.length + 2);
        if (line.length > 0) expect(area.endsWith('Z')).toBe(true);
      }),
    );
  });
});

describe('downsample', () => {
  it('keeps the first and the last point, in order, and never more than n + 1 points', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 1, max: 500 }), (length, n) => {
        const series = Array.from({ length }, (_, index) => index);
        const kept = downsample(series, n);
        expect(kept.length).toBe(length > n ? n + 1 : length);
        if (length > 0) expect([kept[0], kept.at(-1)]).toEqual([0, length - 1]);
        kept.forEach((index, position) => {
          if (position > 0) expect(index).toBeGreaterThan(kept[position - 1] as number);
        });
      }),
    );
  });
});

describe('underwater segments', () => {
  it('cover exactly the positions below the running maximum', () => {
    fc.assert(
      fc.property(fc.array(decimalArb(0, 20), { maxLength: 60 }), (values) => {
        const highs = runningMax(values);
        const below = values.map((value, index) => compare(value, highs[index] as Price) < 0);
        const covered = values.map(() => false);
        for (const { peak, trough, recovery } of underwaterSegments(values)) {
          expect(values[peak]).toBe(highs[peak]);
          expect(compare(values[trough] as Price, values[peak] as Price)).toBeLessThan(0);
          if (recovery !== null)
            expect(compare(values[recovery] as Price, values[peak] as Price)).toBeGreaterThanOrEqual(0);
          for (let index = peak + 1; index < (recovery ?? values.length); index += 1) {
            covered[index] = true;
            expect(compare(values[trough] as Price, values[index] as Price)).toBeLessThanOrEqual(0);
          }
        }
        expect(covered).toEqual(below);
      }),
    );
  });
});
