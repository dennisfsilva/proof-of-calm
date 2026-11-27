import { describe, expect, it } from 'vitest';
import {
  DatasetSchema,
  ExchangeSchema,
  FxFileSchema,
  QuoteSchema,
  ReferenceDaySchema,
  STORE_HEADER,
  StoreRowSchema,
  StoreRowsSchema,
} from './schema';

// Synthetic values only: no exchange's close appears in this repository (ADR-0036, Reading of 2026-11-27).
const row = (date: string, close: string) => ({ date, close });

describe('the exchanges and quotes', () => {
  it('names the three exchanges and the two quotes, nothing else', () => {
    expect(ExchangeSchema.options).toEqual(['kraken', 'bitstamp', 'coinbase']);
    expect(QuoteSchema.options).toEqual(['EUR', 'USD']);
    expect(ExchangeSchema.safeParse('binance').success).toBe(false);
    expect(QuoteSchema.safeParse('GBP').success).toBe(false);
  });
});

describe('a store row', () => {
  it('takes a calendar date and a decimal string above zero', () => {
    expect(StoreRowSchema.parse(row('2020-01-02', '123.45'))).toEqual(row('2020-01-02', '123.45'));
  });

  it('refuses a numeric close', () => {
    expect(StoreRowSchema.safeParse({ date: '2020-01-02', close: 123.45 }).success).toBe(false);
  });

  it('refuses a close in exponent notation, zero or below zero', () => {
    for (const close of ['1e3', '0', '0.00', '-1', 'abc']) {
      expect(StoreRowSchema.safeParse(row('2020-01-02', close)).success).toBe(false);
    }
  });

  it('refuses a date that is not a calendar day', () => {
    expect(StoreRowSchema.safeParse(row('2020-02-30', '1')).success).toBe(false);
  });

  it('allows no other field', () => {
    expect(StoreRowSchema.safeParse({ ...row('2020-01-02', '1'), volume: '2' }).success).toBe(false);
  });
});

describe('a store file', () => {
  it('has the header date,close', () => {
    expect(STORE_HEADER).toBe('date,close');
  });

  it('takes rows with ascending dates, an empty file included', () => {
    expect(StoreRowsSchema.safeParse([]).success).toBe(true);
    expect(StoreRowsSchema.safeParse([row('2020-01-01', '1'), row('2020-01-03', '2.5')]).success).toBe(true);
  });

  it('refuses unsorted dates', () => {
    expect(StoreRowsSchema.safeParse([row('2020-01-02', '1'), row('2020-01-01', '2')]).success).toBe(false);
  });

  it('refuses duplicate dates', () => {
    expect(StoreRowsSchema.safeParse([row('2020-01-01', '1'), row('2020-01-01', '1')]).success).toBe(false);
  });

  it('refuses a numeric close in any row', () => {
    expect(StoreRowsSchema.safeParse([row('2020-01-01', '1'), { date: '2020-01-02', close: 2 }]).success).toBe(false);
  });
});

describe('a reference day', () => {
  it('records one, two or three sources', () => {
    for (const sources of [1, 2, 3]) {
      expect(ReferenceDaySchema.safeParse({ ...row('2020-01-01', '10'), sources }).success).toBe(true);
    }
    for (const sources of [0, 4, 1.5, '2']) {
      expect(ReferenceDaySchema.safeParse({ ...row('2020-01-01', '10'), sources }).success).toBe(false);
    }
  });

  it('refuses a numeric close', () => {
    expect(ReferenceDaySchema.safeParse({ date: '2020-01-01', close: 10, sources: 2 }).success).toBe(false);
  });
});

describe('a dataset file', () => {
  const day = (date: string, close = '10') => ({ date, close, sources: 2 });

  it('holds one coin in EUR with ascending days', () => {
    const file = { coin: 'BTC', currency: 'EUR', days: [day('2020-01-01'), day('2020-01-02', '11.5')] };
    expect(DatasetSchema.parse(file)).toEqual(file);
  });

  it('refuses another currency', () => {
    expect(DatasetSchema.safeParse({ coin: 'BTC', currency: 'USD', days: [] }).success).toBe(false);
  });

  it('refuses a coin that is not a ticker', () => {
    expect(DatasetSchema.safeParse({ coin: 'bitcoin', currency: 'EUR', days: [] }).success).toBe(false);
  });

  it('refuses unsorted and duplicate days', () => {
    const base = { coin: 'BTC', currency: 'EUR' };
    expect(DatasetSchema.safeParse({ ...base, days: [day('2020-01-02'), day('2020-01-01')] }).success).toBe(false);
    expect(DatasetSchema.safeParse({ ...base, days: [day('2020-01-01'), day('2020-01-01')] }).success).toBe(false);
  });
});

describe('an fx file', () => {
  it('holds the EUR to USD rate per day, ascending', () => {
    const file = { base: 'EUR', currency: 'USD', days: [{ date: '2020-01-02', rate: '1.1' }] };
    expect(FxFileSchema.parse(file)).toEqual(file);
  });

  it('refuses a numeric rate, a rate of zero and unsorted days', () => {
    const base = { base: 'EUR', currency: 'USD' };
    expect(FxFileSchema.safeParse({ ...base, days: [{ date: '2020-01-02', rate: 1.1 }] }).success).toBe(false);
    expect(FxFileSchema.safeParse({ ...base, days: [{ date: '2020-01-02', rate: '0' }] }).success).toBe(false);
    const unsorted = [
      { date: '2020-01-03', rate: '1.1' },
      { date: '2020-01-02', rate: '1.2' },
    ];
    expect(FxFileSchema.safeParse({ ...base, days: unsorted }).success).toBe(false);
  });
});
