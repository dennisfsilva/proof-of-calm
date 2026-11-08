// The domain store (ADR-0019, ADR-0020): one immutable snapshot, hydrated from the PlanStore at startup
// and replaced on every write. Features read it through selectors and change it only through their
// actions, which validate with the core first; derived views stay in the core, computed in render.
// A write in another tab arrives on the cross-tab channel and reloads this tab's snapshot; a wipe there
// also clears this tab's drafts.

import { type Instant, liveEntries, type Plan } from '@proofofcalm/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { applyChanges, EMPTY_SNAPSHOT } from '../adapters/memory-store';
import type { Built, Changes, PlanStore, Snapshot, WipedRows } from '../ports';
import { type CrossTabChannel, localOnly } from './channel';

/** What the store notes of each of its plan writes, beside the stamp it replaced. */
export type OwnPlanWrite = Pick<Plan, 'id' | 'lastBuy' | 'endedBuyingOn' | 'updatedAt'>;

export type DomainState = {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly snapshot: Snapshot;
  /** Why hydration failed; the error surface words it. */
  readonly failure: string | null;
};

export type DomainStore = {
  readonly store: StoreApi<DomainState>;
  /** Loads the snapshot once; a second call reloads it (another tab wrote). */
  hydrate(): Promise<void>;
  /**
   * Persists the rows, then shows them, then tells the other tabs (not for live prices alone); a failed
   * write changes nothing and rethrows. After a failed hydration it loads first and refuses the write,
   * with the load's error, while that still fails: changes merged into an empty snapshot would not be
   * what is stored. Given a function, the write runs it in its turn, synchronously, on the snapshot as
   * stored (PlanStore.update), so a change built from the current state never drops one still on its
   * way, from this tab or another; the tab then shows that snapshot with the change.
   * A write of the plan or of at least one entry stamps `prefs.changedAt` with `now` in the same stored
   * write, on the prefs row as stored (docs/DOMAIN.md §3.11, backupNeeded); preferences alone and prices
   * never do.
   */
  write(changes: Changes | ((snapshot: Snapshot) => Built)): Promise<void>;
  /**
   * "Delete everything" (Settings), at once: the stored rows go, `afterWipe` forgets what the device keeps
   * beside them, the snapshot empties and the other tabs follow (each clearing its own drafts). It gives
   * back the rows for `restore`. Once the tab shows nothing to delete (ready, with no plan, no live entry
   * and no set-aside row), it wipes nothing and gives null: a second wipe in a row would take only the
   * empty stores, and an undo of those would leave the first wipe's rows gone.
   */
  wipe(): Promise<WipedRows | null>;
  /**
   * The undo of `wipe`: puts the rows back while no plan and no live entry is stored, then shows what is
   * stored and, when it put them back, tells the other tabs. The drafts stay gone, and nothing is stamped:
   * the rows are as they were. False when another tab started or imported a plan in the meantime.
   */
  restore(rows: WipedRows): Promise<boolean>;
  /**
   * This store's plan writes after the plan stamped `from` up to the plan stamped `to`, newest first; `[]`
   * when `to` is `from`. Each plan write here that changes the stamp notes, beside it, the stamp it replaced
   * and the plan's id, `lastBuy` and `endedBuyingOn`, in memory (the last `OWN_PLAN_WRITES`; `wipe` and
   * `restore` forget them). Null when the walk back from `to` does not reach `from`: another tab wrote in between, or
   * a wipe or restore forgot the writes. An undo checks it on the plan as stored.
   */
  ownPlanWrites(from: Instant, to: Instant): readonly OwnPlanWrite[] | null;
  /** Stops following the other tabs (a store that is thrown away). */
  dispose(): void;
};

/**
 * Whether the other tabs need to reload for this write. Live prices alone do not: each visible tab
 * fetches its own every minute (PRICE_TTL), and a full reload per tab per minute would sweep the history
 * cache and re-render every subscriber for nothing. Prices typed by hand are the user's, so they do.
 */
function toldToOtherTabs(changes: Changes): boolean {
  const { prices, ...rest } = changes;
  return Object.values(rest).some((value) => value !== undefined) || prices?.source === 'manual';
}

/** How many stored rows were set aside as unreadable, for the one-line notice (ADR-0019). */
export const selectQuarantined = (state: DomainState): number => state.snapshot.quarantined;

/** How many live stored rows a newer build wrote, for the newer-version screen (ADR-0019 readings). */
export const selectNewer = (state: DomainState): Snapshot['newer'] => state.snapshot.newer;

/** How many of this store's plan writes `ownPlanWrites` remembers; an undo window holds far fewer. */
const OWN_PLAN_WRITES = 64;

export type DomainStoreOptions = {
  /** Clears what the device keeps outside the PlanStore, such as the form drafts (Drafts.clearAll). */
  readonly afterWipe?: () => void;
  /** The moment a plan or entries write stamps as `prefs.changedAt`; without it nothing is stamped. */
  readonly now?: () => Instant;
};

export function createDomainStore(
  planStore: PlanStore,
  channel: CrossTabChannel = localOnly,
  options: DomainStoreOptions = {},
): DomainStore {
  const store = createStore<DomainState>()(() => ({ status: 'loading', snapshot: EMPTY_SNAPSHOT, failure: null }));

  // One operation at a time in this tab: a reload asked for by another tab waits for this tab's write
  // to land, so it can never put back the snapshot from before it.
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  /** Loads the snapshot; a failure is recorded for the error surface and returned. */
  async function load(): Promise<unknown> {
    try {
      const snapshot = await planStore.load();
      store.setState({ status: 'ready', snapshot, failure: null });
      return null;
    } catch (error) {
      store.setState({ status: 'failed', failure: error instanceof Error ? error.message : String(error) });
      return error ?? new Error('load failed');
    }
  }

  /**
   * The changes with `changedAt` when they write the plan or at least one entry (an import too); an
   * empty list of entries changes nothing to back up. The stamp goes to the stored prefs row alone:
   * preferences from this snapshot could be older than another tab's.
   */
  const stamped = (changes: Changes): Changes => {
    const { now } = options;
    const touched = changes.plan !== undefined || (changes.entries?.length ?? 0) > 0;
    if (now === undefined || !touched) return changes;
    return { ...changes, changedAt: now() };
  };

  // This store's plan writes, the stamp written to the stamp it replaced and the fields an undo compares,
  // oldest first (a Map keeps the order). A write that keeps the stamp as stored (an Add missing import sends
  // the plan unchanged) is no plan write: noting it would link the stamp to itself and lose the real link.
  const ownWrites = new Map<Instant, { replaced: Instant; wrote: OwnPlanWrite }>();
  const noteOwn = (stored: Snapshot['plan'], changes: Changes) => {
    const written = changes.plan;
    if (stored === null || written === undefined || written === null) return;
    if (written.updatedAt === stored.updatedAt) return;
    const { id, lastBuy, endedBuyingOn, updatedAt } = written;
    ownWrites.delete(updatedAt);
    ownWrites.set(updatedAt, { replaced: stored.updatedAt, wrote: { id, lastBuy, endedBuyingOn, updatedAt } });
    const oldest = ownWrites.keys().next();
    if (ownWrites.size > OWN_PLAN_WRITES && oldest.done !== true) ownWrites.delete(oldest.value);
  };

  // Several writes in another tab need one reload, not one each: a reload not yet started covers them.
  let reloadQueued = false;
  const unsubscribe = channel.subscribe((event) => {
    if (event === 'wiped') options.afterWipe?.();
    if (reloadQueued) return;
    reloadQueued = true;
    void serially(() => {
      reloadQueued = false;
      return load();
    });
  });

  return {
    store,
    hydrate: () =>
      serially(async () => {
        await load();
      }),
    write: (next) =>
      serially(async () => {
        if (store.getState().status !== 'ready') {
          const failure = await load();
          if (failure !== null) throw failure;
        }
        if (typeof next === 'function') {
          // Built on the rows as stored, in the store's transaction: a write another tab made since this
          // tab last loaded is one the change sees, never one it overwrites (ADR-0019, Readings).
          const { snapshot, changes } = await planStore.update((stored) => stamped(next(stored)));
          noteOwn(snapshot.plan, changes);
          store.setState({ snapshot: applyChanges(snapshot, changes) });
          if (toldToOtherTabs(changes)) channel.post();
          return;
        }
        const changes = stamped(next);
        await planStore.write(changes);
        // Written whole over the plan this tab shows: any write it did not see is replaced by this one.
        noteOwn(store.getState().snapshot.plan, changes);
        store.setState({ snapshot: applyChanges(store.getState().snapshot, changes) });
        if (toldToOtherTabs(changes)) channel.post();
      }),
    wipe: () =>
      serially(async () => {
        const { status, snapshot } = store.getState();
        const shown = snapshot.plan !== null || liveEntries(snapshot.entries).length > 0 || snapshot.quarantined > 0;
        if (status === 'ready' && !shown) return null;
        const rows = await planStore.wipe();
        ownWrites.clear();
        options.afterWipe?.();
        store.setState({ status: 'ready', snapshot: EMPTY_SNAPSHOT, failure: null });
        channel.post('wiped');
        return rows;
      }),
    restore: (rows) =>
      serially(async () => {
        const restored = await planStore.restore(rows);
        ownWrites.clear();
        await load();
        if (restored) channel.post();
        return restored;
      }),
    ownPlanWrites: (from, to) => {
      const writes: OwnPlanWrite[] = [];
      let at = to;
      // Each step goes one write back; a chain longer than the map holds would have lost its start already.
      for (let step = 0; step <= OWN_PLAN_WRITES; step += 1) {
        if (at === from) return writes;
        const own = ownWrites.get(at);
        if (own === undefined) return null;
        writes.push(own.wrote);
        at = own.replaced;
      }
      return null;
    },
    dispose: unsubscribe,
  };
}
