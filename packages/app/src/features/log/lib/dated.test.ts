import type { Price, PriceSnapshot } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, month } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { emptiedFills, isFilledPrice, withDate } from './dated';
import { editRow, type FormContext, type FormState, initialState } from './form';

// The price the form fills belongs to the day it opened (ADR-0034 Readings, DOMAIN §6 "Fill a form row").

const en = createNumberInput('en-GB');
const prices: PriceSnapshot = {
  at: instant('2026-10-20T09:59:30.000Z'),
  prices: { BTC: { EUR: '60000.12' as Price } } as PriceSnapshot['prices'],
};
const september = anEntry({ date: date('2026-09-01'), slot: month('2026-09') });
const context = (overrides: Partial<FormContext> = {}): FormContext => ({
  plan: aPlan(),
  entries: [september],
  today: date('2026-10-20'),
  prices,
  numberInput: en,
  ...overrides,
});
const extra = initialState('extra', [], undefined, context());
const monthly = initialState('dca', [], undefined, context());
const dated = (state: FormState, day: string, initial = extra) => withDate(state, day, initial, en, 'EUR');
const typed = (state: FormState, field: 'amount' | 'units' | 'price', text: string) =>
  editRow(state, 0, field, text, en, 'EUR');
const btc = (state: FormState) => state.rows[0];

describe('withDate', () => {
  it('fills no amount from units typed alone on an earlier date', () => {
    const earlier = dated(extra, '2026-10-18');
    expect(btc(earlier)).toMatchObject({ amount: '', units: '', price: '', derived: null });
    expect(btc(typed(earlier, 'units', '0.002'))).toMatchObject({ amount: '', units: '0.002', price: '' });
  });

  it('derives no units from an amount typed alone on an earlier date', () => {
    expect(btc(typed(dated(extra, '2026-10-18'), 'amount', '120.00'))).toMatchObject({ units: '', price: '' });
    const earlier = dated(typed(extra, 'amount', '120.00'), '2026-10-18');
    expect(btc(earlier)).toMatchObject({ amount: '120.00', units: '', price: '', derived: 'units' });
    // A monthly buy keeps its planned amount; the units the filled price gave go with it.
    expect(btc(dated(monthly, '2026-10-01', monthly))).toMatchObject({ amount: '70.00', units: '', price: '' });
  });

  it('fills the opened price again on the opening day or later, and derives the units from it again', () => {
    const earlier = dated(typed(extra, 'amount', '120.00'), '2026-10-18');
    for (const day of ['2026-10-20', '2026-10-21']) {
      expect(btc(dated(earlier, day))).toMatchObject({ amount: '120.00', units: '0.00199999', price: '60,000.12' });
    }
    expect(dated(dated(monthly, '2026-10-01', monthly), '2026-10-20', monthly)).toEqual(monthly);
    // Typed units that read as none beside a typed amount stay as typed: the price comes back without the fill.
    const zero = { ...earlier, rows: [{ ...earlier.rows[0], units: '0', derived: null }, ...earlier.rows.slice(1)] };
    expect(btc(dated(zero as FormState, '2026-10-20'))).toMatchObject({ units: '0', price: '60,000.12' });
  });

  it('leaves a typed price, a derived price, a sale and an edit as they are', () => {
    const price = typed(extra, 'price', '50000');
    expect(dated(price, '2026-10-18').rows).toEqual(price.rows);
    const derived = typed(typed(extra, 'amount', '120.00'), 'units', '0.002');
    expect(btc(derived)?.derived).toBe('price');
    expect(dated(derived, '2026-10-18').rows).toEqual(derived.rows);
    const sell = initialState('sell', [], undefined, context());
    const priced = { ...sell, rows: sell.rows.map((row) => ({ ...row, price: '60,000.12' })) };
    expect(dated(priced, '2026-10-18', priced)).toEqual({ ...priced, date: '2026-10-18' });
    const edit = initialState('dca', [september], undefined, context());
    expect(dated(edit, '2026-08-01', edit)).toEqual({ ...edit, date: '2026-08-01' });
  });

  it('changes no price while the date is cleared, partly typed or no calendar day', () => {
    for (const day of ['', '2026-10', '2026-02-30']) expect(dated(extra, day)).toEqual({ ...extra, date: day });
  });
});

describe('isFilledPrice and emptiedFills', () => {
  it('count a price typed as the opened text as the fill, and a cleared one as emptied', () => {
    const [opened] = extra.rows;
    expect(isFilledPrice({ ...opened!, price: '60,000.12' }, opened)).toBe(true);
    expect(isFilledPrice({ ...opened!, price: '' }, opened)).toBe(true);
    expect(isFilledPrice({ ...opened!, price: '50,000' }, opened)).toBe(false);
    expect(isFilledPrice(opened!, undefined)).toBe(false);
    expect(isFilledPrice(extra.rows[1]!, extra.rows[1])).toBe(false);
  });

  it('tell an earlier date with an emptied fill, until a price is typed or derived', () => {
    const earlier = dated(extra, '2026-10-18');
    expect(emptiedFills(earlier, extra)).toBe(true);
    expect(emptiedFills(extra, extra)).toBe(false);
    expect(emptiedFills(dated(earlier, ''), extra)).toBe(false);
    expect(emptiedFills(typed(earlier, 'price', '58000'), extra)).toBe(false);
    expect(emptiedFills(typed(typed(earlier, 'amount', '120'), 'units', '0.002'), extra)).toBe(false);
  });
});
