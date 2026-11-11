// @vitest-environment node
// Two tabs on one database (ADR-0019): each has its own IndexedDB connection, domain store and channel
// object, as two tabs of one browser profile would; a write in one reloads the other.
import 'fake-indexeddb/auto';
import {
  applyImport,
  type BackupFile,
  compareInstants,
  deleteEntries,
  type EntityId,
  type Entry,
  exportBackup,
  type ImportMode,
  type ImportResult,
  type Instant,
  liveEntries,
  restoreEntries,
  type SlotsAtDelete,
  saveTransaction,
  skipMonth,
  slotsAtDelete,
} from '@proofofcalm/core';
import { anEntry, aPlan, date, id, instant, money, month } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Drafts, sessionDrafts } from '../adapters/drafts';
import { idbPlanStore } from '../adapters/idb-store';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../adapters/memory-store';
import { crossTabChannel, localOnly } from './channel';
import { createDomainStore, type DomainStore, type DomainStoreOptions } from './domain';

const NOW = '2026-10-17T09:00:00.000Z' as Instant;
const cleanups: (() => Promise<void> | void)[] = [];

/** One tab's sessionStorage over a Map. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
  };
}

function tab(tabId: string, options: DomainStoreOptions = {}) {
  const planStore = idbPlanStore({ clock: { now: () => NOW } });
  const channel = crossTabChannel({ name: 'proof-of-calm-tabs-test', tabId });
  const domain = createDomainStore(planStore, channel, options);
  cleanups.push(() => {
    domain.dispose();
    channel.close();
    return planStore.close();
  });
  return { planStore, domain, state: () => domain.store.getState() };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('two tabs (ADR-0019)', () => {
  it('reloads the other tab after a write, and never the tab that wrote', async () => {
    const [a, b] = [tab('tab-a'), tab('tab-b')];
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    const loadsA = vi.spyOn(a.planStore, 'load');
    const loadsB = vi.spyOn(b.planStore, 'load');

    const plan = aPlan();
    const entry = anEntry();
    await a.domain.write({ plan, entries: [entry] });
    await vi.waitFor(() => expect(b.state().snapshot).toStrictEqual(a.state().snapshot));
    expect(b.state().snapshot.plan).toStrictEqual(plan);
    expect(loadsB).toHaveBeenCalledTimes(1);

    const deleted = { ...entry, deletedAt: NOW, updatedAt: NOW };
    await b.domain.write({ entries: [deleted] });
    await vi.waitFor(() => expect(a.state().snapshot.entries).toStrictEqual([deleted]));
    expect(loadsA).toHaveBeenCalledTimes(1);
    expect(loadsB).toHaveBeenCalledTimes(1);
  });

  it('empties the other tab after "Delete everything"', async () => {
    const [a, b] = [tab('tab-a'), tab('tab-b')];
    await a.domain.write({ plan: aPlan(), entries: [anEntry()] });
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    expect(b.state().snapshot.entries).toHaveLength(1);
    await a.domain.wipe();
    await vi.waitFor(() => expect(b.state().snapshot.plan).toBeNull());
    expect(b.state().snapshot).toStrictEqual(a.state().snapshot);
  });

  it('empties the other tab after "Delete everything", then follows its undo', async () => {
    const [a, b] = [tab('tab-a'), tab('tab-b')];
    await a.domain.write({ plan: aPlan(), entries: [anEntry()] });
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    const before = a.state().snapshot;
    const wiped = await a.domain.wipe();
    if (wiped === null) throw new Error('a plan was stored');
    await vi.waitFor(() => expect(b.state().snapshot.plan).toBeNull());
    expect(await a.domain.restore(wiped)).toBe(true);
    expect(a.state().snapshot).toStrictEqual(before);
    await vi.waitFor(() => expect(b.state().snapshot).toStrictEqual(before));
  });

  it('refuses the undo in the tab that deleted once another tab has started a plan, and shows that plan', async () => {
    const [a, b] = [tab('tab-a'), tab('tab-b')];
    await a.domain.write({ plan: aPlan(), entries: [anEntry()] });
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    const wiped = await a.domain.wipe();
    if (wiped === null) throw new Error('a plan was stored');
    const started = aPlan();
    await b.domain.write({ plan: started });
    expect(await a.domain.restore(wiped)).toBe(false);
    await vi.waitFor(() => expect(a.state().snapshot.plan).toStrictEqual(started));
    expect(a.state().snapshot.entries).toStrictEqual([]);
  });

  it('clears every open tab\'s form drafts on "Delete everything", not only the tab that deleted', async () => {
    // Each tab has its own sessionStorage, as a browser gives it.
    const [storageA, storageB] = [memoryStorage(), memoryStorage()];
    const [draftsA, draftsB] = [sessionDrafts(() => storageA), sessionDrafts(() => storageB)];
    const a = tab('tab-a', { afterWipe: () => draftsA.clearAll() });
    const b = tab('tab-b', { afterWipe: () => draftsB.clearAll() });
    await a.domain.write({ plan: aPlan() });
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    draftsA.write('entry', 'new', { amount: '100' });
    draftsB.write('entry', 'new', { amount: '250' });
    const anything = { safeParse: (data: unknown) => ({ success: true as const, data }) };
    const read = (drafts: Drafts) => drafts.read('entry', 'new', anything);
    expect(read(draftsB)).toStrictEqual({ amount: '250' });
    await a.domain.wipe();
    expect(read(draftsA)).toBeNull();
    await vi.waitFor(() => expect(read(draftsB)).toBeNull());
  });

  it('shows what is stored after a function write on a clock behind the stored stamps (ADR-0019, Readings)', async () => {
    const AHEAD = '2026-10-17T09:05:00.000Z' as Instant;
    const aheadStore = idbPlanStore({ clock: { now: () => AHEAD } });
    cleanups.push(() => aheadStore.close());
    const ahead = createDomainStore(aheadStore, localOnly, { now: () => AHEAD });
    const entry = anEntry({ kind: 'extra', slot: null, updatedAt: AHEAD, createdAt: AHEAD });
    await ahead.write({ plan: aPlan({ updatedAt: AHEAD }), entries: [entry] });
    const behind = tab('tab-b');
    await behind.domain.hydrate();
    // A skip and a delete on the rows as stored, five minutes behind the tab that wrote them.
    await behind.domain.write(({ plan, entries }) => {
      if (plan === null) return {};
      const skipped = skipMonth(plan, entries, { slot: month('2026-06'), note: '', id: id(), now: NOW });
      const before = slotsAtDelete(plan, entries, [entry.id], NOW);
      return { plan: skipped.ok ? skipped.value : plan, entries: deleteEntries(entries, before.ids, before.at) };
    });
    const shown = behind.state().snapshot;
    expect(shown.plan?.skips).toHaveLength(1);
    expect(shown).toStrictEqual(await behind.planStore.load());
    expect(shown).toStrictEqual(await tab('tab-c').planStore.load());
    expect(compareInstants(shown.plan?.updatedAt ?? NOW, AHEAD)).toBe(1);
    expect(compareInstants(shown.entries[0]?.updatedAt ?? NOW, AHEAD)).toBe(1);
  });
});

// Two tabs on one memory store with the cross-tab channel, the log's delete and undo and Settings' import
// as their actions write them (features/log/actions.ts, features/settings/actions.ts), so that the
// tests stay in lib. A message on the channel arrives as a task, so a write a tab starts right after
// another tab's runs before its reload: on a stale snapshot, which the write must not build on.
describe('two tabs: a write builds on the rows as stored (ADR-0019, Readings)', () => {
  const T0 = instant('2026-10-17T09:00:00.000Z');
  let clock = T0;
  const at = (iso: string) => {
    clock = instant(iso);
    return clock;
  };
  type Shared = ReturnType<typeof memoryPlanStore>;

  function memoryTab(shared: Shared, tabId: string) {
    const channel = crossTabChannel({ name: 'proof-of-calm-tabs-memory-test', tabId });
    const domain = createDomainStore(shared, channel, { now: () => clock });
    cleanups.push(() => {
      domain.dispose();
      channel.close();
    });
    const live = (entryId: EntityId) =>
      domain.store.getState().snapshot.entries.find((each) => each.id === entryId)?.deletedAt === null;
    return { domain, live };
  }

  async function remove(domain: DomainStore, ids: readonly EntityId[]): Promise<SlotsAtDelete> {
    const box: { before?: SlotsAtDelete } = {};
    await domain.write(({ plan, entries }) => {
      const before = slotsAtDelete(plan, entries, ids, clock);
      box.before = before;
      return { entries: deleteEntries(entries, before.ids, before.at) };
    });
    if (box.before === undefined) throw new Error('the delete did not run');
    return box.before;
  }

  async function undo(domain: DomainStore, ids: readonly EntityId[], before: SlotsAtDelete) {
    const box: { result?: ReturnType<typeof restoreEntries> } = {};
    await domain.write(({ plan, entries }) => {
      if (plan === null) return {};
      const restored = restoreEntries(plan, entries, ids, before, clock);
      box.result = restored;
      return restored.ok ? { entries: restored.value } : {};
    });
    if (box.result === undefined) throw new Error('the undo did not run');
    return box.result;
  }

  async function importFile(domain: DomainStore, file: BackupFile, mode: ImportMode): Promise<ImportResult> {
    const box: { outcome?: ImportResult } = {};
    await domain.write((snapshot) => {
      const result = applyImport(snapshot, file, mode, clock);
      box.outcome = result;
      if (snapshot.plan !== null && mode === 'add-missing' && result.added === 0) return {};
      return { plan: result.plan, entries: result.entries };
    });
    if (box.outcome === undefined) throw new Error('the import did not run');
    return box.outcome;
  }

  const extra = (note: string) => anEntry({ kind: 'extra', slot: null, note, updatedAt: T0, createdAt: T0 });
  const stored = (shared: Shared, entryId: EntityId) => shared.current().entries.find((each) => each.id === entryId);

  function world(entries: readonly Entry[]) {
    clock = T0;
    const plan = aPlan({ updatedAt: T0 });
    const shared = memoryPlanStore({ ...EMPTY_SNAPSHOT, plan, entries });
    return { plan, shared, a: memoryTab(shared, 'tab-a'), b: memoryTab(shared, 'tab-b') };
  }

  it('a delete on a stale snapshot deletes only what is still live, and its undo restores only that (#128)', async () => {
    const [first, second] = [extra('first'), extra('second')];
    const { shared, a, b } = world([first, second]);
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    at('2026-10-17T09:01:00.000Z');
    const deletedByA = await remove(a.domain, [first.id]);
    // Tab b has not reloaded yet: it still shows both and deletes both.
    expect(b.live(first.id)).toBe(true);
    at('2026-10-17T09:02:00.000Z');
    const deletedByB = await remove(b.domain, [first.id, second.id]);
    expect(deletedByB.ids).toStrictEqual([second.id]);
    expect(stored(shared, first.id)).toMatchObject({ deletedAt: deletedByA.at, updatedAt: deletedByA.at });
    at('2026-10-17T09:03:00.000Z');
    const undoneByB = await undo(b.domain, [first.id, second.id], deletedByB);
    expect(undoneByB.ok && undoneByB.value.map((each) => each.id)).toStrictEqual([second.id]);
    expect(stored(shared, first.id)?.deletedAt).toBe(deletedByA.at);
    // Tab a's delete is still its own to undo.
    const undoneByA = await undo(a.domain, [first.id], deletedByA);
    expect(undoneByA.ok && undoneByA.value.map((each) => each.id)).toStrictEqual([first.id]);
    expect(liveEntries(shared.current().entries)).toHaveLength(2);
  });

  it("an import that adds missing entries on a stale snapshot keeps the other tab's delete and skip (#129)", async () => {
    const [kept, missing] = [extra('kept'), extra('missing')];
    const { plan, shared, a, b } = world([kept]);
    const file = exportBackup(plan, [kept, missing], T0);
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    at('2026-10-17T09:01:00.000Z');
    const deletedByA = await remove(a.domain, [kept.id]);
    const skipped = skipMonth(plan, [], { slot: month('2026-06'), note: '', id: id(), now: clock });
    if (!skipped.ok) throw new Error(skipped.error.code);
    await a.domain.write({ plan: skipped.value });
    expect(b.live(kept.id)).toBe(true);
    const result = await importFile(b.domain, file, 'add-missing');
    expect(result).toMatchObject({ added: 1, skipped: 0, deleted: 1 });
    expect(stored(shared, kept.id)?.deletedAt).toBe(deletedByA.at);
    expect(shared.current().plan?.skips).toStrictEqual(skipped.value.skips);
    const undone = await undo(a.domain, [kept.id], deletedByA);
    expect(undone.ok && undone.value.map((each) => each.id)).toStrictEqual([kept.id]);
  });

  it("a replace in the same millisecond as another tab's delete makes that delete's undo refuse (#130)", async () => {
    const [gone, incoming] = [extra('gone'), extra('incoming')];
    const { plan, shared, a, b } = world([gone]);
    const file = exportBackup(plan, [incoming], T0);
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    at('2026-10-17T09:01:00.000Z');
    const deletedByA = await remove(a.domain, [gone.id]);
    expect(b.live(gone.id)).toBe(true);
    // The same clock reading: the replace rewrites the tombstone it keeps one millisecond later.
    await importFile(b.domain, file, 'replace');
    expect(compareInstants(stored(shared, gone.id)?.updatedAt ?? T0, deletedByA.at)).toBe(1);
    const undone = await undo(a.domain, [gone.id], deletedByA);
    expect(undone).toStrictEqual({ ok: false, error: { code: 'changed-since-delete' } });
    expect(stored(shared, gone.id)?.deletedAt).toBe(deletedByA.at);
  });

  it("the undo of a sale's delete refuses when another tab sold the same units since (#136)", async () => {
    const bought = extra('bought');
    const sold = { ...extra('sold'), kind: 'sell' as const };
    const { shared, a, b } = world([bought, sold]);
    await Promise.all([a.domain.hydrate(), b.domain.hydrate()]);
    at('2026-10-17T09:01:00.000Z');
    const deletedByA = await remove(a.domain, [sold.id]);
    at('2026-10-17T09:02:00.000Z');
    const rows = [{ coin: sold.coin, amount: money('100'), units: sold.units }];
    const sale = {
      kind: 'sell',
      date: date('2026-03-01'),
      slot: null,
      fee: null,
      note: '',
      venue: null,
      rows,
    } as const;
    await b.domain.write(({ plan, entries }) => {
      if (plan === null) return {};
      const saved = saveTransaction(sale, { plan, entries, editing: [], ids: [id()], now: clock, source: 'manual' });
      if (!saved.ok) throw new Error(saved.error.code);
      return { entries: saved.value };
    });
    const undone = await undo(a.domain, [sold.id], deletedByA);
    expect(undone).toStrictEqual({
      ok: false,
      // The restored sale takes the units first, so the one tab B recorded on 1 March is the sale left short.
      error: {
        code: 'sell-exceeds-held',
        coin: sold.coin,
        held: '0',
        sold: sold.units,
        date: '2026-03-01',
        written: false,
      },
    });
    expect(stored(shared, sold.id)?.deletedAt).toBe(deletedByA.at);
  });
});
