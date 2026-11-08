import { describe, expect, it } from 'vitest';
import { instant } from '../../test/builders';
import type { CoinId } from '../schema/ids';
import type { PriceSnapshot } from '../schema/prices';
import { fxRatio } from './fx';

const BTC = 'BTC' as CoinId;
const ETH = 'ETH' as CoinId;
const SOL = 'SOL' as CoinId;
const snapshot = (prices: Record<string, Record<string, string>>) =>
  ({ at: instant('2026-10-16T14:05:00+01:00'), prices }) as unknown as PriceSnapshot;
const prices = snapshot({
  BTC: { EUR: '60000' },
  ETH: { EUR: '2000', USD: '2340' },
  SOL: { EUR: '150', USD: '176' },
});

describe('fxRatio (docs/DOMAIN.md §3.11)', () => {
  it('is one between a currency and itself, prices or not', () => {
    expect(fxRatio(null, 'EUR', 'EUR', [BTC])).toBe('1');
  });

  it('takes the ratio from the first coin, in the order given, priced in both currencies', () => {
    expect(fxRatio(prices, 'EUR', 'USD', [BTC, ETH, SOL])).toBe('1.17');
    expect(fxRatio(prices, 'EUR', 'USD', [SOL, ETH])).toBe('1.173333333333');
    expect(fxRatio(prices, 'USD', 'EUR', [ETH])).toBe('0.854700854701');
  });

  it('skips a coin whose price is zero', () => {
    const zero = snapshot({ BTC: { EUR: '0', USD: '1' }, ETH: { EUR: '2000', USD: '2340' } });
    expect(fxRatio(zero, 'EUR', 'USD', [BTC, ETH])).toBe('1.17');
  });

  it('has no ratio without a coin priced in both currencies, or without prices', () => {
    expect(fxRatio(prices, 'EUR', 'GBP', [BTC, ETH, SOL])).toBeNull();
    expect(fxRatio(prices, 'EUR', 'USD', [])).toBeNull();
    expect(fxRatio(null, 'EUR', 'USD', [BTC])).toBeNull();
  });
});
