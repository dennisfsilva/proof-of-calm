import { expect } from '@playwright/test';
import { test } from './support';

// /api/prices and /api/history/:coin at the request level. Locally only the paths that never reach the
// upstream run: no network call to CoinGecko (the upstream itself is covered by unit tests with a mocked
// fetch). Against a deployment (BASE_URL, the preview-checks job) the history route is also asked once
// for real, which the CDN then serves for the rest of its day.

test('an unknown currency is refused before any upstream call', async ({ request }) => {
  const response = await request.get('/api/prices?currency=SEK');
  expect(response.status()).toBe(400);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'unknown-currency' });
});

test('a preflight from the wrapper is allowed and one from elsewhere is not', async ({ request }) => {
  const wrapper = await request.fetch('/api/prices', {
    method: 'OPTIONS',
    headers: { origin: 'capacitor://localhost' },
  });
  expect(wrapper.status()).toBe(204);
  expect(wrapper.headers()['access-control-allow-origin']).toBe('capacitor://localhost');
  expect(wrapper.headers()['access-control-allow-methods']).toBe('GET');
  const other = await request.fetch('/api/prices', { method: 'OPTIONS', headers: { origin: 'https://example.com' } });
  expect(other.status()).toBe(403);
});

test('the history route answers the daily closes of an allow-listed coin', async ({ request }) => {
  // biome-ignore lint/suspicious/noSkippedTests: a runtime skip while the run has no deployment to ask, not a disabled test
  test.skip(!process.env.BASE_URL, 'reaches CoinGecko: runs against a deployment only');
  const response = await request.get('/api/history/BTC');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    coin: string;
    currency: string;
    closes: [string, string][];
    fetchedAt: string;
  };
  expect([body.coin, body.currency]).toEqual(['BTC', 'EUR']);
  expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
  expect(body.closes.length).toBeGreaterThan(0);
  const dates = body.closes.map(([date]) => date);
  expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
  expect(dates).toEqual([...new Set(dates)].sort());
  expect(body.closes.every(([, close]) => /^\d+(\.\d+)?$/.test(close))).toBe(true);
});

test('the history route refuses an unknown coin or a non-canonical query before any upstream call', async ({
  request,
}) => {
  for (const path of ['/api/history/NOPE', '/api/history/BTC?currency=eur']) {
    const response = await request.get(path);
    expect([response.status(), response.headers()['cache-control']], path).toEqual([400, 'no-store']);
  }
});
