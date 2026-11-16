import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVercelLocal } from '../../../tools/serve/vercel-local.ts';

vi.mock('server-only', () => ({}));

// The network is out of reach: an API that called the real upstream would answer 503 and 502 here, as
// the push-to-main Lighthouse run saw from the keyless CoinGecko API.
const request = globalThis.fetch;
vi.stubGlobal('fetch', () => Promise.reject(new Error('the network is not reachable in this test')));
const { default: api, fixtureUpstream } = await import('./api');

const today = () => new Date().toISOString().slice(0, 10);

describe('the Lighthouse API (apps/web/lighthouserc.json)', () => {
  let root: string;
  let server: ReturnType<typeof createVercelLocal>;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'poc-lighthouse-api-'));
    const config: unknown = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    server = createVercelLocal({ dir: root, config, api });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['EUR', 'USD'])('answers /api/prices in %s with BTC and ETH from the fixture', async (currency) => {
    const response = await request(`${base}/api/prices?currency=${currency}`);
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as { prices: Record<string, Record<string, string>> };
    expect(Object.keys(snapshot.prices).sort()).toEqual(['BTC', 'ETH']);
    expect(snapshot.prices.BTC?.[currency]).toBeDefined();
    expect(snapshot.prices.ETH?.[currency]).toBeDefined();
  });

  it.each([
    ['BTC', 'EUR'],
    ['ETH', 'USD'],
  ])('answers /api/history/%s in %s with flat closes ending today', async (coin, currency) => {
    const response = await request(`${base}/api/history/${coin}?currency=${currency}`);
    expect(response.status).toBe(200);
    const copy = (await response.json()) as { coin: string; closes: [string, string][] };
    expect(copy.coin).toBe(coin);
    expect(copy.closes.length).toBeGreaterThan(300);
    expect(copy.closes.at(-1)?.[0]).toBe(today());
    expect(new Set(copy.closes.map(([, close]) => close)).size).toBe(1);
  });

  it('has no answer for an upstream URL outside the fixture', async () => {
    for (const url of [
      'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=eur&days=365',
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=gbp&days=365',
      'https://example.com/',
    ]) {
      await expect(fixtureUpstream(url, {})).rejects.toThrow(`lighthouse fixture: no answer for ${url}`);
    }
  });
});
