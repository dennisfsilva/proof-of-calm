import type { CoinId } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, instant, money, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { reviewVenues } from './venues';

// The review page's units per venue (docs/DOMAIN.md §3.12, §3.7 `venueUnits`) on 1 Mar 2026, over a BTC and ETH plan.

const coinId = (value: string) => value as CoinId;
const plan = aPlan();
const today = date('2026-03-01');
const buy = (on: string, held: string, venue: string | null, more = {}) =>
  anEntry({ date: date(on), units: units(held), venue, ...more });

describe('reviewVenues', () => {
  it('a move Kraken → Ledger of 0.01 sent and 0.0099 received: Ledger holds the units received', () => {
    const entries = [
      buy('2026-01-01', '0.02', 'Kraken'),
      aMove({ date: date('2026-02-01'), units: units('0.01'), received: units('0.0099') }),
    ];
    expect(reviewVenues(plan, entries, today)).toEqual([
      {
        coin: 'BTC',
        decimals: 8,
        venues: [
          { venue: 'Kraken', units: '0.01' },
          { venue: 'Ledger', units: '0.0099' },
        ],
        estimated: 0,
      },
    ]);
  });

  it('a one-tap buy with no venue: the venue null and one estimate', () => {
    const [btc] = reviewVenues(plan, [buy('2026-01-01', '0.001', null, { source: 'one-tap' })], today);
    expect(btc?.venues).toEqual([{ venue: null, units: '0.001' }]);
    expect(btc?.estimated).toBe(1);
  });

  it('leaves out a coin sold out', () => {
    const entries = [
      buy('2026-01-01', '0.001', null),
      buy('2026-01-01', '0.5', 'Kraken', { coin: coinId('ETH') }),
      buy('2026-02-01', '0.5', 'Kraken', { coin: coinId('ETH'), kind: 'sell', amount: money('900'), slot: null }),
    ];
    expect(reviewVenues(plan, entries, today).map((coin) => coin.coin)).toEqual(['BTC']);
  });

  it('counts a held entry at Ledger with no cost', () => {
    const held = buy('2025-06-01', '0.3', 'Ledger', { kind: 'held', amount: null, slot: null });
    expect(reviewVenues(plan, [held], today)[0]?.venues).toEqual([{ venue: 'Ledger', units: '0.3' }]);
  });

  it('counts no entry dated after today, nor its estimate', () => {
    const entries = [
      buy('2026-01-01', '0.001', null, { source: 'one-tap' }),
      buy('2026-03-02', '0.002', null, { source: 'one-tap' }),
      buy('2026-04-01', '0.5', 'Kraken', { coin: coinId('ETH') }),
    ];
    expect(reviewVenues(plan, entries, today)).toEqual([
      { coin: 'BTC', decimals: 8, venues: [{ venue: null, units: '0.001' }], estimated: 1 },
    ]);
  });

  it('a sale at Bitvavo larger than its buys takes the rest first in, first out from the oldest lot', () => {
    const entries = [
      buy('2026-01-01', '0.01', null),
      buy('2026-01-15', '0.01', 'Kraken'),
      buy('2026-02-01', '0.01', 'Bitvavo'),
      buy('2026-02-15', '0.015', 'Bitvavo', { kind: 'sell', amount: money('900'), slot: null }),
    ];
    expect(reviewVenues(plan, entries, today)[0]?.venues).toEqual([
      { venue: null, units: '0.005' },
      { venue: 'Kraken', units: '0.01' },
    ]);
  });

  it('lists the plan coins first, then a coin outside the plan at 8 decimals', () => {
    const entries = [
      buy('2026-01-01', '2', 'Kraken', { coin: coinId('SOL') }),
      buy('2026-01-02', '0.5', 'Kraken', { coin: coinId('ETH') }),
      buy('2026-01-03', '0.001', 'Kraken'),
    ];
    expect(reviewVenues(plan, entries, today).map(({ coin, decimals }) => [coin, decimals])).toEqual([
      ['BTC', 8],
      ['ETH', 6],
      ['SOL', 8],
    ]);
  });

  it('`Kraken` and `kraken` give two lines; a deleted entry counts for nothing', () => {
    const entries = [
      buy('2026-01-01', '0.001', 'Kraken'),
      buy('2026-01-02', '0.002', 'kraken'),
      buy('2026-01-03', '0.004', 'Kraken', { source: 'one-tap', deletedAt: instant('2026-01-04T09:00:00+00:00') }),
    ];
    expect(reviewVenues(plan, entries, today)).toEqual([
      {
        coin: 'BTC',
        decimals: 8,
        venues: [
          { venue: 'Kraken', units: '0.001' },
          { venue: 'kraken', units: '0.002' },
        ],
        estimated: 0,
      },
    ]);
  });
});
