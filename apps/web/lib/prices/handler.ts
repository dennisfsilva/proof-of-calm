// GET /api/prices (ADR-0006, ADR-0036): the whole coin × currency matrix from CoinGecko at most once
// per PRICE_TTL.serverSeconds per instance, and once across instances through the shared cache
// (ADR-0045 §2), served from the CDN for ten minutes; when the upstream fails, the last good copy with
// its time and `x-proof-of-calm-stale: true`, for less than 24 hours after its fetch; with nothing to
// serve, 503. Every answer passes the core's schema.
import {
  CURRENCIES,
  type CurrencyCode,
  compareInstants,
  type Instant,
  InstantSchema,
  instantFromEpochMs,
  PRICE_TTL,
} from '@proofofcalm/core';
import * as z from 'zod/mini';
import { corsHeaders } from '../http/cors';
import type { KeyValueStore, SharedCache } from '../server/store';
import { type Fetch, fetchMatrix } from './coingecko';
import { toSnapshot, type UpstreamMatrix, UpstreamMatrixSchema } from './snapshot';

export const LAST_GOOD_KEY = 'prices:last';
/** The fresh matrix in the shared cache, for PRICE_TTL.serverSeconds after its fetch. */
export const FRESH_KEY = 'prices:fresh';
/** After a failed upstream call, the next try waits this long; the last good copy covers the gap. */
const RETRY_AFTER_FAILURE_MS = 60_000;
/**
 * CoinGecko's terms allow a cache refreshed at least every 24 hours and no longer (ADR-0036): an older
 * last good copy is gone, not stale, and the shared one expires in the store at the same age.
 */
const LAST_GOOD_MAX_AGE_SECONDS = 24 * 60 * 60;

const CopySchema = z.object({ matrix: UpstreamMatrixSchema, fetchedAt: InstantSchema });
type Copy = { readonly matrix: UpstreamMatrix; readonly fetchedAt: Instant };

export type PricesDeps = {
  readonly fetch: Fetch;
  /** Read per call: the key exists at run time, not when the module is built. */
  readonly apiKey: () => string | undefined;
  readonly store: KeyValueStore;
  /** The cache every instance of the function reads before it calls upstream (ADR-0045 §2). */
  readonly shared: SharedCache;
  readonly now: () => number;
};

const FRESH = 'public, s-maxage=600, stale-while-revalidate=1800';
const STALE = 'public, s-maxage=60';

export function createPricesHandler(deps: PricesDeps): (request: Request) => Promise<Response> {
  let copy: Copy | null = null;
  let copiedAt = Number.NEGATIVE_INFINITY;
  let failedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<Copy | null> | null = null;
  const ttlMs = PRICE_TTL.serverSeconds * 1000;

  const refresh = async (): Promise<Copy | null> => {
    try {
      const matrix = await fetchMatrix(deps.fetch, deps.apiKey());
      const fresh: Copy = { matrix, fetchedAt: instantFromEpochMs(deps.now()) };
      copy = fresh;
      copiedAt = deps.now();
      const text = JSON.stringify(fresh);
      await Promise.all([
        deps.shared.set(FRESH_KEY, text, PRICE_TTL.serverSeconds).catch(() => undefined),
        deps.store.set(LAST_GOOD_KEY, text, LAST_GOOD_MAX_AGE_SECONDS).catch(() => undefined),
      ]);
      return fresh;
    } catch {
      failedAt = deps.now();
      return null;
    }
  };

  /** A copy as another instance stored it, or null for anything else. */
  const parseCopy = (stored: string | null): Copy | null => {
    if (stored === null) return null;
    try {
      const parsed = CopySchema.safeParse(JSON.parse(stored));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  /** Fetched less than `maxAgeMs` ago; a fetch time in the future (another instance's clock) counts too. */
  const young = (candidate: Copy | null, maxAgeMs: number): Copy | null => {
    if (candidate === null) return null;
    const oldest = instantFromEpochMs(deps.now() - maxAgeMs);
    return compareInstants(candidate.fetchedAt, oldest) > 0 ? candidate : null;
  };

  /**
   * Another instance's fresh copy from the shared cache, whose time to live is the TTL; the age check
   * guards against a cache that kept it longer. Read per call while this instance's copy is old, so
   * the instances together call upstream once per TTL (ADR-0045 §2).
   */
  const sharedFresh = async (): Promise<Copy | null> =>
    young(parseCopy(await deps.shared.get(FRESH_KEY).catch(() => null)), ttlMs);

  /**
   * This instance's copy while it is young, else the shared one in the store (a cold instance after an
   * outage, or another instance that fetched more recently).
   */
  const lastGood = async (): Promise<Copy | null> => {
    const local = young(copy, LAST_GOOD_MAX_AGE_SECONDS * 1000);
    if (local !== null) return local;
    const stored = await deps.store.get(LAST_GOOD_KEY).catch(() => null);
    return young(parseCopy(stored), LAST_GOOD_MAX_AGE_SECONDS * 1000);
  };

  const current = async (): Promise<{ copy: Copy | null; stale: boolean }> => {
    const now = deps.now();
    if (copy !== null && now - copiedAt < ttlMs) return { copy, stale: false };
    const shared = await sharedFresh();
    if (shared !== null) return { copy: shared, stale: false };
    if (now - failedAt >= RETRY_AFTER_FAILURE_MS) {
      inflight ??= refresh().finally(() => {
        inflight = null;
      });
      const fresh = await inflight;
      if (fresh !== null) return { copy: fresh, stale: false };
    }
    const fallback = await lastGood();
    return { copy: fallback, stale: fallback !== null };
  };

  return async (request) => {
    const cors = corsHeaders(request.headers.get('origin'));
    const asked = (new URL(request.url).searchParams.get('currency') ?? 'EUR').toUpperCase();
    const currency = CURRENCIES.find((code): code is CurrencyCode => code === asked);
    if (currency === undefined) {
      return Response.json(
        { error: 'unknown-currency' },
        { status: 400, headers: { ...cors, 'Cache-Control': 'no-store' } },
      );
    }
    const { copy: source, stale } = await current();
    const snapshot = source === null ? null : toSnapshot(source.matrix, currency, source.fetchedAt);
    if (snapshot === null) {
      return Response.json(
        { error: 'prices-unavailable' },
        { status: 503, headers: { ...cors, 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(snapshot, {
      headers: { ...cors, 'Cache-Control': stale ? STALE : FRESH, 'x-proof-of-calm-stale': String(stale) },
    });
  };
}
