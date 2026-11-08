// The three-way fill of the entry form (ADR-0034, docs/DOMAIN.md §6), ported from the prototype's input
// handler: editing the amount, the units or the price of a row recomputes one of the others. An amount edit
// derives the price from given units, else the units from the price; units and a price fill an absent amount.
// The units round toward zero at the coin's decimals (ADR-0017's mode for units an amount buys), the price
// half-even at PRICE_FIGURES significant figures, or at the currency's minor unit when that keeps more, so a
// coin under a cent never prices 0, and the amount half-even at the minor unit, never filled when that is 0.
// An empty or zero field leaves the row as it was; a zero amount is never filled.
import { PRICE_FIGURES } from '../constants';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import {
  type Decimal,
  isPositive,
  type Money,
  type Price,
  quotientSignificant,
  round,
  type Units,
  unitsFor,
  valueAt,
} from '../money/decimal';
import { assertNever } from '../result';
import { MAX_UNIT_DECIMALS } from '../schema/entry';

export type FillField = 'amount' | 'units' | 'price';
export type FillRow = { readonly amount: Money | null; readonly units: Units | null; readonly price: Price | null };

const positive = <T extends Decimal>(value: T | null): value is T => value !== null && isPositive(value);

/** The row after `field` was edited; the implied price is for the form only, never stored (§2.2). */
export function fillRow<R extends FillRow>(field: FillField, row: R, coinDecimals: number, currency: CurrencyCode): R {
  const { amount, units, price } = row;
  if (amount === null) {
    if (field === 'amount' || !positive(units) || !positive(price)) return row;
    const filled = round(valueAt(units, price), MINOR_UNITS[currency], 'half-even');
    return isPositive(filled) ? { ...row, amount: filled } : row;
  }
  if (!positive(amount)) return row;
  const unitsAt = (at: Price): R => ({
    ...row,
    units: unitsFor(amount, at, Math.min(coinDecimals, MAX_UNIT_DECIMALS)),
  });
  const priceOf = (of: Units): R => ({
    ...row,
    price: quotientSignificant<Price>(amount, of, PRICE_FIGURES, MINOR_UNITS[currency], 'half-even'),
  });
  switch (field) {
    case 'units':
      return positive(units) ? priceOf(units) : row;
    case 'price':
      return positive(price) ? unitsAt(price) : row;
    case 'amount':
      if (positive(units)) return priceOf(units);
      return positive(price) ? unitsAt(price) : row;
    default:
      return assertNever(field);
  }
}
