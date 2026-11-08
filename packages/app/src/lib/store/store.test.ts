import { backupNeeded, DEFAULT_PREFS, deleteEntries, type PriceSnapshot, restoreEntries } from '@proofofcalm/core';
import { anEntry, aPlan, instant } from '@proofofcalm/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../adapters/memory-store';
import type { PlanStore, PricesState } from '../ports';
import type { CrossTabChannel, TabEvent } from './channel';
import { createDomainStore, selectQuarantined } from './domain';

/** A channel whose messages the test delivers by hand. */
function handChannel() {
  let listener: ((event: TabEvent) => void) | null = null;
  const channel: CrossTabChannel & { readonly deliver: () => void; readonly listening: () => boolean } = {
    post: vi.fn(),
    subscribe(next) {
      listener = next;
      return () => {
        listener = null;
      };
    },
    close: vi.fn(),
    deliver: () => listener?.('changed'),
    listening: () => listener !== null,
  };
  return channel;
}

/** A promise the test settles by hand. */
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('domain store (ADR-0019, ADR-0020)', () => {
  it('starts loading, hydrates the snapshot and shows writes after they persist', async () => {
    const plan = aPlan();
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan });
    const domain = createDomainStore(backing);
    expect(domain.store.getState().status).toBe('loading');
    await domain.hydrate();
    expect(domain.store.getState()).toEqual({ status: 'ready', snapshot: { ...EMPTY_SNAPSHOT, plan }, failure: null });
    const entry = anEntry();
    await domain.write({ entries: [entry] });
    expect(domain.store.getState().snapshot.entries).toEqual([entry]);
    expect(backing.current().entries).toEqual([entry]);
  });

  it('reports a failed hydration and refuses a write while it lasts', async () => {
    const failing: PlanStore = {
      ...memoryPlanStore(),
      load: async () => {
        throw new Error('IndexedDB is not available');
      },
      write: async () => {
        throw new Error('quota exceeded');
      },
    };
    const domain = createDomainStore(failing);
    await domain.hydrate();
    expect(domain.store.getState()).toEqual(
      expect.objectContaining({ status: 'failed', failure: 'IndexedDB is not available' }),
    );
    await expect(domain.write({ entries: [anEntry()] })).rejects.toThrow('IndexedDB is not available');
    expect(domain.store.getState().snapshot.entries).toEqual([]);
    const odd: PlanStore = { ...failing, load: () => Promise.reject('no reason') };
    const other = createDomainStore(odd);
    await other.hydrate();
    expect(other.store.getState().failure).toBe('no reason');
  });

  it('loads before a write when hydration failed, and refuses the write while the load still fails', async () => {
    const stored = anEntry();
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [stored] });
    let loads = 0;
    const write = vi.spyOn(backing, 'write');
    const flaky: PlanStore = {
      ...backing,
      load: () => (++loads <= 2 ? Promise.reject(new Error('IndexedDB is not available')) : backing.load()),
    };
    const domain = createDomainStore(flaky);
    await domain.hydrate();
    await expect(domain.write({ entries: [anEntry()] })).rejects.toThrow('IndexedDB is not available');
    expect(write).not.toHaveBeenCalled();
    expect(domain.store.getState().status).toBe('failed');
    const entry = anEntry();
    await domain.write({ entries: [entry] });
    expect(domain.store.getState()).toEqual({ status: 'ready', snapshot: backing.current(), failure: null });
    expect(domain.store.getState().snapshot.entries).toEqual(backing.current().entries);
    expect(domain.store.getState().snapshot.entries).toHaveLength(2);
  });

  it('wipes from the failure screen and is ready afterwards', async () => {
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, entries: [anEntry()] });
    const domain = createDomainStore({ ...backing, load: () => Promise.reject(new Error('unreadable')) });
    await domain.hydrate();
    await domain.wipe();
    expect(domain.store.getState()).toEqual({ status: 'ready', snapshot: EMPTY_SNAPSHOT, failure: null });
    expect(backing.current()).toEqual(EMPTY_SNAPSHOT);
  });

  it('persists, then shows, then tells the other tabs; a failed write does neither', async () => {
    const events: string[] = [];
    const backing = memoryPlanStore();
    const channel = { ...handChannel(), post: () => events.push('post') };
    let fail = false;
    const planStore: PlanStore = {
      ...backing,
      write: async (changes) => {
        events.push('persist');
        if (fail) throw new Error('quota exceeded');
        await backing.write(changes);
      },
    };
    const domain = createDomainStore(planStore, channel);
    await domain.hydrate();
    domain.store.subscribe(() => events.push('show'));
    await domain.write({ entries: [anEntry()] });
    expect(events).toEqual(['persist', 'show', 'post']);
    fail = true;
    await expect(domain.write({ entries: [anEntry()] })).rejects.toThrow('quota exceeded');
    expect(events).toEqual(['persist', 'show', 'post', 'persist']);
  });

  it('keeps live prices, rewritten every minute by each visible tab, off the cross-tab channel', async () => {
    const channel = handChannel();
    const domain = createDomainStore(memoryPlanStore(), channel);
    await domain.hydrate();
    const live: PricesState = {
      snapshot: { at: instant('2026-10-17T08:55:00.000Z'), prices: {} as PriceSnapshot['prices'] },
      currency: 'EUR',
      fetchedAt: instant('2026-10-17T08:55:02.000Z'),
      stale: false,
      source: 'live',
    };
    await domain.write({ prices: live });
    expect(domain.store.getState().snapshot.prices).toEqual(live);
    expect(channel.post).not.toHaveBeenCalled();
    // Prices typed by hand are the user's, and the rest of the snapshot is what the other tabs show.
    await domain.write({ prices: { ...live, source: 'manual' } });
    expect(channel.post).toHaveBeenCalledTimes(1);
    await domain.write({ prices: live, prefs: DEFAULT_PREFS });
    expect(channel.post).toHaveBeenCalledTimes(2);
  });

  it('wipes everything, shows the empty snapshot and tells the other tabs', async () => {
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()], quarantined: 1 });
    const channel = handChannel();
    const domain = createDomainStore(backing, channel);
    await domain.hydrate();
    await domain.wipe();
    expect(domain.store.getState().snapshot).toEqual(EMPTY_SNAPSHOT);
    expect(backing.current()).toEqual(EMPTY_SNAPSHOT);
    expect(channel.post).toHaveBeenCalledTimes(1);
  });

  it('wipes nothing and gives null once nothing is left to delete, so a second wipe keeps the first undo', async () => {
    const before = { ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()], quarantined: 1 };
    const backing = memoryPlanStore(before);
    const channel = handChannel();
    const domain = createDomainStore(backing, channel);
    await domain.hydrate();
    const [first, second] = await Promise.all([domain.wipe(), domain.wipe()]);
    expect(second).toBeNull();
    expect(channel.post).toHaveBeenCalledTimes(1);
    if (first === null) throw new Error('the first wipe took the plan');
    expect(await domain.restore(first)).toBe(true);
    expect(backing.current()).toEqual(before);
    expect(domain.store.getState().snapshot).toEqual(before);
  });

  it('forgets what the device keeps outside the store, the form drafts, once a wipe has landed', async () => {
    const events: string[] = [];
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan() });
    let fail = true;
    const planStore: PlanStore = {
      ...backing,
      wipe: async () => {
        if (fail) throw new Error('blocked');
        events.push('wipe');
        return backing.wipe();
      },
    };
    const domain = createDomainStore(planStore, handChannel(), { afterWipe: () => events.push('forget') });
    await domain.hydrate();
    await expect(domain.wipe()).rejects.toThrow('blocked');
    expect(events).toEqual([]);
    fail = false;
    await domain.wipe();
    expect(events).toEqual(['wipe', 'forget']);
  });

  it('exposes how many stored rows were set aside', async () => {
    const domain = createDomainStore(memoryPlanStore({ ...EMPTY_SNAPSHOT, quarantined: 3 }));
    expect(selectQuarantined(domain.store.getState())).toBe(0);
    await domain.hydrate();
    expect(selectQuarantined(domain.store.getState())).toBe(3);
  });

  it('reloads once when another tab writes, however many messages arrive, until disposed', async () => {
    const backing = memoryPlanStore();
    const load = vi.spyOn(backing, 'load');
    const channel = handChannel();
    const domain = createDomainStore(backing, channel);
    await domain.hydrate();
    const entry = anEntry();
    await backing.write({ entries: [entry] }); // the other tab's write, straight into storage
    channel.deliver();
    channel.deliver();
    channel.deliver();
    await vi.waitFor(() => expect(domain.store.getState().snapshot.entries).toEqual([entry]));
    expect(load).toHaveBeenCalledTimes(2);
    expect(channel.post).not.toHaveBeenCalled();
    domain.dispose();
    expect(channel.listening()).toBe(false);
  });

  it('lets a write in progress land before a reload another tab asked for', async () => {
    const backing = memoryPlanStore();
    const persisted = deferred();
    const load = vi.spyOn(backing, 'load');
    const planStore: PlanStore = {
      ...backing,
      load: () => backing.load(),
      write: async (changes) => {
        await persisted.promise;
        await backing.write(changes);
      },
    };
    const channel = handChannel();
    const domain = createDomainStore(planStore, channel);
    await domain.hydrate();
    const entry = anEntry();
    const writing = domain.write({ entries: [entry] });
    channel.deliver();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    persisted.resolve();
    await writing;
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(domain.store.getState().snapshot.entries).toEqual([entry]);
  });

  it('runs a write given as a function on the snapshot as every earlier queued write left it', async () => {
    const backing = memoryPlanStore();
    const persisted = deferred();
    const planStore: PlanStore = {
      ...backing,
      write: async (changes) => {
        await persisted.promise;
        await backing.write(changes);
      },
    };
    const domain = createDomainStore(planStore);
    await domain.hydrate();
    const prefs = domain.store.getState().snapshot.prefs;
    const theme = domain.write({ prefs: { ...prefs, theme: 'dark' } });
    const showAll = domain.write((snapshot) => ({ prefs: { ...snapshot.prefs, logShowAll: true } }));
    persisted.resolve();
    await Promise.all([theme, showAll]);
    expect(domain.store.getState().snapshot.prefs).toEqual({ ...prefs, theme: 'dark', logShowAll: true });
    expect(backing.current().prefs).toEqual({ ...prefs, theme: 'dark', logShowAll: true });
  });

  it('stamps changedAt in the same stored write when the plan or the entries change', async () => {
    const exported = instant('2026-10-20T09:00:00.000Z');
    const now = instant('2026-10-20T10:00:00.000Z');
    const prefs = { ...DEFAULT_PREFS, lastBackupAt: exported, changedAt: exported };
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), prefs });
    const write = vi.spyOn(backing, 'write');
    const domain = createDomainStore(backing, handChannel(), { now: () => now });
    await domain.hydrate();
    const entry = anEntry();
    await domain.write({ entries: [entry] });
    expect(write).toHaveBeenCalledExactlyOnceWith({ entries: [entry], changedAt: now });
    expect(backing.current().prefs).toEqual({ ...prefs, changedAt: now });
    const state = domain.store.getState().snapshot;
    expect(state.prefs.changedAt).toBe(now);
    expect(backupNeeded(state.entries, state.prefs, false)).toBe(true);
    await domain.write((snapshot) => ({ plan: aPlan(), prefs: { ...snapshot.prefs, theme: 'dark' } }));
    expect(backing.current().prefs).toEqual({ ...prefs, theme: 'dark', changedAt: now });
  });

  it('never stamps changedAt for preferences alone or prices', async () => {
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [anEntry()] });
    const domain = createDomainStore(backing, handChannel(), { now: () => instant('2026-10-20T10:00:00.000Z') });
    await domain.hydrate();
    await domain.write((snapshot) => ({ prefs: { ...snapshot.prefs, theme: 'dark' } }));
    await domain.write({
      prices: {
        snapshot: { at: instant('2026-10-20T09:55:00.000Z'), prices: {} as PriceSnapshot['prices'] },
        currency: 'EUR',
        fetchedAt: instant('2026-10-20T09:55:02.000Z'),
        stale: false,
        source: 'manual',
      },
    });
    expect(domain.store.getState().snapshot.prefs.changedAt).toBeNull();
    expect(backing.current().prefs.changedAt).toBeNull();
  });

  it('needs a backup again after an export, then a delete, then its Undo', async () => {
    let ms = Date.UTC(2026, 9, 20, 10);
    const now = () => {
      ms += 1000;
      return instant(new Date(ms).toISOString());
    };
    const kept = anEntry();
    const deleted = anEntry({ kind: 'extra', slot: null });
    const plan = aPlan();
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan, entries: [kept, deleted] });
    const domain = createDomainStore(backing, handChannel(), { now });
    await domain.hydrate();
    const needed = () => {
      const { entries, prefs } = domain.store.getState().snapshot;
      return backupNeeded(entries, prefs, false);
    };
    expect(needed()).toBe(true);
    await domain.write((snapshot) => ({ prefs: { ...snapshot.prefs, lastBackupAt: now() } }));
    expect(needed()).toBe(false);
    const at = now();
    await domain.write((snapshot) => ({ entries: deleteEntries(snapshot.entries, [deleted.id], at) }));
    expect(needed()).toBe(true);
    await domain.write((snapshot) => ({ prefs: { ...snapshot.prefs, lastBackupAt: now() } }));
    expect(needed()).toBe(false);
    await domain.write((snapshot) => {
      const restored = restoreEntries(
        plan,
        snapshot.entries,
        [deleted.id],
        { at, ids: [deleted.id], slots: [] },
        now(),
      );
      return { entries: restored.ok ? restored.value : [] };
    });
    expect(needed()).toBe(true);
  });

  it('stamps an entries write without putting back the preferences another tab wrote since this tab loaded', async () => {
    const now = instant('2026-10-20T10:00:00.000Z');
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan() });
    const a = createDomainStore(backing, handChannel(), { now: () => now });
    const b = createDomainStore(backing, handChannel(), { now: () => now });
    await Promise.all([a.hydrate(), b.hydrate()]);
    await b.write((snapshot) => ({ prefs: { ...snapshot.prefs, theme: 'dark' } }));
    await a.write({ entries: [anEntry()] });
    expect(backing.current().prefs).toEqual({ ...DEFAULT_PREFS, theme: 'dark', changedAt: now });
  });

  it('keeps the stored changedAt when a tab that loaded before an entries write writes a preference', async () => {
    const exported = instant('2026-10-20T09:00:00.000Z');
    const now = instant('2026-10-20T10:00:00.000Z');
    const prefs = { ...DEFAULT_PREFS, lastBackupAt: exported, changedAt: exported };
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), prefs });
    const a = createDomainStore(backing, handChannel(), { now: () => now });
    const b = createDomainStore(backing, handChannel(), { now: () => now });
    await Promise.all([a.hydrate(), b.hydrate()]);
    await b.write({ entries: [anEntry()] });
    await a.write((snapshot) => ({ prefs: { ...snapshot.prefs, logShowAll: true } }));
    const stored = backing.current();
    expect(stored.prefs).toEqual({ ...prefs, logShowAll: true, changedAt: now });
    expect(backupNeeded(stored.entries, stored.prefs, false)).toBe(true);
  });

  it('never stamps an entries write that changes no entry, such as a delete another tab already made', async () => {
    const exported = instant('2026-10-20T09:00:00.000Z');
    const now = instant('2026-10-20T10:00:00.000Z');
    const gone = anEntry({ deletedAt: exported, updatedAt: exported });
    const prefs = { ...DEFAULT_PREFS, lastBackupAt: exported, changedAt: exported };
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan(), entries: [gone], prefs });
    const domain = createDomainStore(backing, handChannel(), { now: () => now });
    await domain.hydrate();
    await domain.write({ entries: [] });
    await domain.write((snapshot) => ({ entries: deleteEntries(snapshot.entries, [gone.id], now) }));
    const state = domain.store.getState().snapshot;
    expect(state.prefs.changedAt).toBe(exported);
    expect(backing.current().prefs.changedAt).toBe(exported);
    expect(backupNeeded(state.entries, state.prefs, false)).toBe(false);
  });

  it('counts no plan write for a write that keeps the plan stamp as stored, such as an Add missing import', async () => {
    const first = instant('2026-10-20T09:00:00.000Z');
    const saved = instant('2026-10-20T10:00:00.000Z');
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan: aPlan({ updatedAt: first }) });
    const domain = createDomainStore(backing);
    await domain.hydrate();
    await domain.write(({ plan }) => ({ plan: plan === null ? null : { ...plan, updatedAt: saved } }));
    const plan = backing.current().plan;
    if (plan === null) throw new Error('no plan');
    const own = [{ id: plan.id, lastBuy: plan.lastBuy, endedBuyingOn: plan.endedBuyingOn, updatedAt: saved }];
    expect(domain.ownPlanWrites(first, saved)).toEqual(own);
    // Built on the rows as stored, then written whole over the plan this tab shows: the stamp stays `saved`.
    await domain.write((snapshot) => ({ plan: snapshot.plan, entries: [anEntry()] }));
    await domain.write({ plan, entries: [anEntry()] });
    expect(backing.current().plan).toEqual(plan);
    expect(domain.ownPlanWrites(first, saved)).toEqual(own);
    expect(domain.ownPlanWrites(saved, saved)).toEqual([]);
  });
});

describe('memory plan store', () => {
  it('replaces entries by id and adds new ones in id order, keeping the rest', async () => {
    const first = anEntry();
    const second = anEntry();
    const backing = memoryPlanStore({ ...EMPTY_SNAPSHOT, entries: [second, first] });
    expect(backing.current().entries).toEqual([first, second]);
    const edited = { ...first, note: 'edited' };
    const third = anEntry();
    await backing.write({ entries: [third, edited], plan: null });
    expect(backing.current().entries).toEqual([edited, second, third]);
    expect(backing.current().plan).toBeNull();
    expect(await backing.load()).toBe(backing.current());
  });
});
