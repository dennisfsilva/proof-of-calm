import { useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { pricesLine } from '../../../lib/adapters';
import type { PricesFailure, PricesState } from '../../../lib/ports';
import { useClock, useFormatters } from '../../../lib/services';
import { KEYS, widestPrices } from '../lib/prices-reserve';

// The one prices line under a value, on Today and Portfolio alike (docs/CONTENT-STYLE.md §3: "Offline",
// "Stale prices", "Prices attribution"). CoinGecko's prices carry its credit online, delayed and offline
// (ADR-0036); prices typed by hand carry none and keep their "as of" line offline. Since the line can carry
// the credit, the screens set it at `text-14`, never smaller (ADR-0050), in its slot: the line's widest forms
// stand invisible in its grid cell, so nothing below moves when the prices arrive (docs/ENGINEERING.md §4).

const CELL = 'nums col-start-1 row-start-1 text-14 text-ink-2';

/** The prices line's place, as tall before the prices arrive (`prices` null) as with any line they draw. */
export function PricesSlot({
  prices,
  online,
  failure,
}: {
  readonly prices: PricesState | null;
  readonly online: boolean;
  readonly failure: PricesFailure | null;
}) {
  const t = useTranslations('today');
  const format = useFormatters();
  const clock = useClock();
  const widest = useMemo(() => widestPrices(format, clock, (key, values) => t(key, values)), [format, clock, t]);
  return (
    <div className="grid grid-cols-1">
      {/* Drawn from the attribute, so no search, test or copy of the page finds the forms' words. */}
      {widest.map((line) => (
        <p key={line} aria-hidden data-line={line} className={`${CELL} invisible before:content-[attr(data-line)]`} />
      ))}
      {prices !== null && (
        <p className={CELL}>
          <PricesLine prices={prices} online={online} failure={failure} />
        </p>
      )}
    </div>
  );
}

/** Where the value's prices are from, for every `pricesLine` code. */
function PricesLine({
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
