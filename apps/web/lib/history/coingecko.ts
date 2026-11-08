import 'server-only';
import { type CurrencyCode, fromEpochDay, fromFloat, type PriceHistory } from '@proofofcalm/core';
import * as z from 'zod/mini';
import type { Fetch } from '../prices/coingecko';

// CoinGecko Demo `/coins/{id}/market_chart`, server-side only (ADR-0036; docs.coingecko.com
// v3.0.1/reference/coins-id-market-chart, read 2026-10-20): `days=365` is the Demo plan's whole history
// ("restricted to the past 365 days"), `interval=daily` asks for one point per day at 00:00 UTC whatever
// the window, `precision=full` keeps the price as given. The id comes from the coin catalogue and the
// currency from CURRENCIES (docs/SECURITY.md §2); the key travels in the header, never in the URL.
const ROOT = 'https://api.coingecko.com/api/v3';
const MAX_CLOSES = 365;
const PRICE_DP = 10;
const DAY_MS = 86_400_000;

const ChartSchema = z.object({ prices: z.array(z.tuple([z.number(), z.nullable(z.number())])) });

/**
 * The daily closes on UTC days, oldest first: a point at 00:00 UTC closes the day before, and the last
 * point, the price at the call, stands for today; the later point of a day wins.
 */
function toCloses(points: readonly (readonly [number, number | null])[]): PriceHistory {
  const byDay = new Map<string, PriceHistory[number]>();
  for (const [ms, price] of points) {
    if (!Number.isSafeInteger(ms) || price === null || !Number.isFinite(price) || price <= 0) continue;
    const day = fromEpochDay(Math.floor((ms - 1) / DAY_MS));
    byDay.set(day, [day, fromFloat(price, PRICE_DP)]);
  }
  return [...byDay.values()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-MAX_CLOSES);
}

/** The closes, at least one, or an error that the caller turns into a 502. */
export async function fetchCloses(
  fetchFn: Fetch,
  apiKey: string | undefined,
  geckoId: string,
  currency: CurrencyCode,
): Promise<PriceHistory> {
  const params = new URLSearchParams({
    vs_currency: currency.toLowerCase(),
    days: String(MAX_CLOSES),
    interval: 'daily',
    precision: 'full',
  });
  const response = await fetchFn(`${ROOT}/coins/${encodeURIComponent(geckoId)}/market_chart?${params}`, {
    headers: { accept: 'application/json', ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}) },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
  const chart = ChartSchema.safeParse(await response.json());
  if (!chart.success) throw new Error('CoinGecko answered an unexpected shape');
  const closes = toCloses(chart.data.prices);
  if (closes.length === 0) throw new Error('CoinGecko answered no closes');
  return closes;
}
