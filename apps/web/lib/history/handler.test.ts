import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { memoryStore } = await import('../server/store');
type SharedCache = import('../server/store').SharedCache;
const { createHistoryHandler, HISTORY_TTL_SECONDS } = await import('./handler');

const T0 = Date.parse('2026-10-20T10:00:00Z');
const DAY = 86_400_000;
const MIDNIGHT = Date.parse('2026-10-20T00:00:00Z');

/** CoinGecko's market_chart: a point at 00:00 UTC per day, then the current price at the call's time. */
const CHART = {
  prices: [
    [MIDNIGHT - 2 * DAY, 61_000.5],
    [MIDNIGHT - DAY, 62_000],
    [MIDNIGHT, 63_000.25],
    [T0 - 30_000, 63_500],
  ],
  market_caps: [],
  total_volumes: [],
};

type Clock = { now: number };

function setup(options: { body?: unknown; status?: number; key?: string; clock?: Clock; shared?: SharedCache } = {}) {
  const clock = options.clock ?? { now: T0 };
  const shared = options.shared ?? memoryStore(() => clock.now);
  const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json(options.body ?? CHART, { status: options.status ?? 200 }),
  );
  const handler = createHistoryHandler({ fetch, apiKey: () => options.key, shared, now: () => clock.now });
  return {
    fetch,
    shared,
    advance: (ms: number) => {
      clock.now += ms;
    },
    get: (coin = 'BTC', query = '?currency=EUR', headers: Record<string, string> = {}) =>
      handler(new Request(`https://proofofcalm.com/api/history/${coin}${query}`, { headers }), coin),
  };
}

describe('GET /api/history/:coin (ADR-0006, ADR-0036)', () => {
  it('serves the daily closes on UTC days, the 00:00 point closing the day before', async () => {
    const { get } = setup();
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      coin: 'BTC',
      currency: 'EUR',
      closes: [
        ['2026-10-17', '61000.5'],
        ['2026-10-18', '62000'],
        ['2026-10-19', '63000.25'],
        ['2026-10-20', '63500'],
      ],
      fetchedAt: '2026-10-20T10:00:00.000Z',
    });
  });

  it('keeps the 365 latest closes', async () => {
    const prices = Array.from({ length: 400 }, (_, i) => [MIDNIGHT - (399 - i) * DAY, 100 + i]);
    const closes = (await (await setup({ body: { prices } }).get()).json()).closes;
    expect(closes).toHaveLength(365);
    expect(closes.at(-1)).toEqual(['2026-10-19', '499']);
  });

  it('refuses a coin or a currency outside the allow-lists with 400 and calls nothing', async () => {
    const { get, fetch } = setup();
    for (const [coin, query] of [
      ['NOPE', '?currency=EUR'],
      ['btc', '?currency=EUR'],
      ['bitcoin', '?currency=EUR'],
      ['BTC', '?currency=SEK'],
      ['BTC', '?currency='],
      ['..%2Fsimple', '?currency=EUR'],
    ] as const) {
      const response = await get(coin, query);
      expect([response.status, response.headers.get('cache-control')], `${coin}${query}`).toEqual([400, 'no-store']);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers canonical URLs only, so no query string mints a cache key that reaches the function', async () => {
    const { get, fetch } = setup();
    for (const query of [
      '?currency=eur',
      '?currency=Eur',
      '?currency=EUR&currency=EUR',
      '?currency=EUR&currency=USD',
      '?currency=EUR&x=1',
      '?x=1&currency=EUR',
      '?x=1',
      '?currency=EUR&',
      '?currency=%45UR',
      '?currency',
      '?Currency=EUR',
      '?',
    ]) {
      const response = await get('BTC', query);
      expect([response.status, response.headers.get('cache-control')], query).toEqual([400, 'no-store']);
    }
    expect(fetch).not.toHaveBeenCalled();
    const bare = await get('BTC', '');
    expect([bare.status, (await bare.json()).currency]).toEqual([200, 'EUR']);
  });

  it('calls upstream once per key per day (ADR-0036), also for requests that arrive together', async () => {
    const { get, fetch, advance, shared } = setup();
    const set = vi.spyOn(shared, 'set');
    await Promise.all([get(), get(), get('BTC', '')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('history:BTC:EUR', expect.any(String), HISTORY_TTL_SECONDS);
    await get('BTC', '?currency=USD');
    await get('ETH');
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(24 * 3_600_000 - 1);
    await get();
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(1);
    await get();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('shares the copy across instances through the shared cache (ADR-0045 §2)', async () => {
    const clock: Clock = { now: T0 };
    const first = setup({ clock });
    await first.get();
    const second = setup({ clock, shared: first.shared });
    second.advance(60_000);
    expect((await (await second.get()).json()).fetchedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('sets s-maxage to the day less the copy’s age, so no copy outlives 24 hours end to end (ADR-0036)', async () => {
    const { get, advance } = setup();
    expect((await get()).headers.get('cache-control')).toBe('public, s-maxage=86400');
    advance(3_600_000);
    expect((await get()).headers.get('cache-control')).toBe('public, s-maxage=82800');
    advance(1_500);
    expect((await get()).headers.get('cache-control')).toBe('public, s-maxage=82798');
  });

  it('never serves a copy aged 24 hours or more, even from a cache that kept it', async () => {
    const clock: Clock = { now: T0 };
    const forever: SharedCache = memoryStore(() => clock.now);
    const keeps: SharedCache = { get: (key) => forever.get(key), set: (key, value) => forever.set(key, value) };
    const first = setup({ clock, shared: keeps });
    await first.get();
    const down = setup({ clock, shared: keeps, status: 500 });
    down.advance(24 * 3_600_000);
    const response = await down.get();
    expect(down.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
  });

  it('answers an upstream failure or an unexpected shape with 502, no body detail, and waits a minute per key', async () => {
    for (const options of [{ status: 429 }, { body: { prices: 'none' } }, { body: { prices: [] } }]) {
      const { get, fetch, advance } = setup(options);
      const response = await get();
      expect([response.status, response.headers.get('cache-control'), await response.text()]).toEqual([
        502,
        'no-store',
        '',
      ]);
      advance(59_999);
      await get();
      expect(fetch).toHaveBeenCalledTimes(1);
      await get('ETH');
      expect(fetch).toHaveBeenCalledTimes(2);
      advance(1);
      await get();
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  });

  it('asks market_chart for 365 daily points with the key in the header only, never in the URL', async () => {
    const { get, fetch } = setup({ key: 'CG-demo-key' });
    await get('ETH', '?currency=GBP');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=gbp&days=365&interval=daily&precision=full',
    );
    expect(url).not.toContain('CG-demo-key');
    expect(new Headers(init?.headers).get('x-cg-demo-api-key')).toBe('CG-demo-key');
    const keyless = setup();
    await keyless.get();
    expect(new Headers(keyless.fetch.mock.calls[0]?.[1]?.headers).get('x-cg-demo-api-key')).toBeNull();
  });

  it('answers CORS for the allow-listed origins only, and varies on Origin', async () => {
    const { get } = setup();
    const wrapper = await get('BTC', '?currency=EUR', { origin: 'capacitor://localhost' });
    expect(wrapper.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    const other = await get('BTC', '?currency=EUR', { origin: 'https://example.com' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(other.headers.get('vary')).toBe('Origin');
  });
});
