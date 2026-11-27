import { ExchangeSchema } from '@proofofcalm/data';
import { describe, expect, it } from 'vitest';
import catalogue from '../../packages/content/coins.json' with { type: 'json' };
import raw from './pairs.json' with { type: 'json' };
import { PAIRS, PairsSchema } from './pairs.ts';

const coins = new Set(catalogue.map((coin) => coin.id));

describe('pairs.json', () => {
  it('names only coins of packages/content/coins.json', () => {
    for (const coin of Object.keys(raw)) expect(coins, coin).toContain(coin);
  });

  it('names only exchanges of ExchangeSchema', () => {
    for (const exchanges of Object.values(raw)) {
      for (const exchange of Object.keys(exchanges)) {
        expect(ExchangeSchema.safeParse(exchange).success, exchange).toBe(true);
      }
    }
  });

  it('holds no Coinbase pair while Coinbase stays off (ADR-0036, Reading of Coinbase’s terms)', () => {
    for (const exchanges of Object.values(PAIRS)) expect(exchanges).not.toHaveProperty('coinbase');
  });

  it('loads through the schema unchanged', () => {
    expect(PAIRS).toEqual(raw);
  });

  it('refuses an unknown exchange or quote, an empty entry and a symbol outside letters and digits', () => {
    expect(PairsSchema.safeParse({ BTC: { kraken: { EUR: 'XBTEUR' } } }).success).toBe(true);
    for (const bad of [
      { BTC: { nowhere: { EUR: 'BTCEUR' } } },
      { BTC: { kraken: { GBP: 'XBTGBP' } } },
      { BTC: { kraken: {} } },
      { BTC: { kraken: { EUR: '../x' } } },
      { BTC: { kraken: { EUR: '' } } },
      { 'btc/x': { kraken: { EUR: 'XBTEUR' } } },
    ]) {
      expect(PairsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
