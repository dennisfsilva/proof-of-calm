import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { abs, compare, type Decimal, decimal, isNegative, isZero, type Money, minus, product, sum } from './decimal';
import { minorUnit, splitLargestRemainder } from './split';

// "12345" with 2 places → "123.45"
function scaled(value: number | bigint, places: number): string {
  const digits = value.toString().padStart(places + 1, '0');
  return places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

const totals = fc.bigInt({ min: 0n, max: 10n ** 11n }).map((value) => decimal<Money>(scaled(value, 2)));
// Shares with up to four decimals, as the plan stores percentages; at least one positive.
const weights = fc
  .array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 10 })
  .filter((values) => values.some((value) => value > 0))
  .map((values) => values.map((value) => decimal<Decimal>(scaled(value, 4))));

describe('splitLargestRemainder properties (docs/DOMAIN.md §3.4)', () => {
  it('sums to exactly the whole', () => {
    fc.assert(
      fc.property(totals, weights, (total, shares) => {
        expect(sum(splitLargestRemainder(total, shares, 2))).toBe(total);
      }),
    );
  });

  it('keeps every part within one cent of its exact share, never negative, zero for a zero weight', () => {
    fc.assert(
      fc.property(totals, weights, (total, shares) => {
        const parts = splitLargestRemainder(total, shares, 2);
        const weightSum = sum(shares);
        parts.forEach((part, index) => {
          const share = shares[index] ?? decimal<Decimal>('0');
          // |part − total × w / W| < 0.01, multiplied through by W to stay exact.
          const deviation = abs(minus(product<Money>(part, weightSum), product<Money>(total, share)));
          expect(compare(deviation, product<Money>(minorUnit(2), weightSum))).toBe(-1);
          expect(isNegative(part)).toBe(false);
          if (isZero(share)) expect(part).toBe('0');
        });
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(totals, weights, (total, shares) => {
        expect(splitLargestRemainder(total, shares, 2)).toEqual(splitLargestRemainder(total, shares, 2));
      }),
    );
  });
});
