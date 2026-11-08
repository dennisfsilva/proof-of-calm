import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  abs,
  compare,
  decimal,
  isPositive,
  type Money,
  minus,
  type Price,
  plus,
  product,
  type Units,
  valueAt,
} from '../money/decimal';
import { minorUnit } from '../money/split';
import { type FillRow, fillRow } from './fill';

// "12345" with 2 places → "123.45"
function scaled(value: bigint, places: number): string {
  const digits = value.toString().padStart(places + 1, '0');
  return places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

const positive = (max: bigint, places: number) =>
  fc.bigInt({ min: 1n, max }).map((value) => decimal(scaled(value, places)));
const amounts = positive(10n ** 9n, 2).map((value) => value as Money);
const unitsTyped = positive(10n ** 12n, 8).map((value) => value as Units);
const prices = positive(10n ** 10n, 2).map((value) => value as Price);
const coinDecimals = fc.integer({ min: 0, max: 10 });

describe('fillRow properties (ADR-0034, ADR-0017)', () => {
  it('keeps units × price within a minor unit per unit plus one unit step at the price of the amount', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('amount', 'units', 'price' as const),
        amounts,
        unitsTyped,
        prices,
        coinDecimals,
        (field, amount, typedUnits, typedPrice, decimals) => {
          const filled = fillRow(field, { amount, units: typedUnits, price: typedPrice }, decimals, 'EUR');
          const filledUnits = filled.units as Units;
          const filledPrice = filled.price as Price;
          const gap = abs(minus(product<Money>(filledUnits, filledPrice), amount));
          // The price rounds by at most half a minor unit per unit; the units by less than one step.
          const bound = plus(
            product<Money>(filledUnits, minorUnit(2)),
            product<Money>(filledPrice, minorUnit(decimals)),
          );
          expect(compare(gap, bound)).toBeLessThanOrEqual(0);
        },
      ),
    );
  });

  it('gives the same row when the same field is edited twice', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('amount', 'units', 'price' as const),
        amounts,
        unitsTyped,
        prices,
        coinDecimals,
        (field, amount, typedUnits, typedPrice, decimals) => {
          const once = fillRow(field, { amount, units: typedUnits, price: typedPrice }, decimals, 'EUR');
          expect(fillRow(field, once, decimals, 'EUR')).toEqual(once);
        },
      ),
    );
  });

  it('derives the price from the units when no price is given, and the units then hold within the bound', () => {
    fc.assert(
      fc.property(amounts, unitsTyped, (amount, typedUnits) => {
        const filled = fillRow<FillRow>('amount', { amount, units: typedUnits, price: null }, 8, 'EUR');
        const gap = abs(minus(product<Money>(typedUnits, filled.price as Price), amount));
        expect(compare(gap, product<Money>(typedUnits, minorUnit(2)))).toBeLessThanOrEqual(0);
      }),
    );
  });

  it('fills an empty amount within half a minor unit of units × price, and positive, or not at all', () => {
    fc.assert(
      fc.property(fc.constantFrom('units', 'price' as const), unitsTyped, prices, (field, typedUnits, typedPrice) => {
        const filled = fillRow<FillRow>(field, { amount: null, units: typedUnits, price: typedPrice }, 8, 'EUR');
        const exact = valueAt(typedUnits, typedPrice);
        if (compare(exact, decimal('0.005')) <= 0) {
          expect(filled.amount).toBeNull();
          return;
        }
        const amount = filled.amount as Money;
        expect(isPositive(amount)).toBe(true);
        expect(compare(abs(minus(amount, exact)), decimal('0.005'))).toBeLessThanOrEqual(0);
        expect(filled).toEqual({ amount, units: typedUnits, price: typedPrice });
      }),
    );
  });

  // Units of at most one at a price of at most half a cent: their product rounds half-even to 0.00.
  it('never fills an amount that would round to 0', () => {
    const fewUnits = positive(10n ** 8n, 8).map((value) => value as Units);
    const tinyPrices = positive(50n, 4).map((value) => value as Price);
    fc.assert(
      fc.property(fc.constantFrom('units', 'price' as const), fewUnits, tinyPrices, (field, typedUnits, typedPrice) => {
        const row = { amount: null, units: typedUnits, price: typedPrice };
        expect(fillRow<FillRow>(field, row, 8, 'EUR')).toEqual(row);
      }),
    );
  });

  it('never fills a zero amount', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('amount', 'units', 'price' as const),
        unitsTyped,
        prices,
        coinDecimals,
        (field, typedUnits, typedPrice, decimals) => {
          const row = { amount: decimal('0') as Money, units: typedUnits, price: typedPrice };
          expect(fillRow<FillRow>(field, row, decimals, 'EUR')).toEqual(row);
        },
      ),
    );
  });

  it('leaves given units as given when the amount is edited', () => {
    fc.assert(
      fc.property(amounts, unitsTyped, fc.option(prices), coinDecimals, (amount, typedUnits, typedPrice, decimals) => {
        const filled = fillRow<FillRow>('amount', { amount, units: typedUnits, price: typedPrice }, decimals, 'EUR');
        expect(filled.units).toBe(typedUnits);
        expect(filled.amount).toBe(amount);
      }),
    );
  });

  // A coin under a cent (PEPE at 0.0000123 EUR) bought with a few euros: the minor unit alone would price it 0.
  it('never derives a price of 0 when the amount and the units are positive', () => {
    const manyUnits = positive(10n ** 18n, 10).map((value) => value as Units);
    fc.assert(
      fc.property(fc.constantFrom('amount', 'units' as const), amounts, manyUnits, (field, amount, typedUnits) => {
        const filled = fillRow<FillRow>(field, { amount, units: typedUnits, price: null }, 10, 'EUR');
        expect(isPositive(filled.price as Price)).toBe(true);
      }),
    );
  });
});
