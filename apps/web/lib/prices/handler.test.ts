import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { memoryStore } = await import('../server/store');
type SharedCache = import('../server/store').SharedCache;
const { createPricesHandler, FRESH_KEY, LAST_GOOD_KEY } = await import('./handler');
const { preflight } = await import('../http/cors');

const T0 = Date.parse('2026-10-17T09:00:00Z');
const MATRIX = {
  bitcoin: {
    eur: 60_000.12,
    usd: 70_100,
    gbp: 52_000,
    chf: 56_000,
    eur_24h_change: -1.23456,
    usd_24h_change: -1.1,
    last_updated_at: 1_760_691_540,
  },
  ethereum: { eur: 2_000, usd: 2_340, gbp: 1_700, chf: 1_870, eur_24h_change: 2.5, last_updated_at: 1_760_691_500 },
};

type Clock = { now: number };

/** One handler instance; instances that share a `clock` and a `shared` cache stand for one function's instances. */
function setup(options: { body?: unknown; status?: number; key?: string; clock?: Clock; shared?: SharedCache } = {}) {
  const clock = options.clock ?? { now: T0 };
  const store = memoryStore();
  const shared = options.shared ?? memoryStore(() => clock.now);
  const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json(options.body ?? MATRIX, { status: options.status ?? 200 }),
  );
  const handler = createPricesHandler({ fetch, apiKey: () => options.key, store, shared, now: () => clock.now });
  return {
    fetch,
    store,
    shared,
    handler,
    advance: (ms: number) => {
      clock.now += ms;
    },
    get: (query = '', headers: Record<string, string> = {}) =>
      handler(new Request(`https://proofofcalm.com/api/prices${query}`, { headers })),
  };
}

describe('GET /api/prices (ADR-0006, ADR-0036)', () => {
  it('serves the snapshot for the asked currency, cached at the CDN for ten minutes', async () => {
    const { get } = setup();
    const response = await get('?currency=eur');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=600, stale-while-revalidate=1800');
    expect(response.headers.get('x-proof-of-calm-stale')).toBe('false');
    expect(await response.json()).toEqual({
      at: '2025-10-17T08:59:00.000Z',
      prices: {
        BTC: { EUR: '60000.12', USD: '70100', GBP: '52000', CHF: '56000' },
        ETH: { EUR: '2000', USD: '2340', GBP: '1700', CHF: '1870' },
      },
      change24h: { BTC: '-1.2346', ETH: '2.5' },
    });
  });

  it('gives the 24-hour change in the asked currency, EUR when none is asked', async () => {
    const { get } = setup();
    expect((await (await get('?currency=USD')).json()).change24h).toEqual({ BTC: '-1.1' });
    expect((await (await get()).json()).change24h).toEqual({ BTC: '-1.2346', ETH: '2.5' });
    expect((await get('?currency=SEK')).status).toBe(400);
  });

  it('calls the upstream at most once per ten minutes, and once for requests that arrive together', async () => {
    const { get, fetch, advance } = setup();
    await Promise.all([get(), get('?currency=USD'), get()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(599_999);
    await get();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    await get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares the fresh matrix across instances: a second one within the TTL reads it and calls nothing (ADR-0045 §2)', async () => {
    const clock: Clock = { now: T0 };
    const first = setup({ clock });
    const set = vi.spyOn(first.shared, 'set');
    await first.get();
    expect(set).toHaveBeenCalledWith(FRESH_KEY, expect.any(String), 600);
    const second = setup({ clock, shared: first.shared });
    second.advance(599_999);
    const response = await second.get('?currency=USD');
    expect(second.fetch).not.toHaveBeenCalled();
    expect(response.headers.get('x-proof-of-calm-stale')).toBe('false');
    expect((await response.json()).at).toBe('2025-10-17T08:59:00.000Z');
    // Read per call while this instance's own copy is old: the shared copy does not become its own.
    await second.get();
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('after the TTL, one instance calls upstream once and writes the fresh copy with the TTL; the others read it', async () => {
    const clock: Clock = { now: T0 };
    const first = setup({ clock });
    await first.get();
    const second = setup({ clock, shared: first.shared });
    const setShared = vi.spyOn(second.shared, 'set');
    const setStore = vi.spyOn(second.store, 'set');
    second.advance(600_000);
    await Promise.all([second.get(), second.get('?currency=GBP')]);
    expect(second.fetch).toHaveBeenCalledTimes(1);
    expect(setShared).toHaveBeenCalledTimes(1);
    expect(setShared).toHaveBeenCalledWith(FRESH_KEY, expect.any(String), 600);
    expect(setStore).toHaveBeenCalledWith(LAST_GOOD_KEY, expect.any(String), 86_400);
    await first.get();
    expect(first.fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a failing or broken shared cache as empty: the failure path is unchanged', async () => {
    const broken: SharedCache = {
      get: async () => {
        throw new Error('runtime cache down');
      },
      set: async () => {
        throw new Error('runtime cache down');
      },
    };
    const { get, fetch, advance } = setup({ shared: broken });
    expect((await get()).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(600_000);
    fetch.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    const stale = await get();
    expect(stale.headers.get('x-proof-of-calm-stale')).toBe('true');
    expect(fetch).toHaveBeenCalledTimes(2);
    const odd = setup();
    await odd.shared.set(FRESH_KEY, '{not json', 600);
    expect((await odd.get()).status).toBe(200);
    expect(odd.fetch).toHaveBeenCalledTimes(1);
  });

  it('asks for the whole matrix with the key in the header only', async () => {
    const { get, fetch } = setup({ key: 'CG-demo-key' });
    await get();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toMatch(/^https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price\?/);
    expect(url).toContain('vs_currencies=eur%2Cusd%2Cgbp%2Cchf');
    expect(url).toContain('include_24hr_change=true');
    expect(url).not.toContain('CG-demo-key');
    expect(new Headers(init?.headers).get('x-cg-demo-api-key')).toBe('CG-demo-key');
    expect(init).not.toHaveProperty('next');
    const keyless = setup();
    await keyless.get();
    expect(new Headers(keyless.fetch.mock.calls[0]?.[1]?.headers).get('x-cg-demo-api-key')).toBeNull();
  });

  it('asks for every allow-listed coin by its CoinGecko id, in ticker order, so the cache key stays the same', async () => {
    const { get, fetch } = setup();
    await get();
    const [url] = fetch.mock.calls[0] ?? [];
    expect(new URL(String(url)).searchParams.get('ids')).toBe(
      'aave,cardano,arbitrum,cosmos,avalanche-2,binancecoin,bitcoin,dogecoin,polkadot,ethereum,hyperliquid,chainlink,' +
        'litecoin,near,optimism,pepe,polygon-ecosystem-token,render-token,solana,sui,bittensor,the-open-network,tron,' +
        'uniswap,stellar,ripple',
    );
  });

  it('serves the last good copy, marked stale, while the upstream fails, and waits a minute before trying again', async () => {
    const { get, fetch, advance } = setup();
    await get();
    fetch.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    advance(600_000);
    const stale = await get();
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-proof-of-calm-stale')).toBe('true');
    expect(stale.headers.get('cache-control')).toBe('public, s-maxage=60');
    expect((await stale.json()).prices.BTC.EUR).toBe('60000.12');
    expect(fetch).toHaveBeenCalledTimes(2);
    advance(59_999);
    await get();
    expect(fetch).toHaveBeenCalledTimes(2);
    advance(1);
    await get();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reads the shared last good copy on a cold instance, and answers 503 with nothing to serve', async () => {
    const down = setup({ status: 500 });
    expect((await down.get()).status).toBe(503);
    expect((await down.get()).headers.get('cache-control')).toBe('no-store');

    const warm = setup();
    await warm.get();
    const cold = setup({ status: 429 });
    await cold.store.set(LAST_GOOD_KEY, (await warm.store.get(LAST_GOOD_KEY)) ?? '');
    const response = await cold.get();
    expect(response.headers.get('x-proof-of-calm-stale')).toBe('true');
    expect((await response.json()).at).toBe('2025-10-17T08:59:00.000Z');
  });

  it('serves no last good copy fetched 24 hours ago or more, and stores it for 24 hours only (ADR-0036)', async () => {
    const { get, fetch, advance, store } = setup();
    const set = vi.spyOn(store, 'set');
    await get();
    expect(set).toHaveBeenCalledWith(LAST_GOOD_KEY, expect.any(String), 86_400);
    fetch.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    advance(86_399_999);
    expect((await get()).headers.get('x-proof-of-calm-stale')).toBe('true');
    advance(60_001);
    const gone = await get();
    expect(gone.status).toBe(503);
    expect(gone.headers.get('cache-control')).toBe('no-store');

    // A cold instance does not serve an old copy that a store without expiry still holds.
    const cold = setup({ status: 503 });
    const old = { matrix: MATRIX, fetchedAt: new Date(T0 - 86_400_000).toISOString() };
    await cold.store.set(LAST_GOOD_KEY, JSON.stringify(old), 86_400);
    expect((await cold.get()).status).toBe(503);
  });

  it('falls back to a younger shared copy when this instance’s own copy is 24 hours old', async () => {
    const { get, fetch, advance, store } = setup();
    await get();
    fetch.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    advance(86_400_000);
    // Another instance fetched an hour ago and wrote its copy to the shared store.
    const younger = { matrix: MATRIX, fetchedAt: new Date(T0 + 86_400_000 - 3_600_000).toISOString() };
    await store.set(LAST_GOOD_KEY, JSON.stringify(younger), 86_400);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-proof-of-calm-stale')).toBe('true');
  });

  it('treats an unexpected upstream shape or a broken stored copy as no data', async () => {
    const odd = setup({ body: { bitcoin: { eur: 'sixty thousand' } } });
    expect((await odd.get()).status).toBe(503);
    await odd.store.set(LAST_GOOD_KEY, '{not json');
    odd.advance(60_000);
    expect((await odd.get()).status).toBe(503);
    await odd.store.set(LAST_GOOD_KEY, JSON.stringify({ matrix: {}, fetchedAt: 'yesterday' }));
    odd.advance(60_000);
    expect((await odd.get()).status).toBe(503);
  });

  it('allows the product’s origin and the wrapper’s, and varies on Origin', async () => {
    const { get } = setup();
    const allowed = await get('', { origin: 'capacitor://localhost' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(allowed.headers.get('vary')).toBe('Origin');
    const other = await get('', { origin: 'https://example.com' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(other.headers.get('vary')).toBe('Origin');
  });

  it('exposes the stale marker to the wrapper, whose calls are cross-origin', async () => {
    const { get } = setup();
    const allowed = await get('', { origin: 'capacitor://localhost' });
    expect(allowed.headers.get('access-control-expose-headers')).toBe('x-proof-of-calm-stale');
    const other = await get('', { origin: 'https://example.com' });
    expect(other.headers.get('access-control-expose-headers')).toBeNull();
  });

  it('allows the bearer header in the preflight of an allowed origin only', () => {
    const ask = (origin: string) =>
      preflight(
        new Request('https://proofofcalm.com/api/prices', {
          method: 'OPTIONS',
          headers: { origin, 'access-control-request-headers': 'authorization' },
        }),
        'GET',
      );
    const allowed = ask('capacitor://localhost');
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-headers')).toBe('authorization');
    expect(allowed.headers.get('access-control-allow-methods')).toBe('GET');
    const other = ask('https://example.com');
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-headers')).toBeNull();
  });
});
