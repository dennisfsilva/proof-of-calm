import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, ETH, instant, money, split, units } from '../../test/builders';
import type { Price } from '../money/decimal';
import { portfolio } from '../portfolio/portfolio';
import type { PriceSnapshot } from '../schema/prices';
import { todayChange } from './today-change';

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const entries = [
  anEntry({ coin: 'BTC' as never, amount: money('140'), units: units('0.0024') }),
  anEntry({ coin: 'ETH' as never, amount: money('30'), units: units('0.01') }),
];
const snapshot = (change24h?: Record<string, string>): PriceSnapshot =>
  ({
    at: instant('2026-10-16T14:05:00+01:00'),
    prices: { BTC: { EUR: '60000' as Price }, ETH: { EUR: '2000' as Price } },
    ...(change24h === undefined ? {} : { change24h }),
  }) as unknown as PriceSnapshot;

describe('todayChange (docs/DOMAIN.md §3.11)', () => {
  it('compares today’s value with the value 24 hours ago implied by each coin’s change', () => {
    // BTC 144 after +20 % was 120; ETH 20 after −20 % was 25: 164 against 145.
    const prices = snapshot({ BTC: '20', ETH: '-20' });
    expect(todayChange(portfolio(plan, entries, prices), prices)).toEqual({ amount: '19', percent: '13.1034' });
  });

  it('keeps ten decimals on the earlier value', () => {
    const prices = snapshot({ BTC: '3', ETH: '0' });
    // 144 / 1.03 = 139.8058252427 (10 dp); 164 − 159.8058252427 = 4.1941747573.
    expect(todayChange(portfolio(plan, entries, prices), prices)).toEqual({
      amount: '4.1941747573',
      percent: '2.6245',
    });
  });

  it('skips coins without units, whatever their change', () => {
    const prices = snapshot({ BTC: '20' });
    const btcOnly = [entries[0] as (typeof entries)[0]];
    expect(todayChange(portfolio(plan, btcOnly, prices), prices)).toEqual({ amount: '24', percent: '20' });
  });

  it('says nothing when a held coin lacks a price or a change, or nothing is held', () => {
    const partial = snapshot({ BTC: '20' });
    expect(todayChange(portfolio(plan, entries, partial), partial)).toBeNull();
    expect(todayChange(portfolio(plan, entries, snapshot()), snapshot())).toBeNull();
    expect(todayChange(portfolio(plan, entries, null), snapshot({ BTC: '1', ETH: '1' }))).toBeNull();
    expect(todayChange(portfolio(plan, entries, snapshot({ BTC: '1', ETH: '1' })), null)).toBeNull();
    expect(todayChange(portfolio(plan, [], snapshot({ BTC: '1', ETH: '1' })), snapshot({ BTC: '1' }))).toBeNull();
  });

  it('treats a fall of 100 % or more as inconsistent data', () => {
    const prices = snapshot({ BTC: '-100', ETH: '1' });
    expect(todayChange(portfolio(plan, entries, prices), prices)).toBeNull();
  });
});
