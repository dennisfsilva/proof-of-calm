// @vitest-environment node
// The snapshot's set-aside rows (ADR-0019 Readings, 2026-11-26): an additive field built from the list under
// meta's "corrupt" key, with no row, schema or migration change. Forward: a list the previous build wrote reads
// into it. Rollback: this build's load leaves the list as the previous build wrote and reads it, byte for byte,
// and a store at the previous build's row versions reads the same list the same way.
import 'fake-indexeddb/auto';
import type { Entry, Plan } from '@proofofcalm/core';
import { anEntry, aPlan, instant, split } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, STORE_NAMES, type StoreName } from './idb/database';
import { PREVIOUS_BUILD } from './idb/rows.testing';
import { type IdbPlanStore, type IdbPlanStoreOptions, idbPlanStore } from './idb-store';

const EARLIER = instant('2026-10-01T08:00:00.000Z');
const NOW = instant('2026-10-17T09:00:00.000Z');

const opened: IdbPlanStore[] = [];
function open(options: Partial<IdbPlanStoreOptions> = {}): IdbPlanStore {
  const store = idbPlanStore({ clock: { now: () => NOW }, ...options });
  opened.push(store);
  return store;
}

async function withDb<T>(run: (db: Awaited<ReturnType<typeof openDB>>) => Promise<T>): Promise<T> {
  const db = await openDB(DATABASE_NAME);
  try {
    return await run(db);
  } finally {
    db.close();
  }
}
const raw = (store: StoreName) => withDb((db) => db.getAll(store)) as Promise<Record<string, unknown>[]>;
const put = (store: StoreName, value: unknown, key?: string) => withDb((db) => db.put(store, value, key));
/** Every store's keys and values as stored, to compare a database before and after. */
const dump = () =>
  withDb(async (db) => {
    const stores: Record<string, unknown> = {};
    for (const name of STORE_NAMES) stores[name] = { keys: await db.getAllKeys(name), values: await db.getAll(name) };
    return JSON.stringify(stores);
  });

/** A plan with two entries stored by this build, then the plan row and one entry row made unreadable. */
async function corrupted(): Promise<{ plan: Plan; kept: Entry; broken: Entry }> {
  const plan = aPlan();
  const [kept, broken] = [anEntry(), anEntry()];
  await open().write({ plan, entries: [kept, broken] });
  const [planRow] = await raw('plans');
  const entryRow = (await raw('entries')).find((row) => row.id === broken.id);
  await put('plans', { ...planRow, payload: { ...plan, split: split({ BTC: '70', ETH: '20' }) } });
  await put('entries', { ...entryRow, payload: { ...broken, amount: 70.5 } });
  return { plan, kept, broken };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((store) => store.close()));
});

describe('idb plan store: the set-aside rows (ADR-0019 Readings, 2026-11-26)', () => {
  it('lists the live plan and entry rows a load sets aside, each with the time it was set aside', async () => {
    const { plan, kept, broken } = await corrupted();
    const snapshot = await open().load();
    expect(snapshot.plan).toBeNull();
    expect(snapshot.entries).toStrictEqual([kept]);
    expect(snapshot.quarantined).toBe(2);
    expect(snapshot.setAside).toStrictEqual({
      plans: [{ id: plan.id, at: NOW }],
      entries: [{ id: broken.id, at: NOW }],
    });
  });

  it('lists none while nothing is set aside', async () => {
    await open().write({ plan: aPlan(), entries: [anEntry()] });
    expect((await open().load()).setAside).toStrictEqual({ plans: [], entries: [] });
  });

  it('forward: reads a list in the previous build’s shape, kinds apart, and leaves it as stored', async () => {
    const entry = anEntry();
    await open().write({ plan: aPlan(), entries: [entry] });
    // The records the previous build wrote under meta's "corrupt" key: { store, id, raw, issues, at }.
    const list = [
      {
        store: 'entries',
        id: 'e-live',
        raw: { id: 'e-live', deletedAt: null },
        issues: ['payload: invalid_type'],
        at: EARLIER,
      },
      {
        store: 'entries',
        id: 'e-gone',
        raw: { id: 'e-gone', deletedAt: EARLIER },
        issues: ['payload: invalid_type'],
        at: EARLIER,
      },
      { store: 'plans', id: 'p-live', raw: { id: 'p-live' }, issues: ['payload.split: split-sum'], at: EARLIER },
      { store: 'prefs', id: 'device', raw: { theme: 7 }, issues: ['theme: invalid_value'], at: EARLIER },
      { store: 'meta', id: 'corrupt', raw: 'not a list', issues: ['invalid_type'], at: EARLIER },
    ];
    await put('meta', list, 'corrupt');
    const before = await dump();

    const snapshot = await open().load();
    expect(snapshot.quarantined).toBe(5);
    expect(snapshot.setAside).toStrictEqual({
      plans: [{ id: 'p-live', at: EARLIER }],
      entries: [{ id: 'e-live', at: EARLIER }],
    });
    expect(snapshot.entries).toStrictEqual([entry]);
    expect(await dump()).toBe(before);
  });

  it('rollback: the list is unchanged byte for byte after this build’s load, and the previous row versions read it the same way', async () => {
    await corrupted();
    const first = await open().load();
    const before = await dump();

    expect(await open().load()).toStrictEqual(first);
    expect(await dump()).toBe(before);
    const previous = await open({ rowVersions: PREVIOUS_BUILD }).load();
    expect(previous.quarantined).toBe(first.quarantined);
    expect(previous.setAside).toStrictEqual(first.setAside);
    expect(await dump()).toBe(before);
  });
});
