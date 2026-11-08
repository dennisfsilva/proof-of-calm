// A PlanStore that keeps the snapshot in memory: the adapter for tests and Storybook, with the semantics
// of the IndexedDB adapter (ADR-0019): a write refuses what the schemas reject, entries replace by id and
// stay in id order, a plan replaces the plan, "Delete everything" empties it and its undo puts it back
// while no plan and no live entry is there, cached closes are kept only beside a plan and expire after 24
// hours. Nothing in memory goes corrupt or comes from a newer build, so it never quarantines or counts
// newer rows; seeded counts show as they are.
// It has no clock, so its last prices stay until replaced; the 24-hour rule for live prices belongs to
// the adapter that keeps them on the device (idb-store.ts).
import { DEFAULT_PREFS, type Entry, liveEntries } from '@proofofcalm/core';
import type { Changes, PlanStore, Snapshot, WipedRows } from '../ports';
import { assertStorableChanges } from './checks';
import { memoryHistoryCache } from './history';

export const EMPTY_SNAPSHOT: Snapshot = {
  plan: null,
  entries: [],
  prefs: DEFAULT_PREFS,
  prices: null,
  quarantined: 0,
  newer: { plans: 0, entries: 0 },
  newerTombstones: 0,
};

/** What this adapter's wipe takes: the snapshot as it was. */
type MemoryWiped = { readonly memory: Snapshot };

/** Entries in id order, the order IndexedDB returns them in, so a snapshot reads the same after a reload. */
export function inIdOrder(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id));
}

/**
 * The snapshot after `changes`: entries replace by id or join, in id order; the preferences replace
 * except `changedAt`, which only the stamp `changes.changedAt` sets; the rest replace.
 */
export function applyChanges(snapshot: Snapshot, changes: Changes): Snapshot {
  let entries = snapshot.entries;
  if (changes.entries !== undefined) {
    const merged = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
    for (const entry of changes.entries) merged.set(entry.id, entry);
    entries = inIdOrder([...merged.values()]);
  }
  const changedAt = changes.changedAt ?? snapshot.prefs.changedAt;
  return {
    plan: changes.plan === undefined ? snapshot.plan : changes.plan,
    entries,
    prefs: { ...(changes.prefs ?? snapshot.prefs), changedAt },
    prices: changes.prices ?? snapshot.prices,
    quarantined: snapshot.quarantined,
    newer: snapshot.newer,
    newerTombstones: snapshot.newerTombstones,
  };
}

export function memoryPlanStore(initial: Snapshot = EMPTY_SNAPSHOT): PlanStore & { readonly current: () => Snapshot } {
  let snapshot: Snapshot = { ...initial, entries: inIdOrder(initial.entries) };
  const history = memoryHistoryCache(() => snapshot.plan !== null);
  return {
    current: () => snapshot,
    load: async () => snapshot,
    write: async (changes) => {
      assertStorableChanges(changes);
      snapshot = applyChanges(snapshot, changes);
    },
    // Through `write`, so a test that replaces it (a failing or a slow store) changes updates too; with
    // the store's own `write` the read, the build and the write happen in one synchronous step.
    async update(build) {
      const read = snapshot;
      const changes = build(read);
      await this.write(changes);
      return { snapshot: read, changes };
    },
    // The undo gives back the snapshot; cached closes are not kept for it, a chart fetches them again.
    wipe: async () => {
      const taken: MemoryWiped = { memory: snapshot };
      snapshot = EMPTY_SNAPSHOT;
      history.clear();
      return taken as unknown as WipedRows;
    },
    restore: async (rows) => {
      if (snapshot.plan !== null || liveEntries(snapshot.entries).length > 0) return false;
      snapshot = (rows as unknown as MemoryWiped).memory;
      return true;
    },
    history,
  };
}
