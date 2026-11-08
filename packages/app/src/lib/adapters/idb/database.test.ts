// @vitest-environment node
// The migration framework (ADR-0019, docs/RELEASE.md "Storage migration"): version 1 builds the stores,
// and a synthetic version 2, defined only here, runs against a version 1 fixture database the way every
// future migration will be tested.
import 'fake-indexeddb/auto';
import type { EntityId } from '@proofofcalm/core';
import { anEntry, aPlan, instant } from '@proofofcalm/core/testing';
import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { type IDBPTransaction, openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idbPlanStore } from '../idb-store';
import { DATABASE_NAME, MIGRATIONS, type Migration, openDatabase } from './database';

const clock = { now: () => instant('2026-10-17T09:00:00.000Z') };
const randomUUID = () => '0f5c1a3e-8d2b-4c6f-9a7e-1b2c3d4e5f60';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** A version 1 database holding a plan and entries written before the plan existed (planId null). */
async function v1Fixture() {
  const store = idbPlanStore({ clock, randomUUID });
  const plan = aPlan();
  const entries = [anEntry(), anEntry()];
  await store.write({ entries });
  await store.write({ plan });
  const snapshot = await store.load();
  await store.close();
  return { plan, entries, snapshot };
}

/**
 * What a version 2 could be: entries written without a plan get the live plan's id, and a new index.
 * A real one would also add the index to StorageSchema; here the schema is the version 1 one, hence the cast.
 */
const backfillPlanIds: Migration = async (_database, transaction) => {
  const plans = (await transaction.objectStore('plans').getAll()) as { id: EntityId; deletedAt: string | null }[];
  const live = plans.find((row) => row.deletedAt === null);
  const entries = transaction.objectStore('entries');
  for (const row of (await entries.getAll()) as Record<string, unknown>[]) {
    if (row.planId === null && live !== undefined) await entries.put({ ...row, planId: live.id });
  }
  const untyped = transaction as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
  untyped.objectStore('entries').createIndex('deletedAt', 'deletedAt');
};

describe('database and migrations', () => {
  it('builds version 1: seven stores with their keys and indexes', async () => {
    const database = await openDatabase(MIGRATIONS, { closed: () => undefined });
    expect(database.version).toBe(1);
    expect([...database.objectStoreNames].sort()).toEqual(
      ['entries', 'history', 'meta', 'outbox', 'plans', 'prefs', 'prices'].sort(),
    );
    const tx = database.transaction(['plans', 'entries', 'history', 'outbox', 'meta']);
    expect(tx.objectStore('plans').keyPath).toBe('id');
    expect([...tx.objectStore('plans').indexNames]).toEqual(['updatedAt']);
    expect([...tx.objectStore('entries').indexNames].sort()).toEqual(['planId', 'updatedAt']);
    expect(tx.objectStore('history').keyPath).toEqual(['coin', 'currency']);
    expect(tx.objectStore('outbox').keyPath).toEqual(['store', 'id']);
    expect(tx.objectStore('meta').keyPath).toBeNull();
    database.close();
  });

  it('runs a new version once over a version 1 database and keeps its data', async () => {
    const { plan, entries, snapshot } = await v1Fixture();
    const v2 = vi.fn(backfillPlanIds);
    const store = idbPlanStore({ clock, randomUUID, migrations: [...MIGRATIONS, v2] });
    expect(await store.load()).toStrictEqual(snapshot);
    expect(v2).toHaveBeenCalledTimes(1);
    await store.close();

    const database = await openDB(DATABASE_NAME);
    expect(database.version).toBe(2);
    expect(await database.getAllKeysFromIndex('entries', 'planId', plan.id)).toEqual(entries.map((entry) => entry.id));
    expect(database.transaction('entries').store.indexNames.contains('deletedAt')).toBe(true);
    database.close();

    const again = idbPlanStore({ clock, randomUUID, migrations: [...MIGRATIONS, v2] });
    expect(await again.load()).toStrictEqual(snapshot);
    expect(v2).toHaveBeenCalledTimes(1);
    await again.close();
  });

  it('leaves the database at its old version, untouched, when a migration fails', async () => {
    const { snapshot } = await v1Fixture();
    const failing: Migration = async (database, transaction) => {
      await backfillPlanIds(database, transaction);
      throw new Error('migration 2 failed');
    };
    const store = idbPlanStore({ clock, randomUUID, migrations: [...MIGRATIONS, failing] });
    await expect(store.load()).rejects.toThrow('migration 2 failed');

    const database = await openDB(DATABASE_NAME);
    expect(database.version).toBe(1);
    expect(database.transaction('entries').store.indexNames.contains('deletedAt')).toBe(false);
    database.close();
    const v1 = idbPlanStore({ clock, randomUUID });
    expect(await v1.load()).toStrictEqual(snapshot);
    await v1.close();
    // The failed upgrade let go of its connection: the fixed migration can run next.
    const fixed = idbPlanStore({ clock, randomUUID, migrations: [...MIGRATIONS, backfillPlanIds] });
    expect(await fixed.load()).toStrictEqual(snapshot);
    await fixed.close();
  });

  it('a migration that throws before it awaits anything aborts the upgrade too', async () => {
    await v1Fixture();
    const sync: Migration = () => {
      throw new Error('bad step');
    };
    await expect(openDatabase([...MIGRATIONS, sync], { closed: () => undefined })).rejects.toThrow('bad step');
    const database = await openDB(DATABASE_NAME);
    expect(database.version).toBe(1);
    database.close();
  });

  it('lets a newer version open: the connection closes and says so', async () => {
    const closed = vi.fn();
    const database = await openDatabase(MIGRATIONS, { closed });
    const newer = await openDB(DATABASE_NAME, 2);
    expect(newer.version).toBe(2);
    expect(closed).toHaveBeenCalledTimes(1);
    newer.close();
    database.close();
  });

  it('says so when the browser drops the connection', async () => {
    const closed = vi.fn();
    const openRequests = vi.spyOn(indexedDB, 'open');
    const database = await openDatabase(MIGRATIONS, { closed });
    const request = openRequests.mock.results[0]?.value as IDBOpenDBRequest;
    forceCloseDatabase(request.result as never);
    expect(closed).toHaveBeenCalledTimes(1);
    database.close();
  });
});
