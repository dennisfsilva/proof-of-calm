import 'fake-indexeddb/auto';
import { type EntityId, type Entry, type Instant, MAX_ENTRIES } from '@proofofcalm/core';
import { anEntry, aPlan } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdbPlanStore, idbPlanStore } from '../adapters/idb-store';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../adapters/memory-store';
import { localOnly } from './channel';
import { createDomainStore, selectNewer } from './domain';

// The rows a newer build wrote (ADR-0019 readings, "Row shape"): the adapter counts them, and the store
// hands the count to the shell's newer-version screen.

describe('selectNewer', () => {
  it('gives the counts of rows from a newer version, none before hydration, and keeps them through a write', async () => {
    const newer = { plans: 1, entries: 2 };
    const domain = createDomainStore(memoryPlanStore({ ...EMPTY_SNAPSHOT, entries: [anEntry()], newer }));
    expect(selectNewer(domain.store.getState())).toStrictEqual({ plans: 0, entries: 0 });
    await domain.hydrate();
    expect(selectNewer(domain.store.getState())).toStrictEqual(newer);
    await domain.write({ entries: [anEntry()] });
    expect(selectNewer(domain.store.getState())).toStrictEqual(newer);
  });
});

// A preference alone (Show all, the chart's range) is written on the stored prefs row, never on a fresh read
// of every entry: a new entries array would recompute every view keyed on it, at 10,000 entries the Log's
// rows (ADR-0019 Readings, 2026-11-25).
describe('writePrefs', () => {
  const NOW = '2026-10-17T09:00:00.000Z' as Instant;
  let store: IdbPlanStore;
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    store = idbPlanStore({ clock: { now: () => NOW } });
  });
  afterEach(() => store.close());

  const atTheCap = (): Entry[] => {
    const first = anEntry();
    return Array.from({ length: MAX_ENTRIES }, (_, index) => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as EntityId,
    }));
  };

  it('keeps the entries and the plan by identity over 10,000 stored entries, and stamps nothing', async () => {
    await store.write({ plan: aPlan(), entries: atTheCap() });
    const post = vi.fn();
    const domain = createDomainStore(store, { ...localOnly, post }, { now: () => NOW });
    await domain.hydrate();
    const before = domain.store.getState().snapshot;
    await domain.writePrefs((prefs) => ({ ...prefs, logShowAll: true }));
    const after = domain.store.getState().snapshot;
    expect(after.entries).toBe(before.entries);
    expect(after.plan).toBe(before.plan);
    expect(after.prefs).toStrictEqual({ ...before.prefs, logShowAll: true });
    expect((await store.load()).prefs).toStrictEqual(after.prefs);
    expect(post).toHaveBeenCalledTimes(1);
    domain.dispose();
  });

  it('builds on a preference written earlier in the same queue, still on its way to storage', async () => {
    const domain = createDomainStore(store);
    await domain.hydrate();
    const theme = domain.write({ prefs: { ...domain.store.getState().snapshot.prefs, theme: 'dark' } });
    const showAll = domain.writePrefs((prefs) => ({ ...prefs, logShowAll: true }));
    await Promise.all([theme, showAll]);
    expect(domain.store.getState().snapshot.prefs).toMatchObject({ theme: 'dark', logShowAll: true });
    expect((await store.load()).prefs).toMatchObject({ theme: 'dark', logShowAll: true });
    domain.dispose();
  });

  it('leaves the snapshot as it was and tells no other tab when the write fails', async () => {
    const memory = memoryPlanStore();
    const failing = { ...memory, write: () => Promise.reject(new Error('QuotaExceededError')) };
    const post = vi.fn();
    const domain = createDomainStore(failing, { ...localOnly, post });
    await domain.hydrate();
    const before = domain.store.getState().snapshot;
    await expect(domain.writePrefs((prefs) => ({ ...prefs, logShowAll: true }))).rejects.toThrow('QuotaExceededError');
    expect(domain.store.getState().snapshot).toBe(before);
    expect(post).not.toHaveBeenCalled();
    domain.dispose();
  });
});
