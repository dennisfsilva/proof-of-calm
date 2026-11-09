// @vitest-environment node
// The IndexedDB adapter of ADR-0019 against fake-indexeddb: a fresh IDBFactory per test is a fresh browser
// profile. Raw reads and writes go through idb directly, as a corrupted or older database would look.
import 'fake-indexeddb/auto';
import {
  acknowledge,
  acknowledgementDue,
  backupNeeded,
  type CoinId,
  compareWrites,
  DEFAULT_PREFS,
  type EntityId,
  type Entry,
  type Instant,
  importPrototype,
  type Money,
  type Percent,
  type Plan,
  type Price,
  type PriceHistory,
  type PriceSnapshot,
} from '@proofofcalm/core';
import { anEntry, aPlan, asV2Plan, date, instant, PreviousBuildPlanSchema, split } from '@proofofcalm/core/testing';
import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import twoCoins from '../../../../core/test/golden/two-coins.json';
import type { CachedHistory, PricesState } from '../ports';
import { localOnly } from '../store/channel';
import { createDomainStore } from '../store/domain';
import { DATABASE_NAME, STORE_NAMES, type StoreName } from './idb/database';
import { ROW_SCHEMA_VERSIONS } from './idb/rows';
import { type IdbPlanStore, type IdbPlanStoreOptions, idbPlanStore } from './idb-store';
import { EMPTY_SNAPSHOT } from './memory-store';

const NOW = instant('2026-10-17T09:00:00.000Z');
const DEVICE = '0f5c1a3e-8d2b-4c6f-9a7e-1b2c3d4e5f60' as EntityId;
const clock = { now: () => NOW };
const prices: PricesState = {
  snapshot: {
    at: instant('2026-10-17T08:55:00.000Z'),
    prices: { BTC: { EUR: '60000.12' as Price, USD: '70000' as Price } } as PriceSnapshot['prices'],
    change24h: { BTC: '-1.25' as Percent } as PriceSnapshot['change24h'] & object,
  },
  currency: 'EUR',
  fetchedAt: instant('2026-10-17T08:55:02.000Z'),
  stale: false,
  source: 'live',
};
const prefs = { ...DEFAULT_PREFS, theme: 'dark' as const, dismissedBanners: ['backup-needed:2026-10-01'] };

/**
 * The row versions the previous build read and wrote, the build before the entries' v4 rise (rows.ts). A store
 * opened with them writes what that build wrote: no entry row above its own `entries` (`entryRow`).
 */
const PREVIOUS_BUILD = { plans: 3, entries: 3 } as const;
/** The row versions of the build before coins held: plans at v3, entries at v2 (rows.ts). */
const ENTRIES_V2_BUILD = { plans: 3, entries: 2 } as const;
/** The row versions of the build before the risk acknowledgement: plans and entries at v2 (rows.ts). */
const PLANS_V2_BUILD = { plans: 2, entries: 2 } as const;

type PlanStamp = { id: EntityId; updatedAt: Instant; deletedAt: Instant | null; deviceId: EntityId };

const opened: IdbPlanStore[] = [];
function open(options: Partial<IdbPlanStoreOptions> = {}): IdbPlanStore {
  const store = idbPlanStore({ clock, randomUUID: () => DEVICE, ...options });
  opened.push(store);
  return store;
}

async function raw(store: StoreName): Promise<unknown[]> {
  const db = await openDB(DATABASE_NAME);
  try {
    return await db.getAll(store);
  } finally {
    db.close();
  }
}

/** Every store's keys and values as stored, to compare a database before and after. */
async function dump(): Promise<Record<string, { keys: unknown[]; values: unknown[] }>> {
  const db = await openDB(DATABASE_NAME);
  try {
    const stores: Record<string, { keys: unknown[]; values: unknown[] }> = {};
    for (const name of STORE_NAMES) stores[name] = { keys: await db.getAllKeys(name), values: await db.getAll(name) };
    return stores;
  } finally {
    db.close();
  }
}

async function put(store: StoreName, value: unknown, key?: string): Promise<void> {
  const db = await openDB(DATABASE_NAME);
  try {
    await db.put(store, value, key);
  } finally {
    db.close();
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((store) => store.close()));
});

describe('idb plan store: load and write (ADR-0019)', () => {
  it('loads an empty snapshot from a new database', async () => {
    expect(await open().load()).toEqual(EMPTY_SNAPSHOT);
  });

  it('keeps a full snapshot across a write, a load and a reopen', async () => {
    const plan = aPlan();
    const entries = [anEntry(), anEntry({ deletedAt: NOW, updatedAt: NOW }), anEntry({ kind: 'extra', slot: null })];
    const store = open();
    await store.write({ plan, entries, prefs, prices });
    const expected = { ...EMPTY_SNAPSHOT, plan, entries, prefs, prices };
    expect(await store.load()).toStrictEqual(expected);
    await store.close();
    expect(await open().load()).toStrictEqual(expected);
  });

  it('writes nothing for an empty change', async () => {
    const store = open();
    await store.load();
    await store.write({});
    await store.write({ entries: [] });
    expect(await raw('meta')).toEqual([]);
  });

  it('stamps changedAt on the stored prefs row alone, keeping the preferences another tab wrote', async () => {
    const store = open();
    await store.write({ prefs });
    await open().write({ prefs: { ...prefs, theme: 'light' } });
    const entry = anEntry();
    await store.write({ entries: [entry], changedAt: NOW });
    expect(await store.load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      entries: [entry],
      prefs: { ...prefs, theme: 'light', changedAt: NOW },
    });
  });

  it('keeps the stored changedAt when a tab that loaded before an entries write writes a preference', async () => {
    const exported = instant('2026-10-17T08:00:00.000Z');
    const backedUp = { ...prefs, lastBackupAt: exported };
    const store = open();
    await store.write({ plan: aPlan(), prefs: backedUp, changedAt: exported });
    const a = createDomainStore(store, localOnly, { now: () => NOW });
    const b = createDomainStore(store, localOnly, { now: () => NOW });
    await Promise.all([a.hydrate(), b.hydrate()]);
    await b.write({ entries: [anEntry()] });
    await a.write((snapshot) => ({ prefs: { ...snapshot.prefs, logShowAll: true } }));
    const loaded = await store.load();
    expect(loaded.prefs).toStrictEqual({ ...backedUp, logShowAll: true, changedAt: NOW });
    expect(backupNeeded(loaded.entries, loaded.prefs, false)).toBe(true);
  });

  it('writes a preference over a stored changedAt that does not read as the default, not as the change', async () => {
    await open().load(); // creates the database
    await put('prefs', { ...prefs, changedAt: 'yesterday' }, 'device');
    await open().write({ prefs: { ...prefs, logShowAll: true, changedAt: NOW } });
    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, prefs: { ...prefs, logShowAll: true } });
  });

  it('stamps changedAt on the default preferences when no prefs row is stored yet', async () => {
    const store = open();
    await store.write({ plan: aPlan(), changedAt: NOW });
    const loaded = await store.load();
    expect(loaded.prefs).toStrictEqual({ ...DEFAULT_PREFS, changedAt: NOW });
    expect(loaded.quarantined).toBe(0);
  });

  it('replaces entries by id and keeps soft-deleted ones as tombstones', async () => {
    const store = open();
    const [first, second] = [anEntry(), anEntry()];
    await store.write({ entries: [second, first] });
    const edited = { ...first, note: 'edited', updatedAt: NOW };
    const deleted = { ...second, deletedAt: NOW, updatedAt: NOW };
    await store.write({ entries: [deleted, edited] });
    expect((await store.load()).entries).toStrictEqual([edited, deleted]);
    expect(await raw('entries')).toEqual([
      expect.objectContaining({ id: first.id, payload: edited, deletedAt: null }),
      expect.objectContaining({ id: second.id, payload: deleted, deletedAt: NOW, updatedAt: NOW }),
    ]);
  });

  it('writes rows in the sync shape, stamped with the device and the live plan', async () => {
    const store = open();
    const early = anEntry();
    await store.write({ entries: [early] });
    const plan = aPlan();
    const entry = anEntry();
    await store.write({ plan, entries: [entry] });
    // A plan with nothing recorded is written at v2, the lowest version that holds it (docs/DOMAIN.md §2.1).
    expect(await raw('plans')).toStrictEqual([
      {
        id: plan.id,
        payload: asV2Plan(plan),
        updatedAt: plan.updatedAt,
        deletedAt: null,
        deviceId: DEVICE,
        schemaVersion: 2,
        encVersion: 0,
      },
    ]);
    expect(await raw('entries')).toStrictEqual([
      {
        id: early.id,
        payload: early,
        updatedAt: early.updatedAt,
        deletedAt: null,
        deviceId: DEVICE,
        schemaVersion: 2,
        encVersion: 0,
        planId: null,
      },
      {
        id: entry.id,
        payload: entry,
        updatedAt: entry.updatedAt,
        deletedAt: null,
        deviceId: DEVICE,
        schemaVersion: 2,
        encVersion: 0,
        planId: plan.id,
      },
    ]);
    const db = await openDB(DATABASE_NAME);
    expect(await db.getAllKeysFromIndex('entries', 'planId', plan.id)).toEqual([entry.id]);
    db.close();
  });

  it('keeps one live plan: another plan tombstones the old one, null removes it', async () => {
    const store = open();
    const [first, second] = [aPlan(), aPlan()];
    await store.write({ plan: first });
    await store.write({ plan: second, entries: [anEntry()] });
    expect((await store.load()).plan).toStrictEqual(second);
    expect(await raw('plans')).toEqual([
      expect.objectContaining({ id: first.id, payload: asV2Plan(first), deletedAt: NOW, updatedAt: NOW }),
      expect.objectContaining({ id: second.id, payload: asV2Plan(second), deletedAt: null }),
    ]);
    const entry = anEntry();
    await store.write({ entries: [entry] });
    expect(await raw('entries')).toContainEqual(expect.objectContaining({ id: entry.id, planId: second.id }));
    await store.write({ plan: null });
    expect((await store.load()).plan).toBeNull();
    expect(await raw('plans')).toEqual([
      expect.objectContaining({ id: first.id, deletedAt: NOW }),
      expect.objectContaining({ id: second.id, deletedAt: NOW }),
    ]);
  });

  it('keeps one outbox record per synced row however often it is written', async () => {
    const store = open();
    const plan = aPlan();
    const entry = anEntry();
    for (const note of ['one', 'two', 'three']) {
      await store.write({ plan: { ...plan, why: note }, entries: [{ ...entry, note }] });
    }
    await store.write({ prefs, prices });
    const outbox = await raw('outbox');
    expect(outbox).toHaveLength(2);
    const [entryRow] = await raw('entries');
    const [planRow] = await raw('plans');
    // The outbox holds the synced row only: the entry row's planId is a local index (ADR-0019 readings).
    const { planId: _local, ...syncedEntry } = entryRow as Record<string, unknown>;
    expect(outbox).toStrictEqual([
      { store: 'entries', ...syncedEntry },
      { store: 'plans', ...(planRow as object) },
    ]);
    expect(entryRow).toEqual(expect.objectContaining({ payload: { ...entry, note: 'three' } }));
  });

  it('stamps a plan written again over its own tombstone after the tombstone, in its row and the outbox', async () => {
    let now = NOW;
    const store = open({ clock: { now: () => now } });
    const [first, second] = [aPlan({ updatedAt: instant('2026-10-01T08:00:00.000Z') }), aPlan()];
    await store.write({ plan: first });
    await store.write({ plan: second });
    const tombstone = (await raw('plans')).find((row) => (row as { id: string }).id === first.id) as {
      updatedAt: Instant;
      deviceId: EntityId;
    };
    now = instant('2026-10-17T09:00:05.000Z');
    await store.write({ plan: first }); // an undo, or a switch back to the earlier plan
    expect((await store.load()).plan).toStrictEqual(first);
    const row = (rows: unknown[]) =>
      rows.find((candidate) => (candidate as { id: string }).id === first.id) as {
        updatedAt: Instant;
        deviceId: EntityId;
        deletedAt: Instant | null;
        payload: unknown;
      };
    const [planRow, outboxRow] = [row(await raw('plans')), row(await raw('outbox'))];
    for (const revived of [planRow, outboxRow]) {
      expect(revived.deletedAt).toBeNull();
      expect(revived.payload).toStrictEqual(asV2Plan(first));
      expect(compareWrites(revived, tombstone)).toBe(1);
    }
  });

  it("keeps the entity's own stamp when it is already after the tombstone", async () => {
    const store = open();
    const first = aPlan({ updatedAt: instant('2026-10-01T08:00:00.000Z') });
    await store.write({ plan: first });
    await store.write({ plan: aPlan() });
    const edited = { ...first, why: 'back to the first plan', updatedAt: instant('2026-10-17T09:30:00.000Z') };
    await store.write({ plan: edited });
    expect(await raw('plans')).toContainEqual(
      expect.objectContaining({ id: first.id, updatedAt: edited.updatedAt, deletedAt: null }),
    );
  });

  it('stamps a tombstone after the live row when the row was stamped after the clock', async () => {
    // A stamp from a device whose clock runs ahead, or this clock went back: the replace must still win.
    for (const next of [aPlan(), null]) {
      globalThis.indexedDB = new IDBFactory();
      const store = open();
      const ahead = aPlan({ updatedAt: instant('2026-10-17T09:10:00.000Z') });
      await store.write({ plan: ahead });
      const [live] = (await raw('plans')) as [PlanStamp];
      await store.write({ plan: next });
      const tombstone = ((await raw('plans')) as PlanStamp[]).find((row) => row.id === ahead.id) as PlanStamp;
      expect(tombstone.deletedAt).toBe(tombstone.updatedAt);
      expect(compareWrites(tombstone, live)).toBe(1);
      expect((await store.load()).plan).toStrictEqual(next);
      await store.close();
    }
  });

  it('refuses rows their schema rejects and stores none of the change', async () => {
    const store = open();
    const broken = aPlan({ split: split({ BTC: '70', ETH: '20' }) });
    await expect(store.write({ plan: broken, entries: [anEntry()] })).rejects.toThrow(/invalid plan: split: split-sum/);
    await expect(store.write({ entries: [anEntry({ units: '0.5e-3' as never })] })).rejects.toThrow(TypeError);
    expect(await store.load()).toEqual(EMPTY_SNAPSHOT);
  });
});

describe('idb plan store: update, a write on the rows as stored (ADR-0019 readings)', () => {
  it('reads and writes in one transaction, on what another tab stored, and gives back what it read and wrote', async () => {
    const store = open();
    const entry = anEntry();
    await store.write({ plan: aPlan(), entries: [entry] });
    // Another tab, with its own connection, rewrites the entry after this tab last read it.
    const edited = { ...entry, note: 'from the other tab' };
    await open().write({ entries: [edited] });
    const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const deleted = { ...edited, deletedAt: NOW, updatedAt: NOW };
    const result = await store.update((stored) => ({
      entries: stored.entries.map((each) => ({ ...each, deletedAt: NOW, updatedAt: NOW })),
    }));
    expect(transactions).toHaveBeenCalledTimes(1);
    transactions.mockRestore();
    expect(result.snapshot.entries).toStrictEqual([edited]);
    expect(result.changes).toStrictEqual({ entries: [deleted] });
    expect((await store.load()).entries).toStrictEqual([deleted]);
  });

  it('writes nothing when the build throws, not even the rows its read would set aside', async () => {
    const store = open();
    const entry = anEntry();
    await store.write({ plan: aPlan(), entries: [entry] });
    const [row] = (await raw('entries')) as Record<string, unknown>[];
    await put('entries', { ...row, id: 'broken', payload: { ...entry, id: 'broken' } });
    const before = await Promise.all((['plans', 'entries', 'outbox', 'meta'] as const).map(raw));
    const refused = new Error('refused in the build');
    await expect(
      store.update(() => {
        throw refused;
      }),
    ).rejects.toBe(refused);
    expect(await Promise.all((['plans', 'entries', 'outbox', 'meta'] as const).map(raw))).toStrictEqual(before);
    // The next operation opens a transaction of its own as usual.
    expect((await store.load()).quarantined).toBe(1);
  });

  it('refuses a build that is not synchronous, which would let the transaction commit before its write', async () => {
    const store = open();
    await store.write({ plan: aPlan() });
    // @ts-expect-error the port's type forbids a Promise: one await inside the build commits the transaction early
    await expect(store.update(async () => ({ entries: [anEntry()] }))).rejects.toThrow(TypeError);
    expect((await store.load()).entries).toStrictEqual([]);
  });

  /**
   * Every request succeeds and then the commit fails, as a full disk (a QuotaExceededError at commit) or
   * a connection another tab's version change closes would: `complete` never fires, `abort` does.
   */
  function failCommits() {
    const transaction = IDBDatabase.prototype.transaction as (...args: unknown[]) => IDBTransaction;
    const quota = new DOMException('The quota is exceeded', 'QuotaExceededError');
    const failing = function (this: IDBDatabase, ...args: unknown[]) {
      const tx = transaction.apply(this, args);
      const listen = tx.addEventListener.bind(tx);
      let failed = false;
      let own: DOMException | null = null;
      Object.defineProperty(tx, 'error', {
        get: () => (failed ? quota : own),
        set: (error: DOMException | null) => {
          own = error;
        },
      });
      tx.addEventListener = (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'complete') return;
        listen(type, listener);
        if (type !== 'abort' || typeof listener !== 'function') return;
        listen('complete', (event) => {
          failed = true;
          listener(event);
        });
      };
      return tx;
    };
    return vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(failing as IDBDatabase['transaction']);
  }

  it('rejects when the commit fails after every request succeeded, as write does', async () => {
    const store = open();
    await store.write({ plan: aPlan() });
    const commits = failCommits();
    await expect(store.write({ entries: [anEntry()] })).rejects.toMatchObject({ name: 'QuotaExceededError' });
    await expect(store.update(() => ({ entries: [anEntry()] }))).rejects.toMatchObject({ name: 'QuotaExceededError' });
    commits.mockRestore();
  });

  it('leaves the domain store as it was and tells no other tab when the commit fails', async () => {
    const store = open();
    await store.write({ plan: aPlan() });
    const post = vi.fn();
    const domain = createDomainStore(store, { ...localOnly, post }, { now: () => NOW });
    await domain.hydrate();
    const before = domain.store.getState().snapshot;
    const commits = failCommits();
    await expect(domain.write(() => ({ entries: [anEntry()] }))).rejects.toMatchObject({ name: 'QuotaExceededError' });
    await expect(domain.write({ entries: [anEntry()] })).rejects.toMatchObject({ name: 'QuotaExceededError' });
    commits.mockRestore();
    expect(domain.store.getState().snapshot).toBe(before);
    expect(post).not.toHaveBeenCalled();
    domain.dispose();
  });
});

describe('idb plan store: quarantine (ADR-0019)', () => {
  it('sets corrupt rows aside with what was wrong, and loads the rest', async () => {
    const store = open();
    const plan = aPlan();
    const [kept, floating, missing] = [anEntry(), anEntry(), anEntry()];
    await store.write({ plan, entries: [kept, floating, missing], prefs });
    const [planRow] = (await raw('plans')) as Record<string, unknown>[];
    const rows = (await raw('entries')) as Record<string, unknown>[];
    const row = (id: EntityId) => rows.find((candidate) => candidate.id === id) as Record<string, unknown>;
    const badPlan = { ...planRow, payload: { ...plan, split: split({ BTC: '70', ETH: '20' }) } };
    const badAmount = { ...row(floating.id), payload: { ...floating, amount: 70.5 } };
    const { payload: _payload, ...noPayload } = row(missing.id);
    await put('plans', badPlan);
    await put('entries', badAmount);
    await put('entries', noPayload);

    const snapshot = await open().load();
    expect(snapshot).toStrictEqual({ ...EMPTY_SNAPSHOT, entries: [kept], prefs, quarantined: 3 });
    const [corrupt] = (await raw('meta')).filter(Array.isArray) as Record<string, unknown>[][];
    expect(corrupt).toEqual([
      { store: 'plans', id: plan.id, raw: badPlan, issues: ['payload.split: split-sum'], at: NOW },
      expect.objectContaining({
        store: 'entries',
        id: floating.id,
        raw: badAmount,
        issues: ['payload.amount: invalid_type'],
      }),
      expect.objectContaining({ store: 'entries', id: missing.id, raw: noPayload, issues: ['payload: invalid_type'] }),
    ]);
    expect(await raw('plans')).toEqual([]);
    expect((await raw('entries')).map((entry) => (entry as { id: string }).id)).toEqual([kept.id]);
    // Set aside once: the next load counts the same rows and adds none.
    expect((await open().load()).quarantined).toBe(3);
  });

  it('deletes an unreadable price record instead of setting it aside: it may hold CoinGecko data', async () => {
    await open().load(); // creates the database
    await put('prices', { snapshot: prices.snapshot }, 'latest');
    expect(await open().load()).toEqual(EMPTY_SNAPSHOT);
    expect(await raw('prices')).toEqual([]);
    expect(await raw('meta')).toEqual([]);
  });

  it('reads preferences and prices a later build wrote with a field more, as a rolled-back build must', async () => {
    const store = open();
    const typed: PricesState = { ...prices, source: 'manual' };
    await store.write({ prefs, prices: typed });
    await put('prefs', { ...prefs, compactCharts: true }, 'device');
    await put('prices', { ...typed, note: 'from N+1', snapshot: { ...typed.snapshot, source: 'from N+1' } }, 'latest');
    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, prefs, prices: typed });
    expect(await raw('meta')).toEqual([]);
  });

  it('reads a prefs row written before the motion preference and fills motion with system', async () => {
    await open().load(); // creates the database
    const before = Object.fromEntries(Object.entries(prefs).filter(([key]) => key !== 'motion'));
    await put('prefs', before, 'device');
    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, prefs: { ...prefs, motion: 'system' } });
    expect(await raw('meta')).toEqual([]);
  });

  it('keeps the fields of a later build on a prefs row when writing a preference, as a rolled-back build must', async () => {
    const store = open();
    await store.write({ prefs });
    await put('prefs', { ...prefs, compactCharts: true }, 'device');
    // What this build read, changed and wrote back: the later build's field is not among the keys it knows.
    const changed = { ...prefs, theme: 'light' as const };
    await store.write({ prefs: changed });
    expect(await raw('prefs')).toEqual([{ ...changed, compactCharts: true }]);
    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, prefs: changed });
    expect(await raw('meta')).toEqual([]);
  });

  it('keeps the fields of a later build on a prefs row when stamping changedAt, as a rolled-back build must', async () => {
    const store = open();
    await store.write({ prefs });
    await put('prefs', { ...prefs, compactCharts: true }, 'device');
    await store.write({ entries: [anEntry()], changedAt: NOW });
    expect(await raw('prefs')).toEqual([{ ...prefs, compactCharts: true, changedAt: NOW }]);
    const loaded = await open().load();
    expect(loaded.prefs).toStrictEqual({ ...prefs, changedAt: NOW });
    expect(loaded.quarantined).toBe(0);
  });

  it('a plan row at schemaVersion 4 is left unread and counted', async () => {
    const plan = aPlan();
    const entry = anEntry();
    await open().write({ plan, entries: [entry] });
    const [row] = (await raw('plans')) as Record<string, unknown>[];
    const newer = { ...row, schemaVersion: 4, payload: { shape: 'unknown here' } };
    await put('plans', newer);
    // A tombstone of the newer build is no plan anyone could lose: it is left in place, counted apart.
    const gone = { ...newer, id: aPlan().id, deletedAt: NOW, updatedAt: NOW };
    await put('plans', gone);

    expect(await open().load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      entries: [entry],
      newer: { plans: 1, entries: 0 },
      newerTombstones: 1,
    });
    expect(await raw('plans')).toEqual(expect.arrayContaining([newer, gone]));
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
    // Counted again at the next load: nothing was moved, rewritten or set aside.
    expect((await open().load()).newer).toStrictEqual({ plans: 1, entries: 0 });
  });

  it('a newer plan row whose deletedAt is not an instant is counted as live', async () => {
    await open().write({ plan: aPlan(), entries: [] });
    const [row] = (await raw('plans')) as Record<string, unknown>[];
    const newer = { ...row, schemaVersion: 4, payload: { shape: 'unknown here' } };
    await put('plans', { ...newer, deletedAt: NOW, updatedAt: NOW });
    const odd = ['', false, 0, 'garbage'];
    for (const deletedAt of odd) await put('plans', { ...newer, id: aPlan().id, deletedAt });

    // Only a deletion this build can read is a tombstone; anything else may be a plan someone holds.
    const loaded = await open().load();
    expect(loaded.newer).toStrictEqual({ plans: odd.length, entries: 0 });
    expect(loaded.newerTombstones).toBe(1);
  });

  it('an entry at encVersion 1 is counted and survives a write', async () => {
    const plan = aPlan();
    const [kept, sealed] = [anEntry(), anEntry()];
    await open().write({ plan, entries: [kept, sealed] });
    const rows = (await raw('entries')) as Record<string, unknown>[];
    const row = rows.find((candidate) => candidate.id === sealed.id) as Record<string, unknown>;
    const encrypted = { ...row, encVersion: 1, payload: 'ciphertext', nonce: 'n1' };
    await put('entries', encrypted);

    expect(await open().load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      plan,
      entries: [kept],
      newer: { plans: 0, entries: 1 },
    });
    // A write of this build's rows, the plan included, leaves the newer row byte for byte.
    await open().write({ plan: { ...plan, why: 'Changed.', updatedAt: NOW }, entries: [anEntry()] });
    expect(await raw('entries')).toContainEqual(encrypted);
    expect((await open().load()).newer).toStrictEqual({ plans: 0, entries: 1 });
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
  });

  it('leaves rows of a newer schema or encryption version in place, unread and not set aside', async () => {
    const store = open();
    const plan = aPlan();
    const [kept, later, sealed] = [anEntry(), anEntry(), anEntry()];
    await store.write({ plan, entries: [kept, later, sealed] });
    const [planRow] = (await raw('plans')) as Record<string, unknown>[];
    const rows = (await raw('entries')) as Record<string, unknown>[];
    const row = (id: EntityId) => rows.find((candidate) => candidate.id === id) as Record<string, unknown>;
    const newerPlan = { ...planRow, schemaVersion: 4, payload: { shape: 'unknown here' } };
    const newerEntry = { ...row(later.id), schemaVersion: 4, keyId: 'k1' };
    const encrypted = { ...row(sealed.id), encVersion: 1, payload: 'ciphertext', nonce: 'n1' };
    await put('plans', newerPlan);
    await put('entries', newerEntry);
    await put('entries', encrypted);

    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, entries: [kept], newer: { plans: 1, entries: 2 } });
    expect(await raw('plans')).toEqual([newerPlan]);
    expect(await raw('entries')).toEqual(expect.arrayContaining([newerEntry, encrypted]));
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
    // A write of this version leaves them as they are: no tombstone over a plan it cannot read.
    await open().write({ plan: aPlan(), entries: [anEntry()] });
    expect(await raw('plans')).toContainEqual(newerPlan);
    expect(await raw('entries')).toEqual(expect.arrayContaining([newerEntry, encrypted]));
  });

  it('sets aside preferences that no longer read and falls back to the defaults', async () => {
    await open().load(); // creates the database
    await put('prefs', { ...prefs, theme: 'sepia' }, 'device');
    expect(await open().load()).toEqual({ ...EMPTY_SNAPSHOT, quarantined: 1 });
  });

  it('keeps an unreadable quarantine list as the first item of a new one', async () => {
    await open().load(); // creates the database
    await put('meta', 'garbage', 'corrupt');
    expect((await open().load()).quarantined).toBe(1);
    expect(await raw('meta')).toEqual([
      [{ store: 'meta', id: 'corrupt', raw: 'garbage', issues: ['row: invalid_type'], at: NOW }],
    ]);
  });

  it('sets aside a row whose payload is another entity', async () => {
    const store = open();
    const [entry, other] = [anEntry(), anEntry()];
    await store.write({ entries: [entry] });
    const [row] = (await raw('entries')) as Record<string, unknown>[];
    await put('entries', { ...row, payload: other });
    expect(await store.load()).toEqual({ ...EMPTY_SNAPSHOT, quarantined: 1 });
    expect(await raw('meta')).toContainEqual([
      expect.objectContaining({ id: entry.id, issues: ['payload.id: not the row id'] }),
    ]);
  });

  it('takes the newest of two live plans, which only a damaged database can hold', async () => {
    const low = '10000000-0000-4000-8000-000000000000' as EntityId;
    const high = 'f0000000-0000-4000-8000-000000000000' as EntityId;
    for (const [olderId, newerId] of [
      [low, high],
      [high, low],
    ] as const) {
      globalThis.indexedDB = new IDBFactory();
      const store = open();
      const [older, newer] = [aPlan({ id: olderId }), aPlan({ id: newerId, updatedAt: NOW })];
      await store.write({ plan: older });
      const [row] = (await raw('plans')) as Record<string, unknown>[];
      await put('plans', { ...row, id: newer.id, payload: newer, updatedAt: NOW });
      expect((await store.load()).plan).toStrictEqual(newer);
      const entry = anEntry();
      await store.write({ entries: [entry] });
      expect(await raw('entries')).toEqual([expect.objectContaining({ id: entry.id, planId: newer.id })]);
      await store.close();
    }
  });
});

describe('idb plan store: plan schema v3, the risk acknowledgement (docs/DOMAIN.md §2.1)', () => {
  const acknowledged = (overrides: Partial<Plan> = {}) =>
    aPlan({ riskAcknowledgedAt: instant('2026-10-17T08:30:00.000Z'), riskWordingVersion: 1, ...overrides });

  it('reads a plan row a build at plans v2 wrote (schemaVersion 2) as a v3 plan with no acknowledgement, sets nothing aside, and writes it back as v2 while nothing is recorded', async () => {
    const plan = aPlan();
    const entry = anEntry();
    await open().write({ plan, entries: [entry] });
    const [row] = (await raw('plans')) as Record<string, unknown>[];
    const previous = { ...row, schemaVersion: 2, payload: asV2Plan(plan) };
    await put('plans', previous);

    const loaded = await open().load();
    expect(loaded).toStrictEqual({ ...EMPTY_SNAPSHOT, plan, entries: [entry] });
    expect(loaded.plan).toMatchObject({ schemaVersion: 3, riskAcknowledgedAt: null, riskWordingVersion: 0 });
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
    await open().write({ entries: [anEntry()] });
    expect(await raw('plans')).toStrictEqual([previous]);
    const edited = { ...plan, why: 'I buy on the 1st.', updatedAt: NOW };
    await open().write({ plan: edited });
    expect(await raw('plans')).toStrictEqual([{ ...previous, payload: asV2Plan(edited), updatedAt: NOW }]);
    // An acknowledgement recorded on it is what first writes the row as v3.
    const recorded = acknowledged({ id: plan.id, updatedAt: instant('2026-10-17T09:30:00.000Z') });
    await open().write({ plan: recorded });
    expect(await raw('plans')).toStrictEqual([
      { ...previous, payload: recorded, updatedAt: recorded.updatedAt, schemaVersion: 3 },
    ]);
  });

  it('writes a plan with a recorded acknowledgement as v3 and reads it back exactly', async () => {
    const plan = acknowledged();
    const entry = anEntry();
    await open().write({ plan, entries: [entry] });
    expect(await raw('plans')).toStrictEqual([expect.objectContaining({ schemaVersion: 3, payload: plan })]);
    expect(await open().load()).toStrictEqual({ ...EMPTY_SNAPSHOT, plan, entries: [entry] });
  });

  it('a re-acknowledged plan reads back exactly at schemaVersion 3', async () => {
    const plan = acknowledged();
    await open().write({ plan });
    const again = acknowledge(plan, 2, NOW);
    await open().write({ plan: again });
    expect(await raw('plans')).toStrictEqual([
      expect.objectContaining({ schemaVersion: 3, payload: again, updatedAt: again.updatedAt }),
    ]);
    expect((await open().load()).plan).toStrictEqual(again);
    // The same row shape as a first acknowledgement: this build asks nothing more, and neither does a
    // rollback to the build of the wording before, which reads v3 and finds a version above its own.
    expect([acknowledgementDue(again, 2), acknowledgementDue(again, 1)]).toEqual([false, false]);
  });

  it('a build at plans v2 reads the plan row this build writes while nothing is recorded', async () => {
    const plan = aPlan();
    const entry = anEntry();
    await open().write({ plan, entries: [entry] });
    const [written] = (await raw('plans')) as { schemaVersion: number; payload: unknown }[];
    // The plans v2 build's own plan schema (6548d03, frozen in the core's test builders) reads the payload.
    expect(written?.schemaVersion).toBe(2);
    expect(PreviousBuildPlanSchema.parse(written?.payload)).toStrictEqual(written?.payload);

    expect(await open({ rowVersions: PLANS_V2_BUILD }).load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      plan,
      entries: [entry],
    });
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
    expect(await raw('plans')).toStrictEqual([written]);
  });

  it('a build at plans v2 leaves the v3 row of an acknowledged plan in place, unread and not set aside, still reads the v2 entries, and never tombstones the v3 row on its own write', async () => {
    const plan = acknowledged();
    const entry = anEntry();
    await open().write({ plan, entries: [entry] });
    const [written] = await raw('plans');
    expect(written).toMatchObject({ schemaVersion: 3, payload: plan });

    expect(await open({ rowVersions: PLANS_V2_BUILD }).load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      entries: [entry],
      newer: { plans: 1, entries: 0 },
    });
    expect(await raw('plans')).toStrictEqual([written]);
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
    // Its own plan write tombstones the live plans it reads, never the v3 row it cannot read.
    await open({ rowVersions: PLANS_V2_BUILD }).write({ plan: aPlan(), entries: [anEntry()] });
    expect(await raw('plans')).toContainEqual(written);
  });
});

describe('idb plan store: a write over a row of a later version (ADR-0019 readings, "Row shape")', () => {
  const unknown = { shape: 'unknown here' };

  /** A plan and an entry written by this build, their rows as stored, and the store that wrote them. */
  async function stored() {
    const store = open();
    const plan = aPlan();
    const entry = anEntry();
    await store.write({ plan, entries: [entry] });
    const [planRow] = (await raw('plans')) as Record<string, unknown>[];
    const [entryRow] = (await raw('entries')) as Record<string, unknown>[];
    return { store, plan, entry, planRow, entryRow };
  }

  it('a write over a later-version entry of the same id leaves it byte for byte, with no outbox copy', async () => {
    const { store, entry, entryRow } = await stored();
    const newer = { ...entryRow, schemaVersion: 4, payload: unknown, keyId: 'k1' };
    await put('entries', newer);
    const outbox = await raw('outbox');
    const beside = anEntry();

    await store.write({ entries: [{ ...entry, updatedAt: NOW }, beside] });

    // The row beside it, of this build's own, is written as ever: a skip writes nothing and throws nothing.
    expect(await raw('entries')).toHaveLength(2);
    expect(await raw('entries')).toContainEqual(newer);
    expect(await raw('entries')).toContainEqual(expect.objectContaining({ id: beside.id, schemaVersion: 2 }));
    expect(await raw('outbox')).toEqual(expect.arrayContaining(outbox));
    expect(await raw('outbox')).toHaveLength(outbox.length + 1);
  });

  it('a write of a plan over a later-version row of its id leaves it', async () => {
    const { store, plan, planRow } = await stored();
    await put('plans', { ...planRow, schemaVersion: 4, payload: unknown });
    const before = await dump();

    await store.write({ plan: { ...plan, why: 'Changed.', updatedAt: NOW } });

    expect(await dump()).toStrictEqual(before);
  });

  it('a write whose plan is held at a later version writes nothing at all', async () => {
    const { store, planRow } = await stored();
    const other = aPlan();
    await put('plans', {
      ...planRow,
      id: other.id,
      schemaVersion: 4,
      payload: unknown,
      deletedAt: NOW,
      updatedAt: NOW,
    });
    const before = await dump();
    const changes = {
      plan: other,
      entries: [anEntry()],
      prefs,
      changedAt: NOW,
      prices,
    };

    await store.write(changes);
    expect(await dump()).toStrictEqual(before);

    await store.update(() => changes);
    expect(await dump()).toStrictEqual(before);
  });

  it('update returns only the rows it wrote', async () => {
    const { store, plan, entry, planRow, entryRow } = await stored();
    await put('entries', { ...entryRow, schemaVersion: 4, payload: unknown, deletedAt: NOW, updatedAt: NOW });
    const beside = anEntry();

    const written = await store.update(() => ({ plan, entries: [{ ...entry, updatedAt: NOW }, beside] }));

    expect(written.changes).toStrictEqual({ plan, entries: [beside] });

    const other = aPlan();
    await put('plans', { ...planRow, id: other.id, schemaVersion: 4, payload: unknown });
    const skipped = await store.update(() => ({ plan: other, entries: [anEntry()], changedAt: NOW }));

    expect(skipped.changes).toStrictEqual({});
  });

  it('a later-version tombstone is counted apart from live rows', async () => {
    const { store, planRow, entryRow } = await stored();
    const deleted = { payload: unknown, deletedAt: NOW, updatedAt: NOW };
    await put('plans', { ...planRow, ...deleted, id: aPlan().id, schemaVersion: 4 });
    await put('entries', { ...entryRow, ...deleted, schemaVersion: 4 });
    await put('entries', { ...entryRow, id: anEntry().id, schemaVersion: 4, payload: unknown });

    const loaded = await store.load();

    expect(loaded.newer).toStrictEqual({ plans: 0, entries: 1 });
    expect(loaded.newerTombstones).toBe(2);
  });

  it('a build at plans v2 writing the plan it no longer reads leaves its v3 row', async () => {
    const plan = aPlan({ riskAcknowledgedAt: instant('2026-10-17T08:30:00.000Z'), riskWordingVersion: 1 });
    await open().write({ plan, entries: [anEntry()] });
    const before = await dump();

    await open({ rowVersions: PLANS_V2_BUILD }).write({ plan: { ...plan, why: 'Changed.', updatedAt: NOW } });

    expect(await dump()).toStrictEqual(before);
  });

  it('a write over a newer tombstone of the same id leaves it', async () => {
    const { store, plan, entry, planRow, entryRow } = await stored();
    const deleted = { schemaVersion: 4, payload: unknown, deletedAt: NOW, updatedAt: NOW };
    await put('plans', { ...planRow, ...deleted });
    await put('entries', { ...entryRow, ...deleted });
    const before = await dump();

    // Snapshot.newer leaves a tombstone out, and a write of a plan held at a later version stops at the guard.
    expect((await store.load()).newer).toStrictEqual({ plans: 0, entries: 0 });
    await store.write({ plan: { ...plan, why: 'Changed.', updatedAt: NOW }, entries: [{ ...entry, updatedAt: NOW }] });

    expect(await dump()).toStrictEqual(before);
  });
});

describe('idb plan store: entries v3, coins held (docs/DOMAIN.md §2.2, docs/RELEASE.md rollback)', () => {
  const held = (overrides: Partial<Entry> = {}) =>
    anEntry({ kind: 'held', slot: null, fee: null, amount: null, date: date('2025-03-01'), ...overrides });
  const others = () => [
    anEntry(),
    anEntry({ kind: 'lump', slot: null }),
    anEntry({ kind: 'extra', slot: null }),
    anEntry({ kind: 'sell', slot: null }),
    anEntry({ kind: 'extra', slot: null, deletedAt: NOW, updatedAt: NOW }),
  ];
  const versionsById = async () =>
    Object.fromEntries(
      ((await raw('entries')) as { id: string; schemaVersion: number }[]).map((row) => [row.id, row.schemaVersion]),
    );

  it('writes a held entry at schemaVersion 3 and every other kind at 2', async () => {
    const coins = [held(), held({ amount: '0' as Money, deletedAt: NOW, updatedAt: NOW })];
    const rest = others();
    await open().write({ plan: aPlan(), entries: [...coins, ...rest] });

    expect(await versionsById()).toStrictEqual(
      Object.fromEntries([...coins.map((entry) => [entry.id, 3]), ...rest.map((entry) => [entry.id, 2])]),
    );
  });

  it('reads entries v2 rows forward under entries v3', async () => {
    const plan = aPlan();
    const store = open();
    await store.write({ plan, entries: [] });
    const previous = others();
    for (const entry of previous) {
      const { updatedAt, deletedAt } = entry;
      const stamps = { updatedAt, deletedAt, deviceId: DEVICE, encVersion: 0, planId: plan.id };
      await put('entries', { id: entry.id, payload: entry, ...stamps, schemaVersion: 2 });
    }
    const coins = held();
    await store.write({ entries: [coins] });
    const before = await raw('entries');

    const loaded = await open().load();

    expect(ROW_SCHEMA_VERSIONS.entries).toBe(3);
    expect(loaded.entries).toHaveLength(previous.length + 1);
    expect(loaded.entries).toEqual(expect.arrayContaining([...previous, coins]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await raw('entries')).toStrictEqual(before);
  });

  it('a build at entries v2 leaves a v3 held row unread, counts it as newer and never writes over it, its tombstone included', async () => {
    const plan = aPlan();
    const kept = anEntry();
    const live = held();
    const gone = held({ deletedAt: NOW, updatedAt: NOW });
    await open().write({ plan, entries: [kept, live, gone] });
    const before = await dump();

    const previous = open({ rowVersions: ENTRIES_V2_BUILD });
    expect(await previous.load()).toStrictEqual({
      ...EMPTY_SNAPSHOT,
      plan,
      entries: [kept],
      newer: { plans: 0, entries: 1 },
      newerTombstones: 1,
    });
    expect(await dump()).toStrictEqual(before);

    // Even an entry of the same ids reaching it (by sync) leaves both rows as this build wrote them.
    const later = instant('2026-10-17T10:00:00.000Z');
    const asExtra = { kind: 'extra' as const, amount: '10' as Money, updatedAt: later };
    await previous.write({
      entries: [
        { ...live, ...asExtra },
        { ...gone, ...asExtra, deletedAt: null },
      ],
    });
    await previous.update(() => ({ entries: [{ ...live, ...asExtra }] }));
    expect(await dump()).toStrictEqual(before);
  });

  it('a build at entries v2 reads every non-held row this build writes', async () => {
    const plan = aPlan();
    const entries = others();
    await open().write({ plan, entries });
    const before = await dump();

    const loaded = await open({ rowVersions: ENTRIES_V2_BUILD }).load();

    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining(entries));
    expect(loaded).toMatchObject({ plan, newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await dump()).toStrictEqual(before);
  });
});

describe('idb plan store: the previous build’s real writes (docs/RELEASE.md, rollback)', () => {
  const acknowledged = () => aPlan({ riskAcknowledgedAt: instant('2026-10-17T08:30:00.000Z'), riskWordingVersion: 1 });
  /** Every kind, a held entry and a tombstone among them. */
  const everyKind = () => [
    anEntry(),
    anEntry({ kind: 'lump', slot: null }),
    anEntry({ kind: 'extra', slot: null }),
    anEntry({ kind: 'sell', slot: null }),
    anEntry({ kind: 'held', slot: null, fee: null, amount: null, date: date('2025-03-01') }),
    anEntry({ kind: 'extra', slot: null, deletedAt: NOW, updatedAt: NOW }),
  ];
  const entryVersions = async () =>
    ((await raw('entries')) as { schemaVersion: number }[]).map((row) => row.schemaVersion).sort();
  const readsAll = (loaded: Awaited<ReturnType<IdbPlanStore['load']>>, plan: Plan, entries: readonly Entry[]) => {
    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
  };

  it('a build writes no entry row above its own entries version', async () => {
    const entries = everyKind();
    await open({ rowVersions: ENTRIES_V2_BUILD }).write({ plan: aPlan(), entries });
    expect(await entryVersions()).toEqual([2, 2, 2, 2, 2, 2]);
    await open({ rowVersions: PREVIOUS_BUILD }).write({ entries });
    expect(await entryVersions()).toEqual([2, 2, 2, 2, 2, 3]);
  });

  it('forward: this build reads every row the previous build writes, and rewrites none on load', async () => {
    const plan = acknowledged();
    const entries = everyKind();
    await open({ rowVersions: PREVIOUS_BUILD }).write({ plan, entries });
    const before = await dump();

    readsAll(await open().load(), plan, entries);
    expect(await dump()).toStrictEqual(before);
  });

  it('rollback: the previous build reads the v2 and v3 rows this build writes, and this build reads its write', async () => {
    const plan = acknowledged();
    const entries = everyKind();
    await open().write({ plan, entries });
    expect(await raw('plans')).toStrictEqual([expect.objectContaining({ schemaVersion: 3 })]);
    expect(await entryVersions()).toEqual([2, 2, 2, 2, 2, 3]);
    const before = await dump();

    const previous = open({ rowVersions: PREVIOUS_BUILD });
    readsAll(await previous.load(), plan, entries);
    expect(await dump()).toStrictEqual(before);
    const [, , , , held] = entries;
    if (held === undefined) throw new Error('a held entry');
    const edited = { ...held, note: 'A gift.', updatedAt: instant('2026-10-17T10:00:00.000Z') };
    await previous.write({ entries: [edited] });
    expect((await open().load()).entries).toContainEqual(edited);
  });
});

describe('idb plan store: the row versions this build may write (docs/RELEASE.md, Versioning)', () => {
  const carried =
    'docs/RELEASE.md, Versioning: the newer-version screen ships in a release before any release writes plans above v3, entries above v3 or encVersion above 0';

  it('reads and writes plans at v3 at most and entries at v3 at most, in plain text, until a release with that screen has shipped', async () => {
    expect(ROW_SCHEMA_VERSIONS, carried).toEqual({ plans: 3, entries: 3 });
    const plan = aPlan({ riskAcknowledgedAt: instant('2026-10-17T08:30:00.000Z'), riskWordingVersion: 1 });
    await open().write({ plan, entries: [anEntry()] });
    const rows = [...(await raw('plans')), ...(await raw('entries'))] as { encVersion: number }[];
    expect(
      rows.map((row) => row.encVersion),
      carried,
    ).toEqual([0, 0]);
  });
});

describe('idb plan store: the rows a prototype import writes (docs/DOMAIN.md §7)', () => {
  const imported = () => {
    const ids = twoCoins.state.purchases.map(
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as EntityId,
    );
    const planId = '00000000-0000-4000-8000-100000000000' as EntityId;
    const input = { planId, country: 'PT', countryRuleVersion: 1, ids, now: NOW, today: date('2026-10-17') };
    const read = importPrototype(twoCoins.state, input);
    if (!read.ok) throw new Error('the golden file imports');
    return read.value;
  };

  it('reads the plan, entries and preferences back in this build and in the previous build’s row versions', async () => {
    const { plan, entries, prefs } = imported();
    expect(entries.every((entry) => entry.source === 'import-prototype')).toBe(true);
    await open().write({ plan, entries, prefs: { ...DEFAULT_PREFS, ...prefs } });
    const loaded = await open().load();
    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded.prefs).toMatchObject(prefs);

    expect(await open({ rowVersions: PREVIOUS_BUILD }).load()).toStrictEqual(loaded);
    expect((await raw('meta')).filter(Array.isArray)).toEqual([]);
  });
});

describe('idb plan store: device id, wipe, connection', () => {
  it('makes the device id once and keeps it across opens', async () => {
    const randomUUID = vi.fn(() => DEVICE);
    const first = open({ randomUUID });
    expect(await first.deviceId()).toBe(DEVICE);
    await first.close();
    const second = open({ randomUUID: () => 'not used' });
    expect(await second.deviceId()).toBe(DEVICE);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('replaces an unreadable device id and sets the old one aside', async () => {
    await open().load();
    await put('meta', 42, 'deviceId');
    const store = open();
    expect(await store.deviceId()).toBe(DEVICE);
    expect((await store.load()).quarantined).toBe(1);
    expect(await raw('meta')).toContainEqual([
      { store: 'meta', id: 'deviceId', raw: 42, issues: ['row: invalid_type'], at: NOW },
    ]);
  });

  it('removes everything on "Delete everything", the device id included', async () => {
    const store = open();
    await store.write({ plan: aPlan(), entries: [anEntry()], prefs, prices });
    await store.history.put({ coin: 'BTC' as CoinId, currency: 'EUR', closes: [], fetchedAt: NOW });
    await store.wipe();
    expect(await store.load()).toEqual(EMPTY_SNAPSHOT);
    for (const name of ['plans', 'entries', 'prefs', 'prices', 'history', 'outbox', 'meta'] as const) {
      expect(await raw(name)).toEqual([]);
    }
    const next = '7d444840-9dc0-41a3-bd1a-c4a1e5c7a3f2' as EntityId;
    expect(await open({ randomUUID: () => next }).deviceId()).toBe(next);
  });

  it('gives back every row byte for byte when "Delete everything" is undone, set-aside and later rows included', async () => {
    const store = open();
    const [kept, later, broken] = [anEntry(), anEntry(), anEntry()];
    await store.write({ plan: aPlan(), entries: [kept, later, broken], prefs, prices, changedAt: NOW });
    await store.history.put({ coin: 'BTC' as CoinId, currency: 'EUR', closes: [], fetchedAt: NOW });
    const rows = (await raw('entries')) as Record<string, unknown>[];
    const row = (id: EntityId) => rows.find((candidate) => candidate.id === id) as Record<string, unknown>;
    await put('entries', { ...row(later.id), schemaVersion: 4, keyId: 'k1' });
    await put('entries', { ...row(broken.id), payload: kept });
    expect((await store.load()).quarantined).toBe(1);
    const before = await dump();

    const wiped = await store.wipe();
    for (const name of STORE_NAMES) expect(await raw(name)).toEqual([]);
    expect(await store.restore(wiped)).toBe(true);
    expect(await dump()).toStrictEqual(before);
    expect((await store.load()).entries).toStrictEqual([kept]);
    // Undone once, the plan is back: a second undo of the same rows finds it and writes nothing.
    expect(await store.restore(wiped)).toBe(false);
    expect(await dump()).toStrictEqual(before);
  });

  it('refuses the undo, writing nothing, once another tab has stored a plan or a live entry', async () => {
    for (const started of [{ plan: aPlan() }, { entries: [anEntry()] }]) {
      globalThis.indexedDB = new IDBFactory();
      const store = open();
      await store.write({ plan: aPlan(), entries: [anEntry()], prefs });
      const wiped = await store.wipe();
      const other = open();
      await other.write(started);
      const before = await dump();
      expect(await store.restore(wiped)).toBe(false);
      expect(await dump()).toStrictEqual(before);
      await Promise.all([store.close(), other.close()]);
    }
  });

  // The toast's undo stays clickable over the newer-version screen, so a second live plan must not come back.
  it('restore after a wipe refuses beside a newer plan whose deletedAt is not an instant', async () => {
    const store = open();
    await store.write({ plan: aPlan(), entries: [anEntry()], prefs });
    const [row] = (await raw('plans')) as Record<string, unknown>[];
    const wiped = await store.wipe();
    const payload = { shape: 'unknown here' };
    await put('plans', { ...row, id: aPlan().id, schemaVersion: 4, payload, deletedAt: 'garbage' });
    const before = await dump();

    expect(await store.restore(wiped)).toBe(false);
    expect(await dump()).toStrictEqual(before);
  });

  it('restores over what is not a plan or a live entry: preferences, prices and deleted entries', async () => {
    const store = open();
    const plan = aPlan();
    await store.write({ plan, entries: [anEntry()], prefs: DEFAULT_PREFS });
    const wiped = await store.wipe();
    const deleted = { ...anEntry(), deletedAt: NOW, updatedAt: NOW };
    await open().write({ entries: [deleted], prefs, prices });
    expect(await store.restore(wiped)).toBe(true);
    const restored = await store.load();
    expect(restored.plan).toStrictEqual(plan);
    expect(restored.prefs).toStrictEqual(DEFAULT_PREFS);
    expect(restored.prices).toStrictEqual(prices);
    expect(restored.entries).toContainEqual(deleted);
  });

  it('opens the database again after the browser closes it, or after close()', async () => {
    const openRequests = vi.spyOn(indexedDB, 'open');
    const store = open();
    await store.load();
    const request = openRequests.mock.results[0]?.value as IDBOpenDBRequest;
    forceCloseDatabase(request.result as never);
    await store.write({ entries: [anEntry()] });
    await store.close();
    expect((await store.load()).entries).toHaveLength(1);
    expect(openRequests).toHaveBeenCalledTimes(3);
  });

  it('fails, and fails again on the next call, while a newer version holds the database', async () => {
    const store = open();
    await store.load();
    const newer = await openDB(DATABASE_NAME, 2);
    await expect(store.load()).rejects.toThrow();
    await expect(store.load()).rejects.toThrow();
    newer.close();
  });

  it('closes quietly while an open that will fail is under way', async () => {
    const failing = () => Promise.reject(new Error('cannot upgrade'));
    const store = open({ migrations: [failing] });
    const loading = store.load();
    await store.close();
    await expect(loading).rejects.toThrow('cannot upgrade');
  });
});

describe('idb plan store: last prices (ADR-0019 readings, ADR-0036)', () => {
  const at = (fetchedAt: string): PricesState => ({ ...prices, fetchedAt: instant(fetchedAt) });

  it('serves live prices fetched less than 24 hours ago, then deletes them at the next load', async () => {
    const store = open();
    await store.write({ prices: at('2026-10-16T09:00:00.001Z') });
    expect((await store.load()).prices).toStrictEqual(at('2026-10-16T09:00:00.001Z'));
    await store.write({ prices: at('2026-10-16T09:00:00.000Z') });
    expect((await store.load()).prices).toBeNull();
    expect(await raw('prices')).toEqual([]);
    expect((await store.load()).quarantined).toBe(0);
  });

  it('deletes live prices whose fetch time is after now (the device clock went back)', async () => {
    const store = open();
    await store.write({ prices: at('2026-10-17T09:00:00.001Z') });
    expect((await store.load()).prices).toBeNull();
    expect(await raw('prices')).toEqual([]);
  });

  it('deletes live prices whose data is 24 hours old, however recently a cache handed them over', async () => {
    // The route's last good copy or the service worker's can be old when it arrives (ADR-0036).
    const store = open();
    const old = (dataAt: string): PricesState => ({
      ...at('2026-10-17T08:59:00.000Z'),
      snapshot: { ...prices.snapshot, at: instant(dataAt) },
    });
    await store.write({ prices: old('2026-10-16T09:00:00.001Z') });
    expect((await store.load()).prices).toStrictEqual(old('2026-10-16T09:00:00.001Z'));
    // A time a little after now is the server's clock ahead of the device's, not a reason to delete.
    await store.write({ prices: old('2026-10-17T09:00:05.000Z') });
    expect((await store.load()).prices).toStrictEqual(old('2026-10-17T09:00:05.000Z'));
    await store.write({ prices: old('2026-10-16T09:00:00.000Z') });
    expect((await store.load()).prices).toBeNull();
    await store.write({ prices: old('2026-10-16T03:00:00.000Z') });
    expect((await store.load()).prices).toBeNull();
    expect(await raw('prices')).toEqual([]);
  });

  it('keeps prices typed by hand however old they are', async () => {
    const store = open();
    const typed: PricesState = { ...at('2026-09-01T10:00:00.000Z'), source: 'manual' };
    await store.write({ prices: typed });
    expect((await store.load()).prices).toStrictEqual(typed);
  });
});

describe('idb plan store: history cache (ADR-0036)', () => {
  const closes = [
    [date('2026-10-15'), '60000'],
    [date('2026-10-16'), '61000'],
  ] as PriceHistory;
  const cached: CachedHistory = { coin: 'BTC' as CoinId, currency: 'EUR', closes, fetchedAt: NOW };
  /** Closes are kept only beside a live plan, so each test stores one first. */
  async function withPlan(): Promise<IdbPlanStore> {
    const store = open();
    await store.write({ plan: aPlan() });
    return store;
  }

  it('serves closes for less than 24 hours, then deletes them', async () => {
    const store = await withPlan();
    await store.history.put(cached);
    expect(await store.history.get(cached.coin, 'EUR', NOW)).toStrictEqual(cached);
    expect(await store.history.get(cached.coin, 'USD', NOW)).toBeNull();
    expect(await store.history.get(cached.coin, 'EUR', instant('2026-10-18T08:59:59.999Z'))).toStrictEqual(cached);
    expect(await store.history.get(cached.coin, 'EUR', instant('2026-10-18T09:00:00.000Z'))).toBeNull();
    expect(await raw('history')).toEqual([]);
  });

  it('stores nothing from a fetch that resolves after "Delete everything" or with no live plan', async () => {
    const store = await withPlan();
    // The Portfolio chart's fetch began while the plan was there; the wipe landed before its put.
    await store.wipe();
    await store.history.put(cached);
    expect(await raw('history')).toEqual([]);
    const plan = aPlan();
    await store.write({ plan });
    await store.write({ plan: null });
    await store.history.put(cached);
    expect(await raw('history')).toEqual([]);
  });

  it('deletes a copy that no longer reads instead of serving or keeping it', async () => {
    const store = await withPlan();
    await store.history.put(cached);
    await put('history', { ...cached, closes: 'nope' });
    expect(await store.history.get(cached.coin, 'EUR', NOW)).toBeNull();
    expect(await raw('history')).toEqual([]);
    expect((await store.load()).quarantined).toBe(0);
  });

  it('sweeps expired and unreadable copies at every load', async () => {
    const store = await withPlan();
    await store.history.put(cached);
    await store.history.put({ ...cached, currency: 'USD', fetchedAt: instant('2026-10-16T08:00:00.000Z') });
    await put('history', { coin: 'ETH', currency: 'EUR', closes: 'nope', fetchedAt: NOW });
    await store.load();
    expect(await raw('history')).toStrictEqual([cached]);
  });

  it('refuses closes that are not in ascending date order', async () => {
    const reversed = [...closes].reverse() as PriceHistory;
    await expect(open().history.put({ ...cached, closes: reversed })).rejects.toThrow(/invalid price history/);
  });
});
