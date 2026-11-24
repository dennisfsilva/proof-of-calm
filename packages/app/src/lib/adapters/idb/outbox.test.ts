// @vitest-environment node
// No outbox copy before M3's sync (ADR-0019 Readings, 2026-11-24): no write puts one, and every open
// empties the store at version 1. The previous build wrote a copy of each plan and entry row; these tests
// put such copies in raw, as it did, and prove both directions of a rollback.
import 'fake-indexeddb/auto';
import type { EntityId } from '@proofofcalm/core';
import { anEntry, aPlan, instant } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type IdbPlanStoreOptions, idbPlanStore } from '../idb-store';
import { DATABASE_NAME, MIGRATIONS, openDatabase, type StoreName } from './database';
import { PREVIOUS_BUILD } from './rows.testing';

const clock = { now: () => instant('2026-10-17T09:00:00.000Z') };
const randomUUID = () => '0f5c1a3e-8d2b-4c6f-9a7e-1b2c3d4e5f60' as EntityId;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Opens a store, runs one step on it and closes it, so the next step opens the database afresh. */
async function withStore<T>(
  step: (store: ReturnType<typeof idbPlanStore>) => Promise<T>,
  options: Partial<IdbPlanStoreOptions> = {},
): Promise<T> {
  const store = idbPlanStore({ clock, randomUUID, ...options });
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

  it('rejects the open when the outbox cannot be emptied, and the next open empties it', async () => {
    const snapshot = await written();
    await putCopies();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementationOnce(() => {
      throw new DOMException('The disk is full.', 'QuotaExceededError');
    });

    const store = idbPlanStore({ clock, randomUUID });
    await expect(store.load()).rejects.toThrow('The disk is full.');
    clear.mockRestore();
    expect(await store.load()).toStrictEqual(snapshot);
    await store.close();
    expect(await raw('outbox')).toStrictEqual([]);
  });

  it('a failed clear closes the connection it opened, so nothing blocks a later upgrade or delete', async () => {
    await written();
    await putCopies();
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementationOnce(() => {
      throw new DOMException('The disk is full.', 'QuotaExceededError');
    });
    const closed = vi.fn();
    await expect(openDatabase(MIGRATIONS, { closed })).rejects.toThrow('The disk is full.');
    clear.mockRestore();

    // A connection left open would get the upgrade's versionchange and say it closed; a closed one gets nothing.
    const blocked = vi.fn();
    const newer = await openDB(DATABASE_NAME, MIGRATIONS.length + 1, { blocked });
    expect(newer.version).toBe(MIGRATIONS.length + 1);
    newer.close();
    await deleteDB(DATABASE_NAME, { blocked });
    expect(blocked).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
