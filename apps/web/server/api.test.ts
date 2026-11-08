import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { memoryStore } = await import('../lib/server/store');
const { createApi, default: production } = await import('./api');

const T0 = Date.parse('2026-10-19T09:00:00Z');
const MATRIX = {
  bitcoin: {
    eur: 60_000.12,
    usd: 70_100,
    gbp: 52_000,
    chf: 56_000,
    eur_24h_change: -1.2,
    last_updated_at: 1_760_691_540,
  },
  ethereum: { eur: 2_000, usd: 2_340, gbp: 1_700, chf: 1_870, eur_24h_change: 2.5, last_updated_at: 1_760_691_500 },
};

const CHART = { prices: [[Date.parse('2026-10-19T00:00:00Z'), 62_000]] };

function setup() {
  const store = memoryStore();
  const api = createApi({
    fetch: vi.fn(async (url: string) => Response.json(url.includes('/market_chart?') ? CHART : MATRIX)),
    apiKey: () => undefined,
    store,
    shared: memoryStore(),
    now: () => T0,
    today: () => '2026-10-19',
  });
  const call = (path: string, init: RequestInit = {}) => api.fetch(new Request(`https://proofofcalm.com${path}`, init));
  return { store, call };
}

describe('the API function (ADR-0045 §2)', () => {
  it('answers GET /api/prices with the snapshot', async () => {
    const response = await setup().call('/api/prices?currency=EUR');
    expect(response.status).toBe(200);
    expect((await response.json()).prices.BTC.EUR).toBe('60000.12');
  });

  it('answers the preflight of /api/prices for an allowed origin', async () => {
    const response = await setup().call('/api/prices', {
      method: 'OPTIONS',
      headers: { origin: 'capacitor://localhost' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET');
  });

  it('answers GET /api/history/:coin with the closes, and its preflight', async () => {
    const response = await setup().call('/api/history/BTC?currency=EUR');
    expect(response.status).toBe(200);
    expect((await response.json()).closes).toEqual([['2026-10-18', '62000']]);
    expect((await setup().call('/api/history/NOPE?currency=EUR')).status).toBe(400);
    const preflight = await setup().call('/api/history/BTC', {
      method: 'OPTIONS',
      headers: { origin: 'capacitor://localhost' },
    });
    expect([preflight.status, preflight.headers.get('access-control-allow-methods')]).toEqual([204, 'GET']);
    const post = await setup().call('/api/history/BTC', { method: 'POST' });
    expect([post.status, post.headers.get('allow')]).toEqual([405, 'GET, OPTIONS']);
  });

  it('counts a POSTed CSP report', async () => {
    const { store, call } = setup();
    const response = await call('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }),
    });
    expect(response.status).toBe(204);
    expect(await store.counts('csp:2026-10-19')).toEqual({ 'script-src inline': 1 });
  });

  it('answers another method with 405, Allow and no-store', async () => {
    const post = await setup().call('/api/prices', { method: 'POST' });
    expect([post.status, post.headers.get('allow'), post.headers.get('cache-control')]).toEqual([
      405,
      'GET, OPTIONS',
      'no-store',
    ]);
    const get = await setup().call('/api/csp-report');
    expect([get.status, get.headers.get('allow'), get.headers.get('cache-control')]).toEqual([405, 'POST', 'no-store']);
  });

  it('answers another path with 404 and no-store', async () => {
    for (const path of [
      '/api',
      '/api/other',
      '/api/prices/extra',
      '/api/history',
      '/api/history/',
      '/api/history/BTC/extra',
      '/today',
    ]) {
      const response = await setup().call(path);
      expect([response.status, response.headers.get('cache-control')], path).toEqual([404, 'no-store']);
    }
  });

  it('exports the production handler in the shape Vercel loads', () => {
    expect(typeof production.fetch).toBe('function');
  });
});
