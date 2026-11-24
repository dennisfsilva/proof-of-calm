// @vitest-environment node
// No outbox copy and no random device id before M3's sync (ADR-0019 Readings, 2026-11-24): no write puts
// a copy, every row is stamped with the one local id, and every open empties the store and rewrites the
// ids at version 1. The previous build wrote a copy of each plan and entry row and stamped them with a
// random id it kept in meta; these tests put such copies and ids in raw, as it did, and prove both
// directions of a rollback.
import 'fake-indexeddb/auto';
import type { CoinId, EntityId } from '@proofofcalm/core';
import { anEntry, aPlan, instant } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdbPlanStoreOptions, idbPlanStore } from '../idb-store';
import { DATABASE_NAME, DEVICE_ID_KEY, LOCAL_DEVICE_ID, MIGRATIONS, openDatabase, type StoreName } from './database';
import { CORRUPT_KEY } from './quarantine';
import { PREVIOUS_BUILD } from './rows.testing';

const clock = { now: () => instant('2026-10-17T09:00:00.000Z') };
/** The random id the previous build made once per browser and stamped on every row it wrote. */
const RANDOM = '3b9e2f4a-6c1d-4e8b-a5f7-2d9c8b7a6e51' as EntityId;

/** What a put or clear does when the disk is full. */
function diskFull(): never {
  throw new DOMException('The disk is full.', 'QuotaExceededError');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Opens a store, runs one step on it and closes it, so the next step opens the database afresh. */
async function withStore<T>(
  step: (store: ReturnType<typeof idbPlanStore>) => Promise<T>,
  options: Partial<IdbPlanStoreOptions> = {},
): Promise<T> {
  const store = idbPlanStore({ clock, ...options });
  try {
    return await step(store);
  } finally {
    await store.close();
  }
}

async function raw(store: StoreName): Promise<unknown[]> {
  const db = await openDB(DATABASE_NAME);
  try {
    return await db.getAll(store);
  } finally {
    db.close();
  }
}

async function version(): Promise<number> {
  const db = await openDB(DATABASE_NAME);
  try {
    return db.version;
  } finally {
    db.close();
  }
}

/** The copies the previous build kept: each synced row under its store, the entry's local planId left out. */
async function putCopies(): Promise<void> {
  const db = await openDB(DATABASE_NAME);
  try {
    const plans = (await db.getAll('plans')) as Record<string, unknown>[];
    const entries = (await db.getAll('entries')) as Record<string, unknown>[];
    for (const row of plans) await db.put('outbox', { store: 'plans', ...row });
    for (const { planId: _local, ...row } of entries) await db.put('outbox', { store: 'entries', ...row });
  } finally {
    db.close();
  }
}

/** The keys in meta, where the previous build kept its device id. */
async function metaKeys(): Promise<IDBValidKey[]> {
  const db = await openDB(DATABASE_NAME);
  try {
    return await db.getAllKeys('meta');
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

/** What the previous build's next write leaves: its random id in meta, stamped on the rows it writes. */
async function stampAsPreviousBuild(): Promise<void> {
  const db = await openDB(DATABASE_NAME);
  try {
    await db.put('meta', RANDOM, DEVICE_ID_KEY);
    for (const name of ['plans', 'entries'] as const) {
      for (const row of (await db.getAll(name)) as Record<string, unknown>[]) {
        await db.put(name, { ...row, deviceId: RANDOM });
      }
    }
  } finally {
    db.close();
  }
}

const stampedLocal = (rows: readonly unknown[]) =>
  rows.map((row) => ({ ...(row as Record<string, unknown>), deviceId: LOCAL_DEVICE_ID }));

/** A plan replaced by another (a tombstone among the rows) and entries, one of them deleted. */
async function written() {
  const plan = aPlan();
  const entries = [anEntry(), anEntry({ kind: 'extra', slot: null }), anEntry({ deletedAt: clock.now() })];
  return withStore(async (store) => {
    await store.write({ plan: aPlan({ updatedAt: instant('2026-10-01T08:00:00.000Z') }) });
    await store.write({ plan, entries });
    return store.load();
  });
}

describe('the outbox before the sync (ADR-0019 Readings, 2026-11-24)', () => {
  it('forward: this build empties the outbox a previous build filled and reads its plan and entries unchanged', async () => {
    const snapshot = await written();
    await putCopies();
    expect(await raw('outbox')).toHaveLength(5);
    const [plans, entries] = [await raw('plans'), await raw('entries')];

    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    expect(await raw('outbox')).toStrictEqual([]);
    expect(await raw('plans')).toStrictEqual(plans);
    expect(await raw('entries')).toStrictEqual(entries);
    expect(await version()).toBe(1);
  });

  it('rollback: the previous build opens the database this build used, at version 1, and reads every row it wrote', async () => {
    const snapshot = await written();
    expect(await raw('outbox')).toStrictEqual([]);

    const db = await openDB(DATABASE_NAME, 1);
    expect(db.version).toBe(1);
    db.close();
    expect(await withStore((store) => store.load(), { rowVersions: PREVIOUS_BUILD })).toStrictEqual(snapshot);
  });

  it("a copy an older build writes after a rollback is gone at this build's next open", async () => {
    const snapshot = await written();
    await putCopies(); // the older build's next write, after the rollback
    expect(await raw('outbox')).not.toStrictEqual([]);

    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    expect(await raw('outbox')).toStrictEqual([]);
  });

  it('opens when the outbox cannot be emptied, keeps the copies until then, and the next open empties it', async () => {
    const snapshot = await written();
    await putCopies();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementationOnce(diskFull);

    const store = idbPlanStore({ clock });
    expect(await store.load()).toStrictEqual(snapshot);
    clear.mockRestore();
    await store.close();
    expect(await raw('outbox')).toHaveLength(5);
    expect(await withStore((next) => next.load())).toStrictEqual(snapshot);
    expect(await raw('outbox')).toStrictEqual([]);
  });

  it('the connection kept after a failed cleanup serves reads and still closes on versionchange, so it blocks no later upgrade', async () => {
    await written();
    await putCopies();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementationOnce(diskFull);
    const closed = vi.fn();
    const db = await openDatabase(MIGRATIONS, { closed });
    clear.mockRestore();
    expect(await db.getAll('outbox')).toHaveLength(5);

    const blocked = vi.fn();
    const newer = await openDB(DATABASE_NAME, MIGRATIONS.length + 1, { blocked });
    expect(newer.version).toBe(MIGRATIONS.length + 1);
    newer.close();
    await deleteDB(DATABASE_NAME, { blocked });
    expect(blocked).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe('a failed cleanup never blocks the open (ADR-0019 Readings, 2026-11-24)', () => {
  it('opens and reads every row when the cleanup fails on every attempt, as on a full disk', async () => {
    const snapshot = await written();
    await putCopies();
    await stampAsPreviousBuild();
    // Every put and clear fails, the load's own writes as well: the mock shows that the open, the load
    // and the history cache read through it, not that a new entry saves on a full disk (it cannot).
    const puts = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(diskFull);
    const clears = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(diskFull);
    try {
      const store = idbPlanStore({ clock });
      expect(await store.load()).toStrictEqual(snapshot);
      expect(await store.history.get('BTC' as CoinId, 'EUR', clock.now())).toBeNull();
      await store.close();
      expect(await withStore((next) => next.load())).toStrictEqual(snapshot);
      expect(clears).toHaveBeenCalledTimes(2);
    } finally {
      puts.mockRestore();
      clears.mockRestore();
    }
    expect(await raw('outbox')).toHaveLength(5);
    expect(await metaKeys()).toContain(DEVICE_ID_KEY);
  });

  it('the next open after a failed cleanup empties the outbox and restamps the rows', async () => {
    const snapshot = await written();
    await putCopies();
    await stampAsPreviousBuild();
    const [plans, entries] = [await raw('plans'), await raw('entries')];
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(diskFull);

    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    failing.mockRestore();
    expect(await raw('outbox')).toHaveLength(5);
    expect(await raw('plans')).toStrictEqual(plans);

    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    expect(await raw('outbox')).toStrictEqual([]);
    expect(await metaKeys()).not.toContain(DEVICE_ID_KEY);
    expect(await raw('plans')).toStrictEqual(stampedLocal(plans));
    expect(await raw('entries')).toStrictEqual(stampedLocal(entries));
  });
});

describe('the device id before the sync (ADR-0019 Readings, 2026-11-24)', () => {
  it('forward: this build replaces the random device id a previous build stored with the local id and reads every row otherwise unchanged', async () => {
    const snapshot = await written();
    await stampAsPreviousBuild();
    const [plans, entries] = [await raw('plans'), await raw('entries')];

    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    expect(await metaKeys()).not.toContain(DEVICE_ID_KEY);
    expect(await raw('plans')).toStrictEqual(stampedLocal(plans));
    expect(await raw('entries')).toStrictEqual(stampedLocal(entries));
    expect(await version()).toBe(1);
  });

  it('rollback: the previous build reads rows stamped with the local id, and the random id it stores is gone at this build’s next open', async () => {
    const snapshot = await written();
    const [plans, entries] = [await raw('plans'), await raw('entries')];
    expect(await metaKeys()).not.toContain(DEVICE_ID_KEY);
    expect([...plans, ...entries].map((row) => (row as { deviceId: unknown }).deviceId)).toStrictEqual(
      Array.from({ length: 5 }, () => LOCAL_DEVICE_ID),
    );
    expect(await withStore((store) => store.load(), { rowVersions: PREVIOUS_BUILD })).toStrictEqual(snapshot);

    await stampAsPreviousBuild(); // the previous build's next write, after the rollback
    expect(await withStore((store) => store.load())).toStrictEqual(snapshot);
    expect(await metaKeys()).not.toContain(DEVICE_ID_KEY);
    expect(await raw('plans')).toStrictEqual(plans);
    expect(await raw('entries')).toStrictEqual(entries);
  });

  it('leaves a row that fails the row check as it was, so the load sets it aside, its random id included', async () => {
    await written();
    await stampAsPreviousBuild();
    const [first, second, third] = (await raw('entries')) as Record<string, unknown>[];
    const badDevice = { ...first, deviceId: 'not-a-device' };
    const badPayload = { ...second, payload: null };
    await put('entries', badDevice);
    await put('entries', badPayload);

    expect((await withStore((store) => store.load())).quarantined).toBe(2);
    const db = await openDB(DATABASE_NAME);
    const corrupt = (await db.get('meta', CORRUPT_KEY)) as { raw: unknown }[];
    db.close();
    expect(corrupt.map((item) => item.raw)).toStrictEqual(expect.arrayContaining([badDevice, badPayload]));
    expect(await raw('entries')).toStrictEqual(stampedLocal([third]));
  });

  it('keeps a row of a later version byte for byte, its random id included', async () => {
    await written();
    await stampAsPreviousBuild();
    const [first] = (await raw('entries')) as Record<string, unknown>[];
    const later = { ...first, schemaVersion: 5, keyId: 'k1' };
    await put('entries', later);

    await withStore((store) => store.load());
    expect(await raw('entries')).toContainEqual(later);
    expect(await raw('plans')).toStrictEqual(stampedLocal(await raw('plans')));
  });

  it('opens when a row cannot be rewritten, keeps the old id until then, and the next open rewrites it', async () => {
    const snapshot = await written();
    await stampAsPreviousBuild();
    const [plans, entries] = [await raw('plans'), await raw('entries')];
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(diskFull);

    const store = idbPlanStore({ clock });
    expect(await store.load()).toStrictEqual(snapshot);
    failing.mockRestore();
    await store.close();
    expect(await metaKeys()).toContain(DEVICE_ID_KEY);
    expect(await raw('entries')).toStrictEqual(entries);
    expect(await withStore((next) => next.load())).toStrictEqual(snapshot);
    expect(await metaKeys()).not.toContain(DEVICE_ID_KEY);
    expect(await raw('plans')).toStrictEqual(stampedLocal(plans));
    expect(await raw('entries')).toStrictEqual(stampedLocal(entries));
  });
});
