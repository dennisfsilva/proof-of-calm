import type { CoinId } from '@proofofcalm/core';
import { describe, expect, it, vi } from 'vitest';
import type { CachedHistory } from '../ports';
import { createApiClient } from './api-client';
import { systemClock } from './clock';
import { memoryHistoryCache } from './history';
import { apiHistorySource } from './history-source';

const BTC = 'BTC' as CoinId;
const FETCHED = Date.parse('2026-10-20T08:00:00Z');

const ANSWER = {
  coin: 'BTC',
  currency: 'EUR',
  closes: [
    ['2026-10-18', '62000'],
    ['2026-10-19', '63000.25'],
  ],
  fetchedAt: '2026-10-20T08:00:00.000Z',
} as unknown as CachedHistory;

function setup(options: { status?: number; body?: unknown; fails?: boolean } = {}) {
  const clock = { now: FETCHED + 3_600_000 };
  const fetch = vi.fn(async (_input: string, _init: RequestInit) => {
    if (options.fails) throw new TypeError('Failed to fetch');
    return Response.json(options.body ?? ANSWER, { status: options.status ?? 200 });
  });
  const cache = memoryHistoryCache();
  const source = apiHistorySource(
    createApiClient({ baseUrl: 'https://proofofcalm.com', fetch }),
    cache,
    systemClock('UTC', () => clock.now),
  );
  return { fetch, cache, source, clock };
}

describe('apiHistorySource (ADR-0036)', () => {
  it('asks /api/history/:coin in the currency and stores the server’s fetchedAt on the device', async () => {
    const { source, fetch, cache, clock } = setup();
    expect(await source.closes(BTC, 'EUR')).toEqual({ ok: true, value: ANSWER });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://proofofcalm.com/api/history/BTC?currency=EUR');
    expect((await cache.get(BTC, 'EUR', systemClock('UTC', () => clock.now).now()))?.fetchedAt).toBe(
      '2026-10-20T08:00:00.000Z',
    );
  });

  it('answers a cache hit without a request', async () => {
    const { source, fetch, cache } = setup();
    await cache.put(ANSWER);
    expect(await source.closes(BTC, 'EUR')).toEqual({ ok: true, value: ANSWER });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refetches once the device copy is 24 hours old', async () => {
    const { source, fetch, clock } = setup();
    await source.closes(BTC, 'EUR');
    clock.now = FETCHED + 24 * 3_600_000 - 1;
    await source.closes(BTC, 'EUR');
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.now = FETCHED + 24 * 3_600_000;
    await source.closes(BTC, 'EUR');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the copy when the device clock is a little behind the server’s fetchedAt', async () => {
    const { source, fetch, clock } = setup();
    clock.now = FETCHED - 30_000;
    await source.closes(BTC, 'EUR');
    await source.closes(BTC, 'EUR');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps another currency apart', async () => {
    const { source, fetch } = setup();
    await source.closes(BTC, 'EUR');
    await source.closes(BTC, 'USD');
    expect(fetch).toHaveBeenCalledTimes(2);
    // The route answers only this canonical form (one upper-case currency, nothing else).
    expect(fetch.mock.calls[1]?.[0]).toBe('https://proofofcalm.com/api/history/BTC?currency=USD');
  });

  it('returns a failure as a value and stores nothing', async () => {
    for (const [options, failure] of [
      [{ fails: true }, { kind: 'network' }],
      [{ status: 502 }, { kind: 'http', status: 502 }],
      [{ body: { ...ANSWER, closes: 'none' } }, { kind: 'invalid' }],
      [{ body: { ...ANSWER, coin: 'ETH' } }, { kind: 'invalid' }],
      [{ body: { ...ANSWER, currency: 'USD' } }, { kind: 'invalid' }],
    ] as const) {
      const { source, cache, clock } = setup(options);
      expect(await source.closes(BTC, 'EUR')).toEqual({ ok: false, error: failure });
      expect(await cache.get(BTC, 'EUR', systemClock('UTC', () => clock.now).now())).toBeNull();
    }
  });

  it('serves the answer even when the device refuses to store it', async () => {
    const { source, cache } = setup();
    vi.spyOn(cache, 'put').mockRejectedValue(new Error('quota'));
    expect((await source.closes(BTC, 'EUR')).ok).toBe(true);
  });
});
