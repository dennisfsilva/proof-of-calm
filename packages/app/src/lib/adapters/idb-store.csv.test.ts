// @vitest-environment node
// The rows an exchange import writes (docs/DOMAIN.md §3.13, ADR-0056): entries of the kinds the Log already holds,
// with source `import-csv`, ids derived from the rows' keys (UUID version 8) and the tombstones of the estimates they
// replace. No row version changes for them; the forward read proves this build reads them back exactly, and the
// rollback read that the build at entries v3 reads them all and backs them up (docs/RELEASE.md, rollback;
// .claude/rules/app-storage.md).
import 'fake-indexeddb/auto';
import {
  applyExchangeImport,
  type EntityId,
  type Entry,
  exportBackup,
  importId,
  planExchangeImport,
  readExchangeFile,
  writtenBackup,
} from '@proofofcalm/core';
import { instant, previousBuildBackupGate } from '@proofofcalm/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../services/fixtures';
import { KRAKEN_OCTOBER, ONE_TAP_OCTOBER } from '../services/kraken.testing';
import { TRADE_REPUBLIC_OCTOBER } from '../services/trade-republic.testing';
import { epochMs, todayIn } from './clock';
import { DATABASE_NAME, STORE_NAMES } from './idb/database';
import { type IdbPlanStore, type IdbPlanStoreOptions, idbPlanStore } from './idb-store';

const NOW = instant('2026-10-20T10:00:00.000Z');
const DEVICE = '0f5c1a3e-8d2b-4c6f-9a7e-1b2c3d4e5f62' as EntityId;
/** The row versions of the build before moves, frozen: plans and entries at v3 (idb-store.test.ts). */
const PREVIOUS_BUILD = { plans: 3, entries: 3 } as const;
const VERSION_8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const opened: IdbPlanStore[] = [];
function open(options: Partial<IdbPlanStoreOptions> = {}): IdbPlanStore {
  const store = idbPlanStore({ clock: { now: () => NOW }, randomUUID: () => DEVICE, ...options });
  opened.push(store);
  return store;
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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((store) => store.close()));
});

/**
 * The fixture's plan and Log with October's one tap, stored by this build, then the synthetic Kraken ledger imported
 * over it as the action writes it: the plan computed on the stored Log, applied, and the changed rows written. With
 * `csv` and `venue`, that export is imported at that venue instead, over the fixture's Log alone.
 */
async function imported(csv = KRAKEN_OCTOBER, venue = 'Kraken') {
  const { plan, entries: logged, prefs } = fixtureSnapshot();
  if (plan === null) throw new Error('the fixture has a plan');
  const stored = csv === KRAKEN_OCTOBER ? [...logged, ONE_TAP_OCTOBER] : logged;
  await open().write({ plan, entries: stored, prefs });
  const read = readExchangeFile(csv);
  if (!read.ok) throw new Error('the synthetic export reads');
  const context = {
    today: todayIn(epochMs(NOW), 'Europe/Lisbon'),
    now: NOW,
    dateOf: (at: typeof NOW) => todayIn(epochMs(at), 'Europe/Lisbon'),
    idOf: importId,
  };
  const importPlan = planExchangeImport(read.value, { plan, entries: stored }, { venue, addHeld: false }, context);
  const write = applyExchangeImport(stored, importPlan, NOW);
  expect(write.refused).toBeNull();
  await open().write({ entries: write.entries.filter((entry, index) => entry !== stored[index]) });
  const added = write.entries.slice(stored.length);
  const tombstone = write.entries.find((entry) => entry.id === ONE_TAP_OCTOBER.id) as Entry;
  return { plan, entries: write.entries, added, tombstone };
}

describe('idb plan store: the rows a Kraken import writes (docs/DOMAIN.md §3.13)', () => {
  it("this build reads back exactly the rows a Kraken import writes: monthly buys, sales and coins added at 0, source import-csv, version-8 ids, and each replaced estimate's tombstone", async () => {
    const { plan, entries, added, tombstone } = await imported();
    // Every purchase date of a month is its monthly buy (docs/DOMAIN.md §3.13 step 5): the file's three are dca.
    expect(added.map((entry) => entry.kind).sort()).toEqual(['dca', 'dca', 'dca', 'held', 'sell']);
    expect(added.every((entry) => entry.source === 'import-csv' && VERSION_8.test(entry.id))).toBe(true);
    expect(added.find((entry) => entry.kind === 'held')).toMatchObject({ amount: '0', fee: null });
    const { updatedAt: _, ...fields } = ONE_TAP_OCTOBER;
    expect(tombstone).toMatchObject({ ...fields, deletedAt: tombstone.updatedAt });
    expect(tombstone.deletedAt).not.toBeNull();
    const before = await dump();

    const loaded = await open().load();

    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await dump()).toStrictEqual(before);
  });

  it('the previous build (entries v3) reads every row a Kraken import writes, with nothing set aside or counted as newer, and a backup of them passes previousBuildBackupGate', async () => {
    const { plan, entries } = await imported();
    const before = await dump();

    const loaded = await open({ rowVersions: PREVIOUS_BUILD }).load();

    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await dump()).toStrictEqual(before);
    const backup = writtenBackup(exportBackup(loaded.plan ?? plan, loaded.entries, NOW));
    expect(previousBuildBackupGate(backup)).toBeNull();
  });
});

// The same rows from a Trade Republic export: its purchases at the venue Trade Republic, nothing of a new shape.
describe('idb plan store: the rows a Trade Republic import writes (docs/DOMAIN.md §3.13)', () => {
  const trImported = () => imported(TRADE_REPUBLIC_OCTOBER, 'Trade Republic');

  it('this build reads back exactly the rows a Trade Republic import writes', async () => {
    const { plan, entries, added } = await trImported();
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((entry) => entry.source === 'import-csv' && VERSION_8.test(entry.id))).toBe(true);
    expect(new Set(added.map((entry) => entry.venue))).toEqual(new Set(['Trade Republic']));
    const before = await dump();

    const loaded = await open().load();

    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await dump()).toStrictEqual(before);
  });

  it('the previous build (entries v3) reads every row a Trade Republic import writes', async () => {
    const { plan, entries } = await trImported();
    const before = await dump();

    const loaded = await open({ rowVersions: PREVIOUS_BUILD }).load();

    expect(loaded.plan).toStrictEqual(plan);
    expect(loaded.entries).toHaveLength(entries.length);
    expect(loaded.entries).toEqual(expect.arrayContaining([...entries]));
    expect(loaded).toMatchObject({ newer: { plans: 0, entries: 0 }, newerTombstones: 0, quarantined: 0 });
    expect(await dump()).toStrictEqual(before);
    const backup = writtenBackup(exportBackup(loaded.plan ?? plan, loaded.entries, NOW));
    expect(previousBuildBackupGate(backup)).toBeNull();
  });
});
