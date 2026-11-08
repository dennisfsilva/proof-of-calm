import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, money, units } from '../../test/builders';
import type { Units } from '../money/decimal';
import type { CoinId } from '../schema/ids';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { holdingsValue, snapshotValue } from './snapshot';

const plan = aPlan({ coins: [BTC, ETH] });
const history = (closes: Record<string, string>) => Object.entries(closes) as unknown as PriceHistory;
const histories = (coins: Record<string, PriceHistory>, currency = 'EUR') =>
  ({ currency, coins }) as unknown as PriceHistories;
const trade = (kind: 'extra' | 'sell' | 'held', coin: string, day: string, quantity: string) =>
  anEntry({ kind, slot: null, coin: coin as never, date: date(day), units: units(quantity), amount: money('100') });

const ETH_CLOSES = history({ '2026-12-30': '9', '2026-12-31': '10.005' });
const market = histories({
  BTC: history({ '2026-12-30': '90', '2026-12-31': '100', '2027-01-01': '110' }),
  ETH: ETH_CLOSES,
});

describe('snapshotValue (docs/DOMAIN.md §3.13): the value at the end of a date', () => {
  it('counts an entry dated on the date and not one dated the day after', () => {
    const entries = [trade('extra', 'BTC', '2026-12-31', '1'), trade('extra', 'BTC', '2027-01-01', '5')];
    expect(snapshotValue(plan, entries, market, date('2026-12-31'))).toEqual({
      date: '2026-12-31',
      currency: 'EUR',
      coins: [{ coin: 'BTC', units: '1', value: '100' }],
      total: '100',
      missing: [],
    });
  });

  it('prices each coin at the close dated exactly the date, with no neighbouring close', () => {
    const entries = [trade('extra', 'BTC', '2026-01-01', '1'), trade('extra', 'ETH', '2026-01-01', '2')];
    const gapped = histories({ BTC: history({ '2026-12-30': '90', '2027-01-01': '110' }), ETH: ETH_CLOSES });
    expect(snapshotValue(plan, entries, gapped, date('2026-12-31'))).toEqual({
      date: '2026-12-31',
      currency: 'EUR',
      coins: [
        { coin: 'BTC', units: '1', value: null },
        { coin: 'ETH', units: '2', value: '20.01' },
      ],
      total: null,
      missing: ['BTC'],
    });
  });

  it('counts a negative holding as none, and skips deleted entries', () => {
    const entries = [
      trade('extra', 'ETH', '2026-01-01', '1'),
      trade('sell', 'ETH', '2026-02-01', '3'),
      { ...trade('extra', 'BTC', '2026-01-01', '1'), deletedAt: '2026-01-02T00:00:00Z' as never },
    ];
    expect(snapshotValue(plan, entries, market, date('2026-12-31'))).toEqual({
      date: '2026-12-31',
      currency: 'EUR',
      coins: [],
      total: '0',
      missing: [],
    });
  });

  it('counts held entries and sales', () => {
    const entries = [trade('held', 'BTC', '2026-01-01', '1.5'), trade('sell', 'BTC', '2026-06-01', '0.25')];
    expect(snapshotValue(plan, entries, market, date('2026-12-31')).coins).toEqual([
      { coin: 'BTC', units: '1.25', value: '125' },
    ]);
  });

  it('lists a coin outside the histories as missing, after the plan’s coins', () => {
    const entries = [trade('extra', 'SOL', '2026-01-01', '3'), trade('extra', 'ETH', '2026-01-01', '1')];
    const value = snapshotValue(plan, entries, market, date('2026-12-31'));
    expect(value.coins).toEqual([
      { coin: 'ETH', units: '1', value: '10.005' },
      { coin: 'SOL', units: '3', value: null },
    ]);
    expect(value.missing).toEqual(['SOL']);
    expect(value.total).toBeNull();
  });

  it('lists every held coin as missing when the histories are in another currency', () => {
    const entries = [trade('extra', 'BTC', '2026-01-01', '1'), trade('extra', 'ETH', '2026-01-01', '1')];
    const value = snapshotValue(plan, entries, histories(market.coins, 'USD'), date('2026-12-31'));
    expect(value.currency).toBe('EUR');
    expect(value.coins.map((coin) => coin.value)).toEqual([null, null]);
    expect(value.missing).toEqual(['BTC', 'ETH']);
    expect(value.total).toBeNull();
  });

  it('reads the closes of 31 December in a leap year (2028) and in another (2026)', () => {
    const closes = histories({
      BTC: history({ '2028-02-29': '50', '2028-12-30': '70', '2028-12-31': '80', '2029-01-01': '90' }),
    });
    const entries = [trade('extra', 'BTC', '2028-02-29', '2')];
    expect(snapshotValue(plan, entries, closes, date('2028-12-31')).total).toBe('160');
    expect(snapshotValue(plan, entries, closes, date('2028-02-29')).total).toBe('100');
    expect(snapshotValue(plan, entries, closes, date('2028-12-29')).missing).toEqual(['BTC']);
    expect(snapshotValue(plan, [trade('extra', 'BTC', '2026-12-31', '2')], market, date('2026-12-31')).total).toBe(
      '200',
    );
  });
});

describe('holdingsValue (docs/DOMAIN.md §3.13): units priced at one date’s closes', () => {
  it('orders the plan’s coins first, drops what is not positive and sums exactly', () => {
    const held = new Map<CoinId, Units>([
      ['SOL' as CoinId, '0' as Units],
      ['ETH' as CoinId, '0.1' as Units],
      ['BTC' as CoinId, '0.5' as Units],
    ]);
    expect(holdingsValue(plan, held, market, date('2026-12-31'))).toEqual({
      date: '2026-12-31',
      currency: 'EUR',
      coins: [
        { coin: 'BTC', units: '0.5', value: '50' },
        { coin: 'ETH', units: '0.1', value: '1.0005' },
      ],
      total: '51.0005',
      missing: [],
    });
  });

  it('finds no close in an empty history', () => {
    const held = new Map<CoinId, Units>([['BTC' as CoinId, '1' as Units]]);
    const empty = histories({ BTC: [] as unknown as PriceHistory });
    expect(holdingsValue(plan, held, empty, date('2026-12-31')).missing).toEqual(['BTC']);
  });
});
