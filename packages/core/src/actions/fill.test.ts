import { describe, expect, it } from 'vitest';
import { money, units } from '../../test/builders';
import type { Price } from '../money/decimal';
import { fillRow } from './fill';

const price = (value: string) => value as Price;
const row = (amount: string | null, unitsValue: string | null, priceValue: string | null) => ({
  amount: amount === null ? null : money(amount),
  units: unitsValue === null ? null : units(unitsValue),
  price: priceValue === null ? null : price(priceValue),
});

describe('fillRow (ADR-0034, docs/DOMAIN.md §6)', () => {
  it('derives the price from the amount when the units are edited, half-even at PRICE_FIGURES or the minor unit', () => {
    expect(fillRow('units', row('100', '3', '1'), 8, 'EUR')).toEqual(row('100', '3', '33.33'));
    // 12.345 / 1 → 12.34 and 12.355 → 12.36: half-even at the minor unit, which keeps four figures here.
    expect(fillRow('units', row('12.345', '1', null), 8, 'EUR').price).toBe('12.34');
    expect(fillRow('units', row('12.355', '1', null), 8, 'EUR').price).toBe('12.36');
    // Under one, four significant figures keep more than the minor unit: 0.12345 → 0.1234, 0.125 stays.
    expect(fillRow('units', row('0.12345', '1', null), 8, 'EUR').price).toBe('0.1234');
    expect(fillRow('units', row('0.125', '1', null), 8, 'EUR').price).toBe('0.125');
  });

  // PEPE at 0.0000123 EUR: at the minor unit alone the implied price would be 0.00.
  it('keeps the significant figures of a price under a cent, so it never derives 0', () => {
    expect(fillRow('units', row('10', '813008', null), 0, 'EUR').price).toBe('0.0000123');
    expect(fillRow('amount', row('20', '1626016', '1'), 0, 'EUR').price).toBe('0.0000123');
  });

  it('derives the units when the price is edited, toward zero at the coin decimals', () => {
    expect(fillRow('price', row('100', '1', '60000'), 8, 'EUR')).toEqual(row('100', '0.00166666', '60000'));
    expect(fillRow('price', row('100', null, '60000'), 4, 'EUR').units).toBe('0.0016');
    // Exactly representable: nothing is rounded away.
    expect(fillRow('price', row('70', null, '35000'), 8, 'EUR').units).toBe('0.002');
  });

  it('caps the units at ten decimals whatever the coin says', () => {
    expect(fillRow('price', row('1', null, '3'), 12, 'EUR').units).toBe('0.3333333333');
  });

  it('derives the price from given units when the amount is edited, else the units from the price', () => {
    expect(fillRow('amount', row('50', '9', '25000'), 8, 'EUR')).toEqual(row('50', '9', '5.556'));
    expect(fillRow('amount', row('50', '0.002', null), 8, 'EUR')).toEqual(row('50', '0.002', '25000'));
    expect(fillRow('amount', row('50', null, '25000'), 8, 'EUR')).toEqual(row('50', '0.002', '25000'));
    expect(fillRow('amount', row('50', '0', '25000'), 8, 'EUR')).toEqual(row('50', '0.002', '25000'));
    expect(fillRow('amount', row('50', null, null), 8, 'EUR')).toEqual(row('50', null, null));
  });

  it('fills an empty amount from the units and the price on a units or a price edit, never on an amount edit', () => {
    expect(fillRow('units', row(null, '1', '2'), 8, 'EUR')).toEqual(row('2', '1', '2'));
    expect(fillRow('price', row(null, '1', '2'), 8, 'EUR')).toEqual(row('2', '1', '2'));
    expect(fillRow('amount', row(null, '1', '2'), 8, 'EUR')).toEqual(row(null, '1', '2'));
    expect(fillRow('units', row(null, '1', null), 8, 'EUR')).toEqual(row(null, '1', null));
    expect(fillRow('price', row(null, null, '2'), 8, 'EUR')).toEqual(row(null, null, '2'));
    expect(fillRow('price', row(null, '0', '2'), 8, 'EUR')).toEqual(row(null, '0', '2'));
  });

  it('rounds a filled amount half-even at the minor unit', () => {
    expect(fillRow('units', row(null, '1', '0.125'), 8, 'EUR').amount).toBe('0.12');
    expect(fillRow('units', row(null, '1', '0.135'), 8, 'EUR').amount).toBe('0.14');
    // 0.002 × 60,000.12 = 120.00024.
    expect(fillRow('price', row(null, '0.002', '60000.12'), 8, 'EUR').amount).toBe('120');
  });

  // 100 PEPE at 0.0000123 would fill 0.00, which the save refuses and a receipt at no cost would store as a cost of 0.
  it('never fills an amount that rounds to 0', () => {
    expect(fillRow('units', row(null, '1', '0.004'), 8, 'EUR')).toEqual(row(null, '1', '0.004'));
    expect(fillRow('price', row(null, '1', '0.005'), 8, 'EUR')).toEqual(row(null, '1', '0.005'));
    expect(fillRow('price', row(null, '1', '0.006'), 8, 'EUR').amount).toBe('0.01');
  });

  it('never fills a zero amount, and treats a zero source like an empty one', () => {
    for (const field of ['amount', 'units', 'price'] as const) {
      expect(fillRow(field, row('0', '1', '2'), 8, 'EUR')).toEqual(row('0', '1', '2'));
    }
    expect(fillRow('units', row('10', '0', '2'), 8, 'EUR')).toEqual(row('10', '0', '2'));
    expect(fillRow('units', row('10', null, '2'), 8, 'EUR')).toEqual(row('10', null, '2'));
    expect(fillRow('price', row('10', '1', '0'), 8, 'EUR')).toEqual(row('10', '1', '0'));
    expect(fillRow('price', row('10', '1', null), 8, 'EUR')).toEqual(row('10', '1', null));
    expect(fillRow('amount', row('10', '0', '0'), 8, 'EUR')).toEqual(row('10', '0', '0'));
  });

  it('treats an unknown field as a programmer error', () => {
    expect(() => fillRow('fee' as unknown as 'amount', row('1', '1', '1'), 8, 'EUR')).toThrow();
  });

  it('keeps the other fields of the row', () => {
    const typed = { ...row('100', null, '50'), coin: 'BTC' };
    expect(fillRow('price', typed, 8, 'EUR')).toEqual({ ...typed, units: '2' });
  });
});
