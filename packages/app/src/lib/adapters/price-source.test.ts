import type { Instant, PriceSnapshot } from '@proofofcalm/core';
import { describe, expect, it, vi } from 'vitest';
import type { PricesState } from '../ports';
import { createApiClient } from './api-client';
import { systemClock } from './clock';
import {
  apiPriceSource,
  DELAYED_AFTER_MS,
  type PricesLineContext,
  pricesLine,
  shouldFetchPrices,
} from './price-source';

const instant = (value: string) => value as Instant;
const plus = (at: string, ms: number) => new Date(Date.parse(at) + ms).toISOString() as Instant;

const SNAPSHOT = {
  at: '2026-10-17T08:59:00.000Z',
  prices: { BTC: { EUR: '60000.12', GBP: '52000' } },
  change24h: { BTC: '-1.1' },
} as unknown as PriceSnapshot;

function aState(overrides: Partial<PricesState> = {}): PricesState {
  return {
    snapshot: SNAPSHOT,
    currency: 'EUR',
    fetchedAt: instant('2026-10-17T09:00:00.000Z'),
    stale: false,
    source: 'live',
    ...overrides,
  };
}

describe('apiPriceSource (ADR-0036)', () => {
  const at = Date.parse('2026-10-17T09:00:30Z');

  it('asks /api/prices in the pay currency and keeps the time it fetched, from the clock', async () => {
    const fetch = vi.fn(async (_input: string, _init: RequestInit) =>
      Response.json(SNAPSHOT, { headers: { 'x-proof-of-calm-stale': 'false' } }),
    );
    const source = apiPriceSource(
      createApiClient({ baseUrl: '', fetch }),
      systemClock('UTC', () => at),
    );
    expect(await source.latest('GBP')).toEqual({
      ok: true,
      value: {
        snapshot: SNAPSHOT,
        currency: 'GBP',
        fetchedAt: '2026-10-17T09:00:30.000Z',
        stale: false,
        source: 'live',
      },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/prices?currency=GBP');
  });

  it('marks the server’s last good copy stale, and passes a failure on as a value', async () => {
    const stale = vi.fn(async () => Response.json(SNAPSHOT, { headers: { 'x-proof-of-calm-stale': 'true' } }));
    const clock = systemClock('UTC', () => at);
    const answer = await apiPriceSource(createApiClient({ baseUrl: '', fetch: stale }), clock).latest('EUR');
    expect(answer.ok && answer.value.stale).toBe(true);
    const unmarked = vi.fn(async () => Response.json(SNAPSHOT));
    const plain = await apiPriceSource(createApiClient({ baseUrl: '', fetch: unmarked }), clock).latest('EUR');
    expect(plain.ok && plain.value.stale).toBe(false);
    const down = vi.fn(async () => Response.json({ error: 'prices-unavailable' }, { status: 503 }));
    expect(await apiPriceSource(createApiClient({ baseUrl: '', fetch: down }), clock).latest('EUR')).toEqual({
      ok: false,
      error: { kind: 'http', status: 503 },
    });
  });

  it('keeps the time the service worker fetched a copy it replays, never one after now', async () => {
    const answerWith = async (fetchedAt: string | null) => {
      const headers = fetchedAt === null ? {} : { 'x-proof-of-calm-fetched-at': fetchedAt };
      const fetch = vi.fn(async () => Response.json(SNAPSHOT, { headers }));
      const clock = systemClock('UTC', () => at);
      const answer = await apiPriceSource(createApiClient({ baseUrl: '', fetch }), clock).latest('EUR');
      return answer.ok ? answer.value.fetchedAt : null;
    };
    expect(await answerWith('2026-10-17T08:40:00.000Z')).toBe('2026-10-17T08:40:00.000Z');
    // A copy from "later" (the clock went back), an unreadable stamp or none: the time it arrived.
    expect(await answerWith('2026-10-17T09:05:00.000Z')).toBe('2026-10-17T09:00:30.000Z');
    expect(await answerWith('yesterday')).toBe('2026-10-17T09:00:30.000Z');
    expect(await answerWith(null)).toBe('2026-10-17T09:00:30.000Z');
  });
});

describe('shouldFetchPrices (docs/DOMAIN.md §9: 60 s on the client)', () => {
  const fetchedAt = '2026-10-17T09:00:00.000Z';

  it('fetches when nothing was fetched or the pay currency changed', () => {
    expect(shouldFetchPrices(null, { currency: 'EUR', now: instant(fetchedAt) })).toBe(true);
    expect(shouldFetchPrices(aState(), { currency: 'USD', now: instant(fetchedAt) })).toBe(true);
  });

  it('fetches again once the copy is a minute old', () => {
    const state = aState({ fetchedAt: instant(fetchedAt) });
    expect(shouldFetchPrices(state, { currency: 'EUR', now: plus(fetchedAt, 59_999) })).toBe(false);
    expect(shouldFetchPrices(state, { currency: 'EUR', now: plus(fetchedAt, 60_000) })).toBe(true);
    // Compared as moments: 11:00:59+02:00 is 59 seconds after 09:00Z, 11:01+02:00 a minute.
    expect(shouldFetchPrices(state, { currency: 'EUR', now: instant('2026-10-17T11:00:59+02:00') })).toBe(false);
    expect(shouldFetchPrices(state, { currency: 'EUR', now: instant('2026-10-17T11:01+02:00') })).toBe(true);
  });

  it('fetches again when the device clock went back past the time the copy was fetched', () => {
    const state = aState({ fetchedAt: instant(fetchedAt) });
    expect(shouldFetchPrices(state, { currency: 'EUR', now: plus(fetchedAt, -1) })).toBe(true);
    expect(shouldFetchPrices(state, { currency: 'EUR', now: plus(fetchedAt, -3 * 60 * 60 * 1000) })).toBe(true);
    expect(shouldFetchPrices(state, { currency: 'EUR', now: instant(fetchedAt) })).toBe(false);
  });
});

describe('pricesLine (docs/CONTENT-STYLE.md §3)', () => {
  const context = (overrides: Partial<PricesLineContext> = {}): PricesLineContext => ({
    now: instant('2026-10-17T09:05:00.000Z'),
    timeZone: 'Europe/Lisbon',
    online: true,
    failure: null,
    ...overrides,
  });
  const at = SNAPSHOT.at;

  it('says nothing is there before the first prices', () => {
    expect(pricesLine(null, context({ online: false }))).toEqual({ code: 'none' });
  });

  it('is live while the copy is fresh, and delayed when the server marked it stale', () => {
    expect(pricesLine(aState(), context())).toEqual({ code: 'live', at, sameDay: true });
    expect(pricesLine(aState({ stale: true }), context())).toEqual({ code: 'delayed', at, sameDay: true });
  });

  it('stays live for a healthy answer at the worst age of the stacked caches, and is delayed past it', () => {
    // Next's Data Cache, the instance copy and the CDN at 10 minutes each, the CDN's 30 minutes of
    // stale-while-revalidate, the upstream's own lag (5 minutes allowed) and the client's minute.
    expect(DELAYED_AFTER_MS).toBe(66 * 60 * 1000);
    const healthyWorst = plus(at, (3 * 600 + 1800 + 300) * 1000);
    expect(pricesLine(aState(), context({ now: healthyWorst })).code).toBe('live');
    expect(pricesLine(aState(), context({ now: plus(at, DELAYED_AFTER_MS) })).code).toBe('live');
    expect(pricesLine(aState(), context({ now: plus(at, DELAYED_AFTER_MS + 1) })).code).toBe('delayed');
  });

  it('is offline when the device says so or the latest refresh got no answer', () => {
    expect(pricesLine(aState(), context({ online: false }))).toEqual({ code: 'offline', at, sameDay: true });
    expect(pricesLine(aState({ stale: true }), context({ failure: { kind: 'network' } })).code).toBe('offline');
  });

  it('lets the copy’s own age speak after an error status, a bad body or a failure on this device', () => {
    expect(pricesLine(aState(), context({ failure: { kind: 'http', status: 503 } })).code).toBe('live');
    expect(pricesLine(aState(), context({ failure: { kind: 'local' } })).code).toBe('live');
    const later = context({ failure: { kind: 'invalid' }, now: instant('2026-10-17T11:00:00.000Z') });
    expect(pricesLine(aState(), later).code).toBe('delayed');
    expect(() => pricesLine(aState(), context({ failure: { kind: 'teapot' } as never }))).toThrow();
  });

  it('keeps hand-entered prices labelled as such, even offline', () => {
    expect(pricesLine(aState({ source: 'manual', stale: true }), context({ online: false }))).toEqual({
      code: 'manual',
      at,
      sameDay: true,
    });
  });

  it('dates the line when the prices are from another day in the device’s zone', () => {
    const lateEvening = aState({ snapshot: { ...SNAPSHOT, at: instant('2026-10-16T22:30:00.000Z') } });
    const pastMidnight = instant('2026-10-16T23:30:00.000Z');
    const at = '2026-10-16T22:30:00.000Z';
    expect(pricesLine(lateEvening, context({ now: pastMidnight, online: false }))).toEqual({
      code: 'offline',
      at,
      sameDay: false,
    });
    expect(pricesLine(lateEvening, context({ now: pastMidnight, online: false, timeZone: 'UTC' }))).toEqual({
      code: 'offline',
      at,
      sameDay: true,
    });
  });
});
