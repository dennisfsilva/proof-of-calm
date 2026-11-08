import { describe, expect, it } from 'vitest';
import { CURRENCIES, CurrencyCodeSchema, MINOR_UNITS } from './currency';
import { type Decimal, decimal, type Money, sum, type Units } from './decimal';
import { cumulativeShares, minorUnit, splitLargestRemainder } from './split';

const m = (value: string) => decimal<Money>(value);
const w = (...values: string[]) => values.map((value) => decimal<Decimal>(value));
const u = (...values: string[]) => values.map((value) => decimal<Units>(value));

describe('cumulativeShares (docs/DOMAIN.md §3.13)', () => {
  it('rounds each running total half-even and takes the difference, so the parts sum to the total', () => {
    // A €100.00 lot of 3 units sold one unit at a time: running totals 33.33, 66.67 and 100.
    expect(cumulativeShares(m('100'), u('1', '1', '1'), 2)).toEqual(['33.33', '33.34', '33.33']);
  });

  it('gives a part the same figure whatever follows it, while the weights sum to the same whole', () => {
    const early = cumulativeShares(m('100'), u('1', '2'), 2);
    const later = cumulativeShares(m('100'), u('1', '1', '1'), 2);
    expect(early[0]).toBe(later[0]);
    expect(early[1]).toBe(sum(later.slice(1)));
  });

  it("keeps the total's own decimals when it has more than the minor unit, without throwing", () => {
    expect(cumulativeShares(m('100.005'), u('1', '1', '1'), 2)).toEqual(['33.335', '33.335', '33.335']);
    expect(cumulativeShares(m('0.01'), u('1', '1', '1'), 2)).toEqual(['0', '0.01', '0']);
  });

  it('gives a zero weight a zero part', () => {
    expect(cumulativeShares(m('9000'), u('0.05', '0.1', '0'), 2)).toEqual(['3000', '6000', '0']);
  });
});

describe('splitLargestRemainder (docs/DOMAIN.md §3.4)', () => {
  it('splits a round amount exactly by percentage', () => {
    expect(splitLargestRemainder(m('100'), w('40', '30', '15', '15'), 2)).toEqual(['40', '30', '15', '15']);
  });

  it('gives the leftover cent to the earlier part on a tie (plan order)', () => {
    expect(splitLargestRemainder(m('100'), w('1', '1', '1'), 2)).toEqual(['33.34', '33.33', '33.33']);
    expect(splitLargestRemainder(m('0.05'), w('1', '1'), 2)).toEqual(['0.03', '0.02']);
  });

  it('gives leftovers to the largest remainders, which is where per-part rounding drifted', () => {
    // 0.10 fee over 33.34 / 33.33 / 33.33: exact shares 0.03334, 0.03333, 0.03333. The prototype's
    // round2 per part gave 0.03 each, 0.09 in total.
    expect(splitLargestRemainder(m('0.1'), w('33.34', '33.33', '33.33'), 2)).toEqual(['0.04', '0.03', '0.03']);
    expect(splitLargestRemainder(m('10'), w('33.3333', '33.3333', '33.3334'), 2)).toEqual(['3.33', '3.33', '3.34']);
  });

  it('gives a zero weight nothing, and handles a zero total', () => {
    expect(splitLargestRemainder(m('50'), w('100', '0'), 2)).toEqual(['50', '0']);
    expect(splitLargestRemainder(m('0'), w('60', '40'), 2)).toEqual(['0', '0']);
  });

  it('works in whole units when the currency has no minor unit', () => {
    expect(splitLargestRemainder(m('10'), w('1', '1', '1'), 0)).toEqual(['4', '3', '3']);
  });

  it('treats impossible inputs as programmer errors', () => {
    expect(() => splitLargestRemainder(m('10.005'), w('1'), 2)).toThrow('more than 2 decimals');
    expect(() => splitLargestRemainder(m('-10'), w('1'), 2)).toThrow('negative');
    expect(() => splitLargestRemainder(m('10'), w('1', '-1'), 2)).toThrow('negative');
    expect(() => splitLargestRemainder(m('10'), w('0', '0'), 2)).toThrow('positive');
  });
});

describe('minorUnit', () => {
  it('is the smallest step at a number of places', () => {
    expect([minorUnit(0), minorUnit(2), minorUnit(8)]).toEqual(['1', '0.01', '0.00000001']);
  });
});

describe('currencies', () => {
  it('are the v1 set with two-digit minor units', () => {
    expect(CURRENCIES).toEqual(['EUR', 'USD', 'GBP', 'CHF']);
    expect(MINOR_UNITS).toEqual({ EUR: 2, USD: 2, GBP: 2, CHF: 2 });
    expect(CurrencyCodeSchema.safeParse('EUR').success).toBe(true);
    expect(CurrencyCodeSchema.safeParse('SEK').success).toBe(false);
  });
});
