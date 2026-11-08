// The history cache's one rule (ADR-0036): CoinGecko's terms allow a cache refreshed at least every 24
// hours and no longer, so a copy older than that is gone, not stale. The same rule holds for the last
// live prices on the device. Shared by both adapters; the in-memory cache below is the one tests and
// Storybook use.
import type { Instant } from '@proofofcalm/core';
import { type CachedHistory, CachedHistorySchema, type HistoryCache, type PricesState } from '../ports';
import { assertStorable } from './checks';
import { epochMs } from './clock';

export const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
/** How far a fetch time may lie after the device's `now`: a device clock this much behind the server's. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Fetched less than 24 hours before `now` and at most `aheadMs` after it; an unparsable time is neither. */
function withinTtl(fetchedAt: Instant, now: Instant, aheadMs: number): boolean {
  let age: number;
  try {
    age = epochMs(now) - epochMs(fetchedAt);
  } catch {
    return false;
  }
  return age >= -aheadMs && age < HISTORY_TTL_MS;
}

/**
 * A history copy's `fetchedAt` is the server's clock, so one up to CLOCK_SKEW_MS after `now` is a device
 * clock a little behind, kept rather than deleted and refetched on every read. The bound stays the
 * device's 24 hours after `fetchedAt` (a clock behind by the allowance keeps a copy at most that much
 * longer in real time). A fetch time further ahead (the device clock went back) or one that does not
 * parse counts as expired: refetching is cheap, keeping data too long is not allowed.
 */
export function historyFresh(fetchedAt: Instant, now: Instant): boolean {
  return withinTtl(fetchedAt, now, CLOCK_SKEW_MS);
}

/**
 * Prices typed by hand (the user's, not CoinGecko's), or live prices fetched less than 24 hours before
 * `now` whose data is also less than 24 hours old. The data's own time counts because a cache can hand
 * over an old copy: the route's last good copy or the service worker's (ADR-0036). `at` is the server's
 * time, so one a little after `now` is a device clock behind the server's, not a reason to delete; the
 * fetch time is the device's own, so one after `now` is a clock that went back and expires the copy.
 */
export function pricesKept(prices: PricesState, now: Instant): boolean {
  if (prices.source === 'manual') return true;
  return withinTtl(prices.fetchedAt, now, 0) && epochMs(now) - epochMs(prices.snapshot.at) < HISTORY_TTL_MS;
}

/**
 * The in-memory cache. `planStored` says whether a live plan is stored: as in IndexedDB, closes are kept
 * only beside one, so a fetch that resolves after "Delete everything" keeps nothing. Without it (a cache on
 * its own, in a test) a plan is taken as stored.
 */
export function memoryHistoryCache(
  planStored: () => boolean = () => true,
): HistoryCache & { readonly clear: () => void } {
  const cached = new Map<string, CachedHistory>();
  const key = (coin: string, currency: string) => `${coin}|${currency}`;
  return {
    async get(coin, currency, now) {
      const hit = cached.get(key(coin, currency));
      if (hit === undefined) return null;
      if (historyFresh(hit.fetchedAt, now)) return hit;
      cached.delete(key(coin, currency));
      return null;
    },
    async put(history) {
      assertStorable(CachedHistorySchema, history, 'price history');
      if (!planStored()) return;
      cached.set(key(history.coin, history.currency), history);
    },
    clear: () => cached.clear(),
  };
}
