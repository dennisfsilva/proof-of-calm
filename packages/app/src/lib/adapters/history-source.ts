// Daily closes from GET /api/history/:coin (ADR-0006, ADR-0036) through the device's HistoryCache: a copy
// fetched less than 24 hours ago answers without a request, else the API is asked and its answer stored
// with the server's `fetchedAt`, so the device keeps it for 24 hours after the upstream fetch, not after
// this request (the route's CDN copy has already used part of that time). An answer for another coin or
// currency than asked is invalid. A device that refuses to store the answer still gets it.
import { err, ok } from '@proofofcalm/core';
import { CachedHistorySchema, type Clock, type HistoryCache, type HistorySource } from '../ports';
import type { ApiClient } from './api-client';

export function apiHistorySource(api: ApiClient, cache: HistoryCache, clock: Pick<Clock, 'now'>): HistorySource {
  return {
    async closes(coin, currency) {
      const hit = await cache.get(coin, currency, clock.now()).catch(() => null);
      if (hit !== null) return ok(hit);
      const answer = await api.get(`/api/history/${encodeURIComponent(coin)}`, CachedHistorySchema, { currency });
      if (!answer.ok) return answer;
      const history = answer.value.data;
      if (history.coin !== coin || history.currency !== currency) return err({ kind: 'invalid' });
      await cache.put(history).catch(() => undefined);
      return ok(history);
    },
  };
}
