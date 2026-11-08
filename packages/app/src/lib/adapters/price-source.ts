// Live prices from GET /api/prices (ADR-0006, ADR-0036) and the client's cache policy (docs/DOMAIN.md §9:
// a 60-second client TTL). The route answers every allow-listed coin in every currency, with the 24-hour
// change in the asked one, so the pay currency is part of the request and of the cached state. What the
// prices line says is decided here as a code with values; the copy words it (docs/CONTENT-STYLE.md §3).
import {
  assertNever,
  type CurrencyCode,
  type Instant,
  InstantSchema,
  ok,
  PRICE_TTL,
  PriceSnapshotSchema,
} from '@proofofcalm/core';
import type { Clock, PriceSource, PricesFailure, PricesState } from '../ports';
import type { ApiClient } from './api-client';
import { epochMs, todayIn } from './clock';

/** Set by the route on its last good copy (apps/web/lib/prices/handler.ts). */
export const STALE_HEADER = 'x-proof-of-calm-stale';

/** Set by the service worker on the copy it keeps: when it fetched that copy (apps/web/src/prices-copy.ts). */
const FETCHED_AT_HEADER = 'x-proof-of-calm-fetched-at';

/** The CDN's `stale-while-revalidate` on a fresh answer (apps/web/lib/prices/handler.ts). */
const CDN_SWR_SECONDS = 1800;
/** How far CoinGecko's `last_updated_at`, which becomes the snapshot's `at`, may trail the call. */
const UPSTREAM_LAG_SECONDS = 300;

/**
 * The oldest a healthy, unmarked answer gets: three caches of one server period each stack up, every one
 * starting its period when it copies the layer below (the API function's shared cache for the upstream
 * fetch, held in memory per instance until the Runtime Cache store lands, ADR-0045 §2 and its
 * deviations; the instance's copy; the CDN's `s-maxage`; ADR-0036), then the CDN's stale-while-revalidate, the upstream's
 * own lag and the client's TTL. Only an answer older than that, whichever cache served it (the service
 * worker answers from its copy first, ADR-0033), or one the server marked stale is labelled delayed.
 */
export const DELAYED_AFTER_MS =
  (3 * PRICE_TTL.serverSeconds + CDN_SWR_SECONDS + UPSTREAM_LAG_SECONDS + PRICE_TTL.clientSeconds) * 1000;

export function apiPriceSource(api: ApiClient, clock: Pick<Clock, 'now'>): PriceSource {
  return {
    async latest(currency) {
      const answer = await api.get('/api/prices', PriceSnapshotSchema, { currency });
      if (!answer.ok) return answer;
      return ok({
        snapshot: answer.value.data,
        currency,
        fetchedAt: fetchTime(answer.value.headers, clock.now()),
        stale: answer.value.headers.get(STALE_HEADER) === 'true',
        source: 'live',
      });
    },
  };
}

/**
 * When these prices were fetched: now, or, for a copy the service worker replays (its stale-while-revalidate
 * answers from the copy first, ADR-0033), the time the worker fetched it, so the line does not call an
 * earlier fetch this minute's and the next refresh asks again once that copy is past the client TTL. A
 * stamp after now (the device clock went back) or one that does not read as an instant counts as now.
 */
function fetchTime(headers: Headers, now: Instant): Instant {
  const stamp = InstantSchema.safeParse(headers.get(FETCHED_AT_HEADER));
  return stamp.success && epochMs(stamp.data) <= epochMs(now) ? stamp.data : now;
}

/**
 * Whether to ask for prices now: never fetched, another currency, older than the client TTL, or fetched
 * "later" than now because the device clock went back (its age is then unknown).
 */
export function shouldFetchPrices(
  state: PricesState | null,
  request: { readonly currency: CurrencyCode; readonly now: Instant },
): boolean {
  if (state === null || state.currency !== request.currency) return true;
  const elapsed = epochMs(request.now) - epochMs(state.fetchedAt);
  return elapsed < 0 || elapsed >= PRICE_TTL.clientSeconds * 1000;
}

/**
 * The prices line as data: `offline` ("Prices from 14:05, 16 Oct 2026 · offline"), `delayed` ("Prices
 * as of 12:40, 20 Oct 2026 · delayed"), `live` and `manual` with the time for the screen to show or
 * leave out, and `none` before any price exists. `at` is the time the prices describe; `sameDay` says
 * whether it falls on today's date in the device's zone. The line shows the date either way
 * (ADR-0033's reading of 2026-10-26).
 */
export type PricesLine =
  | { readonly code: 'none' }
  | { readonly code: 'live' | 'delayed' | 'offline' | 'manual'; readonly at: Instant; readonly sameDay: boolean };

export type PricesLineContext = {
  readonly now: Instant;
  readonly timeZone: string;
  /** What the platform reports (navigator.onLine); true where it cannot tell. */
  readonly online: boolean;
  /** Why the latest refresh failed; null when it succeeded or none ran. */
  readonly failure: PricesFailure | null;
};

export function pricesLine(state: PricesState | null, context: PricesLineContext): PricesLine {
  if (state === null) return { code: 'none' };
  const { at } = state.snapshot;
  const day = (instant: Instant) => todayIn(epochMs(instant), context.timeZone);
  const timed = { at, sameDay: day(at) === day(context.now) };
  if (state.source === 'manual') return { code: 'manual', ...timed };
  if (!context.online || unanswered(context.failure)) return { code: 'offline', ...timed };
  const old = epochMs(context.now) - epochMs(at) > DELAYED_AFTER_MS;
  return { code: state.stale || old ? 'delayed' : 'live', ...timed };
}

/**
 * Whether the latest refresh got no answer at all, which reads as offline. An error status, a bad body
 * or a failure on this device did get an answer: the cached prices then speak for themselves through
 * their age.
 */
function unanswered(failure: PricesFailure | null): boolean {
  if (failure === null) return false;
  switch (failure.kind) {
    case 'network':
      return true;
    case 'http':
    case 'invalid':
    case 'local':
      return false;
    default:
      return assertNever(failure);
  }
}
