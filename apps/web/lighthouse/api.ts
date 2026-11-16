// The API the Lighthouse runs serve (apps/web/lighthouserc.json), bundled by `pnpm run lighthouse:api` to
// node_modules/.cache/lighthouse/api.mjs, which tools/serve/vercel-local.ts loads with `--api`. The real
// handlers of server/api.ts run, with their headers, caching and CORS (ADR-0045 §2); only CoinGecko is
// a fixture, so a run measures the screens and never the keyless upstream's 503 (docs/ENGINEERING.md §4).
// The store is memory whatever .env.local holds, so no fixture price reaches a shared copy. The
// deployment runs (tools/lighthouse/vercel.ts) keep the live API.
import type { Fetch } from '../lib/prices/coingecko';
import { runtimeCacheStore } from '../lib/server/shared-cache';
import { memoryStore } from '../lib/server/store';
import { createApi } from '../server/api';

const DAY_MS = 86_400_000;
/** CoinGecko ids and the currencies the fixture plan reads; flat, so no day is a red day. */
const PRICES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  bitcoin: { eur: 60_000, usd: 70_000 },
  ethereum: { eur: 2_000, usd: 2_340 },
};
const PRICE_PATH = '/api/v3/simple/price';
const CHART_PATH = /^\/api\/v3\/coins\/([^/]+)\/market_chart$/;

/** `/simple/price`: every fixture coin in every fixture currency, unchanged over 24 hours. */
function matrix(now: number) {
  const updated = Math.floor(now / 1000);
  return Object.fromEntries(
    Object.entries(PRICES).map(([id, quotes]) => [
      id,
      {
        ...quotes,
        ...Object.fromEntries(Object.keys(quotes).map((code) => [`${code}_24h_change`, 0])),
        last_updated_at: updated,
      },
    ]),
  );
}

/** `/coins/{id}/market_chart?days=365&interval=daily`: a point at each of the last 365 midnights and one now. */
function chart(price: number, now: number) {
  const midnight = now - (now % DAY_MS);
  const points: [number, number][] = Array.from({ length: 365 }, (_, i) => [midnight - (364 - i) * DAY_MS, price]);
  return { prices: [...points, [now, price]] };
}

function answer(url: URL, now: number): unknown {
  if (url.origin !== 'https://api.coingecko.com') return undefined;
  if (url.pathname === PRICE_PATH) return matrix(now);
  const id = CHART_PATH.exec(url.pathname)?.[1];
  const price = id === undefined ? undefined : PRICES[id]?.[url.searchParams.get('vs_currency') ?? ''];
  return price === undefined ? undefined : chart(price, now);
}

/** CoinGecko as the fixture answers it; any other URL is a bug in the run, not a missing price. */
export const fixtureUpstream: Fetch = async (input) => {
  const body = answer(new URL(input), Date.now());
  if (body === undefined) throw new Error(`lighthouse fixture: no answer for ${input}`);
  return Response.json(body);
};

export default createApi({
  fetch: fixtureUpstream,
  apiKey: () => undefined,
  store: memoryStore(),
  shared: runtimeCacheStore(),
  now: () => Date.now(),
  today: () => new Date().toISOString().slice(0, 10),
});
