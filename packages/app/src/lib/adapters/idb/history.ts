// The history cache of ADR-0036 in the same database: one coin's daily closes in one currency with the
// time they were fetched, keyed [coin, currency]. A copy older than 24 hours, or one that no longer
// reads, is deleted rather than kept or quarantined: the terms allow no longer, and a cache refetches.
// A copy is stored only beside a live plan, read in the same transaction, so "Delete everything" leaves none.
import type { Instant } from '@proofofcalm/core';
import type { IDBPObjectStore } from 'idb';
import { CachedHistorySchema, type HistoryCache } from '../../ports';
import { assertStorable } from '../checks';
import { historyFresh } from '../history';
import type { Database, StorageSchema, StoreName } from './database';
import { storedLive } from './rows';

const fresh = (raw: unknown, now: Instant) => {
  const read = CachedHistorySchema.safeParse(raw);
  return read.success && historyFresh(read.data.fetchedAt, now) ? read.data : null;
};

export function idbHistoryCache(connect: () => Promise<Database>): HistoryCache {
  return {
    async get(coin, currency, now) {
      const tx = (await connect()).transaction('history', 'readwrite');
      const raw = await tx.store.get([coin, currency]);
      const hit = fresh(raw, now);
      if (hit === null && raw !== undefined) await tx.store.delete([coin, currency]);
      await tx.done;
      return hit;
    },
    async put(history) {
      assertStorable(CachedHistorySchema, history, 'price history');
      // Closes belong beside a plan: a fetch that resolves after "Delete everything" stores nothing.
      const tx = (await connect()).transaction(['history', 'plans'], 'readwrite');
      const write = async () => {
        if ((await tx.objectStore('plans').getAll()).some(storedLive)) await tx.objectStore('history').put(history);
      };
      await Promise.all([write(), tx.done]);
    },
  };
}

type HistoryStore = IDBPObjectStore<StorageSchema, StoreName[], 'history', 'readwrite'>;

/** Deletes every expired or unreadable copy, so none outlives the terms however rarely it is read. */
export async function sweepHistory(store: HistoryStore, now: Instant): Promise<void> {
  let cursor = await store.openCursor();
  while (cursor !== null) {
    if (fresh(cursor.value, now) === null) await cursor.delete();
    cursor = await cursor.continue();
  }
}
