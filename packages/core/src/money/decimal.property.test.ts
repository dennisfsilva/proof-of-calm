import Big from 'big.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  abs,
  compare,
  type Decimal,
  decimal,
  decimalPlaces,
  type Money,
  minus,
  type Price,
  plus,
  product,
  quotient,
  type Rounding,
  round,
  roundSignificant,
  sum,
  type Units,
  unitsFor,
  valueAt,
} from './decimal';

// Decimal strings from an integer and a scale: (12345, 3) → "12.345".
function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}
const anyDecimal = (maxScale: number) =>
  fc
    .tuple(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.integer({ min: 0, max: maxScale }))
    .map(([value, scale]) => decimal<Decimal>(fromScaled(value, scale)));
const nonZero = (maxScale: number) => anyDecimal(maxScale).filter((value) => value !== '0');
const modes = fc.constantFrom<Rounding>('down', 'up', 'half-up', 'half-even');
const RM = { down: 0, 'half-up': 1, 'half-even': 2, up: 3 } as const;

// Reference 1: big.js's own division, correctly rounded at DP under RM, in a separate constructor.
function bigJsReference(a: string, b: string, dp: number, mode: Rounding): string {
  const Reference = Big();
  Reference.DP = dp;
  Reference.RM = RM[mode];
  Reference.NE = -1e6;
  Reference.PE = 1e6;
  const result = new Reference(a).div(new Reference(b)).toFixed();
  return result === '-0' || /^-0\.0+$/.test(result) ? '0' : result;
}

// Reference 2: exact rational arithmetic on BigInt, rounding by the definition of each mode.
function rationalReference(a: string, b: string, dp: number, mode: Rounding): string {
  const scaleOf = (text: string) => (text.includes('.') ? text.length - text.indexOf('.') - 1 : 0);
  const intOf = (text: string) => BigInt(text.replace('.', ''));
  const [sa, sb] = [scaleOf(a), scaleOf(b)];
  const numerator = intOf(a) * 10n ** BigInt(sb + dp);
  const denominator = intOf(b) * 10n ** BigInt(sa);
  let q = numerator / denominator;
  const r = numerator % denominator;
  if (r !== 0n) {
    const twice = (r < 0n ? -r : r) * 2n;
    const half = denominator < 0n ? -denominator : denominator;
    const odd = q % 2n !== 0n;
    const away =
      mode === 'up' ||
      (mode === 'half-up' && twice >= half) ||
      (mode === 'half-even' && (twice > half || (twice === half && odd)));
    if (away) q += numerator < 0n !== denominator < 0n ? -1n : 1n;
  }
  const text = fromScaled(q, dp);
  return decimal<Decimal>(text.startsWith('-') && /^-0(\.0+)?$/.test(text) ? '0' : text);
}

describe('quotient', () => {
  it('rounds every mode exactly like big.js and like exact rational arithmetic', () => {
    fc.assert(
      fc.property(anyDecimal(8), nonZero(8), fc.integer({ min: 0, max: 12 }), modes, (a, b, dp, mode) => {
        const result = quotient<Decimal>(a, b, dp, mode);
        expect(result).toBe(bigJsReference(a, b, dp, mode));
        expect(result).toBe(rationalReference(a, b, dp, mode));
      }),
      { numRuns: 2000 },
    );
  });
});

describe('addition', () => {
  it('is commutative, associative and inverted by subtraction', () => {
    fc.assert(
      fc.property(anyDecimal(10), anyDecimal(10), anyDecimal(10), (a, b, c) => {
        expect(plus(a, b)).toBe(plus(b, a));
        expect(plus(plus(a, b), c)).toBe(plus(a, plus(b, c)));
        expect(minus(plus(a, b), b)).toBe(a);
        expect(sum([a, b, c])).toBe(plus(plus(a, b), c));
      }),
    );
  });
});

describe('round', () => {
  it('stays within one step of the value and matches big.js', () => {
    fc.assert(
      fc.property(anyDecimal(10), fc.integer({ min: 0, max: 8 }), modes, (value, dp, mode) => {
        const rounded = round(value, dp, mode);
        const Reference = Big();
        Reference.NE = -1e6;
        Reference.PE = 1e6;
        const expected = new Reference(value).round(dp, RM[mode]).toFixed();
        expect(rounded).toBe(/^-0(\.0+)?$/.test(expected) ? '0' : expected);
      }),
    );
  });
});

describe('roundSignificant', () => {
  it('never returns 0 for a positive value and keeps at least the significant figures it is given', () => {
    const positive = fc
      .tuple(fc.bigInt({ min: 1n, max: 10n ** 15n }), fc.integer({ min: 0, max: 20 }))
      .map(([value, scale]) => decimal<Price>(fromScaled(value, scale)));
    fc.assert(
      fc.property(positive, fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 4 }), (value, figures, dp) => {
        const rounded = roundSignificant(value, figures, dp, 'half-even');
        expect(compare(rounded, decimal<Price>('0'))).toBe(1);
        // Within half a unit of the last kept figure: |rounded - value| <= value / (2 * 10^(figures - 1)).
        const error = product<Price>(abs(minus(rounded, value)), decimal<Price>(`${2 * 10 ** (figures - 1)}`));
        expect(compare(error, value)).toBeLessThanOrEqual(0);
        expect(decimalPlaces(rounded)).toBeLessThanOrEqual(Math.max(dp, decimalPlaces(value)));
      }),
    );
  });
});

describe('unitsFor', () => {
  it('never buys more than the amount, and wastes less than one unit step', () => {
    const positive = fc.bigInt({ min: 1n, max: 10n ** 12n });
    fc.assert(
      fc.property(positive, positive, fc.integer({ min: 0, max: 10 }), (amountCents, priceCents, decimals) => {
        const amount = decimal<Money>(fromScaled(amountCents, 2));
        const price = decimal<Price>(fromScaled(priceCents, 2));
        const units = unitsFor(amount, price, decimals);
        const spent = valueAt(units, price);
        expect(compare(spent, amount)).toBeLessThanOrEqual(0);
        const oneStepMore = valueAt(plus(units, decimal<Units>(fromScaled(1n, decimals))), price);
        expect(compare(oneStepMore, amount)).toBe(1);
      }),
    );
  });
});
