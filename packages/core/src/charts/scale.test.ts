import { describe, expect, it } from 'vitest';
import { date, money } from '../../test/builders';
import type { Percent, Price } from '../money/decimal';
import { dateScale, extent, linearScale, paddedDomain } from './scale';

const price = (value: string) => value as Price;

describe('extent', () => {
  it('is the smallest and the largest value, or nothing for no values', () => {
    expect(extent([price('3'), price('1.5'), price('2')])).toEqual(['1.5', '3']);
    expect(extent([price('7')])).toEqual(['7', '7']);
    expect(extent([])).toBeNull();
  });
});

describe('linearScale (ADR-0022)', () => {
  it('maps the ends of the domain onto the ends of the range and the rest in proportion', () => {
    const x = linearScale([money('0'), money('100')], [0, 320]);
    expect([x(money('0')), x(money('50')), x(money('100'))]).toEqual([0, 160, 320]);
    // 33.3333 × 3.2 = 106.66656, rounded once to one place.
    expect(x(money('33.3333'))).toBe(106.7);
  });

  it('runs a value axis from the bottom pixel up', () => {
    const y = linearScale([price('58000'), price('62000')], [140, 10]);
    expect([y(price('58000')), y(price('60000')), y(price('62000')), y(price('59000'))]).toEqual([140, 75, 10, 107.5]);
  });

  it('extends the line beyond the domain rather than clamping it', () => {
    const x = linearScale([money('0'), money('100')], [0, 320]);
    expect([x(money('150')), x(money('-10'))]).toEqual([480, -32]);
  });

  it('rounds halves to even once, at one decimal place', () => {
    const x = linearScale([money('0'), money('1')], [0, 1]);
    expect([x(money('0.05')), x(money('0.15')), x(money('0.25'))]).toEqual([0, 0.2, 0.2]);
  });

  it('puts every value of a flat domain in the middle of the range', () => {
    expect(linearScale([money('5'), money('5')], [0, 320])(money('5'))).toBe(160);
    expect(linearScale([money('5'), money('5')], [0, 0.3])(money('9'))).toBe(0.2);
  });

  it('takes the range at one decimal place and refuses a range that is not a number', () => {
    const x = linearScale([money('0'), money('10')], [0.04, 100.06]);
    expect([x(money('0')), x(money('10'))]).toEqual([0, 100.1]);
    expect(() => linearScale([money('0'), money('1')], [0, Number.NaN])).toThrow(RangeError);
    expect(() => linearScale([money('0'), money('1')], [Number.POSITIVE_INFINITY, 1])).toThrow(RangeError);
  });

  it('works for percentages below zero (a drawdown axis)', () => {
    const y = linearScale(['-80' as Percent, '0' as Percent], [100, 0]);
    expect([y('-80' as Percent), y('-20' as Percent), y('0' as Percent)]).toEqual([100, 25, 0]);
  });
});

describe('dateScale', () => {
  it('places dates by whole days between the ends', () => {
    const x = dateScale([date('2026-01-01'), date('2026-12-31')], [0, 364]);
    expect([x(date('2026-01-01')), x(date('2026-07-02')), x(date('2026-12-31'))]).toEqual([0, 182, 364]);
  });

  it('counts the leap day and ignores daylight saving time, which calendar dates do not have', () => {
    // 26 March 2028 is the day Europe moves its clocks forward.
    const x = dateScale([date('2028-02-28'), date('2028-03-31')], [0, 320]);
    expect([x(date('2028-02-29')), x(date('2028-03-01')), x(date('2028-03-26'))]).toEqual([10, 20, 270]);
  });

  it('puts a one-day range in the middle', () => {
    expect(dateScale([date('2026-10-16'), date('2026-10-16')], [0, 100])(date('2026-10-16'))).toBe(50);
  });
});

describe('paddedDomain (the prototype)', () => {
  it('widens the extent by 8 % of its span on each side', () => {
    expect(paddedDomain([price('100'), price('200')])).toEqual(['92', '208']);
    expect(paddedDomain([price('100'), price('200')], '0' as never)).toEqual(['100', '200']);
  });

  it('widens a flat series by 1 % of its value, or by 1 around zero, before padding', () => {
    expect(paddedDomain([price('50'), price('50')])).toEqual(['49.42', '50.58']);
    expect(paddedDomain([money('-50'), money('-50')])).toEqual(['-50.58', '-49.42']);
    expect(paddedDomain([money('0'), money('0')])).toEqual(['-1.16', '1.16']);
  });
});
