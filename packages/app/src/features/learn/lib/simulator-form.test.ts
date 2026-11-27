import {
  addDays,
  type CalendarDate,
  type Coin,
  type CoinId,
  type Money,
  type Price,
  type PriceHistory,
  type SimulationError,
  type Split,
  simulate,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { type ClosesByCoin, type FieldError, fieldOf, readForm, type SimulatorFields } from './simulator-form';

// The simulator's form (docs/EDUCATION.md §7, the verdicts V1 to V3 of #14): what the person typed, read in the
// formatting locale (ADR-0034) and checked against the chosen coins' closes before the core runs, so every
// refusal sits under its field and every chosen coin without closes is marked. Synthetic closes only.

const id = (text: string) => text as CoinId;
const date = (text: string) => text as CalendarDate;
const coin = (symbol: string, name: string): Coin =>
  ({ id: id(symbol), name, geckoId: name.toLowerCase(), decimals: 8 }) as Coin;
const BTC = coin('BTC', 'Bitcoin');
const ETH = coin('ETH', 'Ethereum');
const SOL = coin('SOL', 'Solana');
const english = createNumberInput('en-GB');

// F, the latest first close, is ETH's; L, the earliest last close, is ETH's too.
const F = date('2024-03-05');
const L = date('2025-10-15');
const closes: ClosesByCoin = {
  [id('BTC')]: { first: date('2024-01-10'), last: date('2025-12-20') },
  [id('ETH')]: { first: F, last: L },
  [id('SOL')]: 'none',
};

const fields = (changes: Partial<SimulatorFields> = {}): SimulatorFields => ({
  split: { coins: [BTC, ETH], shares: { [id('BTC')]: '60', [id('ETH')]: '40' } },
  amount: '100',
  buyDay: 15,
  start: date('2024-04-01'),
  end: date('2025-09-30'),
  fee: '',
  ...changes,
});
const shares = (values: Record<string, string>): SimulatorFields['split'] => ({
  coins: Object.keys(values).map((symbol) => coin(symbol, `Coin ${symbol}`)),
  shares: values as Record<CoinId, string>,
});
const closesFor = (symbols: readonly string[]): ClosesByCoin =>
  Object.fromEntries(symbols.map((symbol) => [symbol, { first: F, last: L }]));
const errorsOf = (result: ReturnType<typeof readForm>): FieldError[] => (result.ok ? [] : result.error);

/** Daily closes at a constant 100 from `first` to `last`, for the core's own run. */
function constant(first: CalendarDate, last: CalendarDate): PriceHistory {
  const days: [CalendarDate, Price][] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push([day, '100' as Price]);
  return days;
}
const runCore = (split: Split, coins: readonly string[]) =>
  simulate({
    split,
    monthlyAmount: '100' as Money,
    startDate: date('2024-04-01'),
    endDate: date('2024-06-30'),
    buyDay: 15,
    histories: {
      currency: 'EUR',
      coins: Object.fromEntries(coins.map((symbol) => [symbol, constant(F, date('2024-06-30'))])),
    },
  });

describe('readForm', () => {
  it('reads the fields as the core’s input: the shares, the amount and the fee as decimal strings', () => {
    const result = readForm(fields({ fee: '0.5' }), closes, english);
    expect(result).toEqual({
      ok: true,
      value: {
        split: { BTC: '60', ETH: '40' },
        monthlyAmount: '100',
        startDate: '2024-04-01',
        endDate: '2025-09-30',
        buyDay: 15,
        feePercent: '0.5',
      },
    });
  });

  describe('the amount (V1)', () => {
    it.each([
      ['0', false],
      ['0.01', true],
      ['0.001', false],
      ['', false],
    ])('%s is accepted: %s', (amount, accepted) => {
      const result = readForm(fields({ amount }), closes, english);
      expect(result.ok).toBe(accepted);
      if (!accepted) expect(errorsOf(result)).toEqual([{ field: 'amount', code: 'invalid-amount' }]);
    });

    it('is read in the locale, and what cannot be read keeps the input’s code', () => {
      const pt = createNumberInput('pt-PT');
      expect(readForm(fields({ amount: '1234,56' }), closes, pt)).toMatchObject({
        ok: true,
        value: { monthlyAmount: '1234.56' },
      });
      expect(errorsOf(readForm(fields({ amount: 'ten' }), closes, english))).toEqual([
        { field: 'amount', code: 'number-invalid', example: '1,234.56' },
      ]);
    });
  });

  describe('the fee (V1)', () => {
    it.each([
      ['', '0'],
      ['0', '0'],
      ['0.0001', '0.0001'],
      ['99.9999', '99.9999'],
      ['1.2345', '1.2345'],
    ])('%j is accepted as %s', (fee, read) => {
      expect(readForm(fields({ fee }), closes, english)).toMatchObject({ ok: true, value: { feePercent: read } });
    });

    it.each([
      ['100', 'invalid-fee'],
      ['1.23456', 'invalid-fee'],
      ['-0.0001', 'number-negative'],
    ])('%s is refused with %s', (fee, code) => {
      expect(errorsOf(readForm(fields({ fee }), closes, english))).toEqual([{ field: 'fee', code }]);
    });
  });

  describe('the buy day', () => {
    it.each([1, 28])('%i is accepted', (buyDay) => {
      expect(readForm(fields({ buyDay }), closes, english)).toMatchObject({ ok: true, value: { buyDay } });
    });

    it.each([0, 29, 2.5])('%s is refused', (buyDay) => {
      expect(errorsOf(readForm(fields({ buyDay }), closes, english))).toEqual([
        { field: 'buyDay', code: 'invalid-buy-day' },
      ]);
    });
  });

  describe('the split (V3)', () => {
    const accepted: [string, Record<string, string>][] = [
      ['one coin at 100', { BTC: '100' }],
      ['99.9999 and 0.0001', { BTC: '99.9999', ETH: '0.0001' }],
      ['4 decimals', { BTC: '33.3333', ETH: '66.6667' }],
    ];
    const refused: [string, Record<string, string>, Record<string, string>, string][] = [
      ['an empty share', { BTC: '' }, { BTC: '0' }, 'split-sum'],
      [
        '99.9999 and 0.0002, 100.0001 in all',
        { BTC: '99.9999', ETH: '0.0002' },
        { BTC: '99.9999', ETH: '0.0002' },
        'split-sum',
      ],
      ['one coin at 100.0001', { BTC: '100.0001' }, { BTC: '100.0001' }, 'split-sum'],
      ['5 decimals', { BTC: '33.33333', ETH: '66.66667' }, { BTC: '33.33333', ETH: '66.66667' }, 'split-precision'],
      ['-1', { BTC: '101', ETH: '-1' }, { BTC: '101', ETH: '-1' }, 'number-negative'],
    ];

    it.each(accepted)('%s runs, as the core runs it', (_, values) => {
      const symbols = Object.keys(values);
      const result = readForm(fields({ split: shares(values) }), closesFor(symbols), english);
      expect(result.ok).toBe(true);
      if (result.ok) expect(runCore(result.value.split, symbols).ok).toBe(true);
    });

    it.each(refused)('%s is refused, as the core refuses it with invalid-split', (_, typed, meant, code) => {
      const symbols = Object.keys(typed);
      const result = readForm(fields({ split: shares(typed) }), closesFor(symbols), english);
      expect(errorsOf(result).map((error) => [error.field, error.code])).toContainEqual(['split', code]);
      expect(runCore(meant as Split, symbols)).toEqual({ ok: false, error: { code: 'invalid-split' } });
    });

    it('reads a share with the pt-PT decimal comma', () => {
      const pt = createNumberInput('pt-PT');
      const result = readForm(
        fields({ split: shares({ BTC: '99,9999', ETH: '0,0001' }) }),
        closesFor(['BTC', 'ETH']),
        pt,
      );
      expect(result).toMatchObject({ ok: true, value: { split: { BTC: '99.9999', ETH: '0.0001' } } });
    });

    it('no coin means no run, as the core refuses an empty split', () => {
      const result = readForm(fields({ split: { coins: [], shares: {} } }), closes, english);
      expect(errorsOf(result)).toEqual([{ field: 'split', code: 'split-sum' }]);
      expect(runCore({}, [])).toEqual({ ok: false, error: { code: 'invalid-split' } });
    });

    it('marks every chosen coin with a share and no closes, not only the first as the core does', () => {
      const none: ClosesByCoin = { [id('BTC')]: 'none', [id('ETH')]: 'none' };
      const result = readForm(fields(), none, english);
      expect(errorsOf(result)).toEqual([
        { field: 'split', code: 'history-missing', coin: 'BTC' },
        { field: 'split', code: 'history-missing', coin: 'ETH' },
      ]);
    });

    it('a coin whose closes have not come counts as one with none', () => {
      const result = readForm(fields(), { [id('BTC')]: closes[id('BTC')] } as ClosesByCoin, english);
      expect(errorsOf(result)).toEqual([{ field: 'split', code: 'history-missing', coin: 'ETH' }]);
    });

    it('a coin at a share of 0 with no closes still runs, as the core skips it', () => {
      const split = { coins: [BTC, ETH, SOL], shares: { [id('BTC')]: '60', [id('ETH')]: '40', [id('SOL')]: '0' } };
      const result = readForm(fields({ split }), closes, english);
      expect(result).toMatchObject({ ok: true, value: { split: { BTC: '60', ETH: '40', SOL: '0' } } });
    });
  });

  describe('the dates (V2)', () => {
    it.each([
      [addDays(F, -1), false],
      [F, true],
      [addDays(F, 1), true],
    ])('a start on %s is accepted: %s', (start, accepted) => {
      const result = readForm(fields({ start }), closes, english);
      expect(result.ok).toBe(accepted);
      if (!accepted) {
        expect(errorsOf(result)).toEqual([{ field: 'start', code: 'history-starts-later', coin: 'ETH', date: F }]);
      }
    });

    it.each([
      [addDays(L, -1), true],
      [L, true],
      [addDays(L, 1), false],
    ])('an end on %s is accepted: %s', (end, accepted) => {
      const result = readForm(fields({ end }), closes, english);
      expect(result.ok).toBe(accepted);
      if (!accepted) {
        expect(errorsOf(result)).toEqual([{ field: 'end', code: 'history-ends-earlier', coin: 'ETH', date: L }]);
      }
    });

    it('an end the day before the start is refused, and one on the start runs', () => {
      const start = date('2024-06-10');
      expect(errorsOf(readForm(fields({ start, end: addDays(start, -1) }), closes, english))).toEqual([
        { field: 'end', code: 'invalid-dates' },
      ]);
      expect(readForm(fields({ start, end: start }), closes, english).ok).toBe(true);
    });

    it('an empty date asks for a full one', () => {
      expect(errorsOf(readForm(fields({ start: '', end: '' }), closes, english))).toEqual([
        { field: 'start', code: 'date-required' },
        { field: 'end', code: 'date-required' },
      ]);
    });

    it('a coin added whose closes start after the start names that coin and its first date', () => {
      const start = date('2024-02-01');
      const btcOnly = fields({ start, split: { coins: [BTC], shares: { [id('BTC')]: '100' } } });
      expect(readForm(btcOnly, closes, english).ok).toBe(true);
      const added = fields({ start });
      expect(errorsOf(readForm(added, closes, english))).toEqual([
        { field: 'start', code: 'history-starts-later', coin: 'ETH', date: F },
      ]);
    });

    it('a coin at a share of 0 does not bound the dates', () => {
      const split = { coins: [BTC, ETH], shares: { [id('BTC')]: '100', [id('ETH')]: '0' } };
      expect(readForm(fields({ split, start: date('2024-02-01') }), closes, english).ok).toBe(true);
    });
  });

  it('gives every field’s refusal at once, in the order of the fields', () => {
    const result = readForm(
      fields({ split: shares({ BTC: '50' }), amount: '0', buyDay: 29, start: '', end: '', fee: '100' }),
      closesFor(['BTC']),
      english,
    );
    expect(errorsOf(result).map((error) => error.field)).toEqual(['split', 'amount', 'buyDay', 'start', 'end', 'fee']);
  });
});

describe('fieldOf', () => {
  it.each<[SimulationError, FieldError]>([
    [{ code: 'invalid-split' }, { field: 'split', code: 'invalid-split' }],
    [{ code: 'invalid-amount' }, { field: 'amount', code: 'invalid-amount' }],
    [{ code: 'invalid-fee' }, { field: 'fee', code: 'invalid-fee' }],
    [{ code: 'invalid-buy-day' }, { field: 'buyDay', code: 'invalid-buy-day' }],
    [{ code: 'invalid-dates' }, { field: 'end', code: 'invalid-dates' }],
    [
      { code: 'history-missing', coin: id('SOL') },
      { field: 'split', code: 'history-missing', coin: id('SOL') },
    ],
    [
      { code: 'history-starts-later', coin: id('ETH'), first: F },
      { field: 'start', code: 'history-starts-later', coin: id('ETH'), date: F },
    ],
    [
      { code: 'history-ends-earlier', coin: id('ETH'), last: L },
      { field: 'end', code: 'history-ends-earlier', coin: id('ETH'), date: L },
    ],
  ])('puts %j under its field', (error, field) => {
    expect(fieldOf(error)).toEqual(field);
  });

  it('puts the core’s own refusals where readForm puts the same ones', () => {
    const early = fields({ start: addDays(F, -1) });
    const histories = { BTC: constant(date('2024-01-10'), date('2025-12-20')), ETH: constant(F, L) };
    const read = readForm({ ...early, start: F }, closes, english);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const core = simulate({
      ...read.value,
      startDate: addDays(F, -1),
      histories: { currency: 'EUR', coins: histories },
    });
    expect(core.ok).toBe(false);
    if (core.ok) return;
    expect([fieldOf(core.error)]).toEqual(errorsOf(readForm(early, closes, english)));
  });
});
