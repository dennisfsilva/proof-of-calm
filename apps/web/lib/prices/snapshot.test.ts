import type { Instant } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { toSnapshot } from './snapshot';

const fetchedAt = '2026-10-17T09:00:00.000Z' as Instant;

describe('toSnapshot', () => {
  it('keeps positive prices of the allow-listed coins, ten decimals at most', () => {
    const snapshot = toSnapshot(
      {
        pepe: { eur: 0.000_006_123_456_789_9, usd: 0 },
        bitcoin: { eur: 60_000, usd: null },
        'unknown-coin': { eur: 1 },
      },
      'EUR',
      fetchedAt,
    );
    expect(snapshot).toEqual({ at: fetchedAt, prices: { BTC: { EUR: '60000' }, PEPE: { EUR: '0.0000061235' } } });
  });

  it('skips a coin with no usable price, and gives nothing when no coin has one', () => {
    expect(toSnapshot({ bitcoin: { eur: -1, usd: Number.NaN } }, 'EUR', fetchedAt)).toBeNull();
    expect(toSnapshot({}, 'EUR', fetchedAt)).toBeNull();
  });

  it('dates the snapshot by the latest upstream update, else by the fetch', () => {
    const matrix = { bitcoin: { eur: 1, last_updated_at: 1_760_691_540 }, ethereum: { eur: 1, last_updated_at: 1 } };
    expect(toSnapshot(matrix, 'EUR', fetchedAt)?.at).toBe('2025-10-17T08:59:00.000Z');
  });
});
