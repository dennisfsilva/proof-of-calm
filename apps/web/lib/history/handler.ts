// GET /api/history/:coin?currency=EUR (ADR-0006, ADR-0036): at most 365 daily closes of one allow-listed
// coin in one currency, fetched from CoinGecko once per key per HISTORY_TTL_SECONDS across instances
// through the shared cache (ADR-0045 §2). The CDN keeps an answer only for what is left of the copy's
// day (ADR-0036) and the device for 24 hours after the same fetch, so no copy is 24 hours old anywhere. An
// upstream failure is a 502 with no body: the charts fall back on their own, never on an old copy.
import { type CachedHistory, CachedHistorySchema } from '@proofofcalm/app/lib/ports';
import { COINS } from '@proofofcalm/content';
import { CURRENCIES, type CurrencyCode, instantFromEpochMs } from '@proofofcalm/core';
import { corsHeaders } from '../http/cors';
import type { PricesDeps } from '../prices/handler';
import { fetchCloses } from './coingecko';

export const HISTORY_TTL_SECONDS = 24 * 60 * 60;
/** After a failed upstream call for a key, the next try for it waits this long. */
const RETRY_AFTER_FAILURE_MS = 60_000;

type Coin = (typeof COINS)[number];

export type HistoryDeps = Pick<PricesDeps, 'fetch' | 'apiKey' | 'shared' | 'now'>;

/**
 * The currency of a canonical query only: none (EUR), or exactly `?currency=` and an allow-listed code as
 * written. Letter case, repeats, other parameters, a bare `?`, an encoded or empty value would each be
 * another CDN cache key that reaches the function, so they are refused before anything is fetched
 * (docs/SECURITY.md §2).
 */
function canonicalCurrency(url: string): CurrencyCode | undefined {
  const start = url.indexOf('?');
  if (start === -1) return 'EUR';
  const search = url.slice(start);
  return CURRENCIES.find((known): known is CurrencyCode => search === `?currency=${known}`);
}

const refuse = (status: number, cors: Record<string, string>) =>
  new Response(null, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

export function createHistoryHandler(deps: HistoryDeps): (request: Request, coin: string) => Promise<Response> {
  const inflight = new Map<string, Promise<CachedHistory | null>>();
  const failedAt = new Map<string, number>();
  const ttlMs = HISTORY_TTL_SECONDS * 1000;

  /** The shared copy while it is younger than the TTL, whatever the cache kept; a future fetch time counts as new. */
  const cached = async (key: string): Promise<CachedHistory | null> => {
    try {
      const stored = await deps.shared.get(key);
      const parsed = stored === null ? null : CachedHistorySchema.safeParse(JSON.parse(stored));
      return parsed?.success && deps.now() - Date.parse(parsed.data.fetchedAt) < ttlMs ? parsed.data : null;
    } catch {
      return null;
    }
  };

  const refresh = async (key: string, coin: Coin, currency: CurrencyCode) => {
    try {
      const closes = await fetchCloses(deps.fetch, deps.apiKey(), coin.geckoId, currency);
      const copy = CachedHistorySchema.parse({
        coin: coin.id,
        currency,
        closes,
        fetchedAt: instantFromEpochMs(deps.now()),
      });
      await deps.shared.set(key, JSON.stringify(copy), HISTORY_TTL_SECONDS).catch(() => undefined);
      return copy;
    } catch {
      failedAt.set(key, deps.now());
      return null;
    }
  };

  const current = async (coin: Coin, currency: CurrencyCode): Promise<CachedHistory | null> => {
    const key = `history:${coin.id}:${currency}`;
    const hit = await cached(key);
    if (hit !== null) return hit;
    if (deps.now() - (failedAt.get(key) ?? Number.NEGATIVE_INFINITY) < RETRY_AFTER_FAILURE_MS) return null;
    let call = inflight.get(key);
    if (call === undefined) {
      call = refresh(key, coin, currency).finally(() => inflight.delete(key));
      inflight.set(key, call);
    }
    return call;
  };

  return async (request, asked) => {
    const cors = corsHeaders(request.headers.get('origin'));
    const currency = canonicalCurrency(request.url);
    const coin = COINS.find((known) => known.id === asked);
    if (currency === undefined || coin === undefined) return refuse(400, cors);
    const copy = await current(coin, currency);
    if (copy === null) return refuse(502, cors);
    const ageSeconds = Math.max(0, Math.ceil((deps.now() - Date.parse(copy.fetchedAt)) / 1000));
    return Response.json(copy, {
      headers: { ...cors, 'Cache-Control': `public, s-maxage=${Math.max(0, HISTORY_TTL_SECONDS - ageSeconds)}` },
    });
  };
}
