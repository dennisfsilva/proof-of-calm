import { useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { pricesLine } from '../../../lib/adapters';
import type { PricesFailure, PricesState } from '../../../lib/ports';
import { useClock, useFormatters } from '../../../lib/services';

// The one prices line under a value, on Today and Portfolio alike (docs/CONTENT-STYLE.md §3: "Offline",
// "Stale prices", "Prices attribution"). CoinGecko's prices carry its credit online, delayed and offline
// (ADR-0036); prices typed by hand carry none and keep their "as of" line offline.

/** Each code's message, with CoinGecko's credit for its prices and without for any other source. */
const KEYS = {
  live: { live: 'prices.asOfLive', other: 'prices.asOf' },
  manual: { live: 'prices.asOfLive', other: 'prices.asOf' },
  delayed: { live: 'prices.delayedLive', other: 'prices.delayed' },
  offline: { live: 'prices.fromOfflineLive', other: 'prices.fromOffline' },
} as const;

/** Where the value's prices are from, for every `pricesLine` code. */
export function PricesLine({
  prices,
  online,
  failure,
}: {
  readonly prices: PricesState;
  readonly online: boolean;
  readonly failure: PricesFailure | null;
}) {
  const t = useTranslations('today');
  const f = useFormatters();
  const clock = useClock();
  const now = clock.now();
  const line = pricesLine(prices, { now, timeZone: clock.timeZone, online, failure });
  if (line.code === 'none') return null;
  // Live and typed prices read at their fetch; delayed and offline ones at the time the prices describe.
  const at = line.code === 'live' || line.code === 'manual' ? prices.fetchedAt : line.at;
  const keys = KEYS[line.code];
  return t(prices.source === 'live' ? keys.live : keys.other, {
    time: f.time(at, clock.timeZone, now),
    date: f.instantDate(at, clock.timeZone),
  });
}

/** What the platform reports about the network (`navigator.onLine`), followed through its events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
