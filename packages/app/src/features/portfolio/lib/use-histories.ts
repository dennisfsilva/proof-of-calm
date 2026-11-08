import { COINS } from '@proofofcalm/content';
import { type CoinId, type CurrencyCode, compareInstants, type Instant, type PriceHistories } from '@proofofcalm/core';
import { startTransition, useEffect, useState } from 'react';
import type { ApiFailure } from '../../../lib/ports';
import { useServices } from '../../../lib/services';

// The daily closes the value chart needs (ADR-0036: the device keeps them at most 24 hours): one read per
// coin through the history source, ready only once every coin has its closes, since a value without one
// of the coins would be a partial sum (docs/DOMAIN.md §3.6). The time is the oldest fetch, as the prices
// line's is. An answer that arrives after the coins or the currency changed is dropped. A coin outside the
// catalogue (an imported page file may carry one, docs/DOMAIN.md §3.13) is never asked for: the history route
// serves the catalogue only (ADR-0036), so it has no closes, which the chart says, rather than a failed read.
// The answer renders as a transition, which React splits into slices that yield to the browser, so the
// drawn chart and its table never mount in one long task (docs/ENGINEERING.md §4).

export type HistoriesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly histories: PriceHistories; readonly fetchedAt: Instant }
  | { readonly status: 'failed'; readonly failure: ApiFailure };

const LOADING: HistoriesState = { status: 'loading' };

/** Whether the history route serves the coin's closes: the coin catalogue, the route's allow-list (ADR-0036). */
export function servesHistory(coin: CoinId): boolean {
  return COINS.some((known) => known.id === coin);
}

/** Stays loading for no coins in the catalogue: there is nothing to read. */
export function useHistories(coins: readonly CoinId[], currency: CurrencyCode): HistoriesState {
  const { history } = useServices();
  // The inputs as one value, so a new array of the same coins reads nothing again.
  const key = `${currency} ${coins.join(' ')}`;
  const [state, setState] = useState<{ readonly key: string; readonly value: HistoriesState }>({
    key,
    value: LOADING,
  });

  useEffect(() => {
    // No coins leaves a trailing space, which splits into one empty id: drop it.
    const [wanted, ...ids] = key.split(' ').filter((part) => part !== '') as [CurrencyCode, ...CoinId[]];
    const served = ids.filter(servesHistory);
    if (served.length === 0) return;
    let current = true;
    void Promise.all(served.map((coin) => history.closes(coin, wanted))).then((results) => {
      if (!current) return;
      const failed = results.find((result) => !result.ok);
      if (failed !== undefined && !failed.ok) {
        startTransition(() => setState({ key, value: { status: 'failed', failure: failed.error } }));
        return;
      }
      const loaded = results.flatMap((result) => (result.ok ? [result.value] : []));
      const fetchedAt = loaded
        .map((each) => each.fetchedAt)
        .reduce((oldest, each) => (compareInstants(each, oldest) < 0 ? each : oldest));
      const histories: PriceHistories = {
        currency: wanted,
        coins: Object.fromEntries(loaded.map((each) => [each.coin, each.closes])),
      };
      startTransition(() => setState({ key, value: { status: 'ready', histories, fetchedAt } }));
    });
    return () => {
      current = false;
    };
  }, [history, key]);

  return state.key === key ? state.value : LOADING;
}
