// @vitest-environment node
// A plan whose currency is not its country's (ADR-0053): a change of country answered `keep` stores one, as the
// prototype import already did. No row version changes for it; the rollback read proves that the build before
// ADR-0053 reads and rewrites such a plan as it is (docs/RELEASE.md, rollback; .claude/rules/app-storage.md).
import 'fake-indexeddb/auto';
import { acknowledge, changeCountry, type EntityId, type Plan } from '@proofofcalm/core';
import { anEntry, aPlan, instant } from '@proofofcalm/core/testing';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME } from './idb/database';
import { type IdbPlanStore, type IdbPlanStoreOptions, idbPlanStore } from './idb-store';
import { EMPTY_SNAPSHOT } from './memory-store';

const NOW = instant('2026-11-09T09:00:00.000Z');
const DEVICE = '0f5c1a3e-8d2b-4c6f-9a7e-1b2c3d4e5f61' as EntityId;
/** The row versions of the build before ADR-0053, frozen: plans and entries at v3 (rows.ts at ee4439e6). */
const PREVIOUS_BUILD = { plans: 3, entries: 3 } as const;
const uk = { ...FIXTURE_RULES.DE, code: 'GB' as Plan['country'], currency: 'GBP' as const };

const opened: IdbPlanStore[] = [];
function open(options: Partial<IdbPlanStoreOptions> = {}): IdbPlanStore {
  const store = idbPlanStore({ clock: { now: () => NOW }, randomUUID: () => DEVICE, ...options });
  opened.push(store);
  return store;
}

async function planRows(): Promise<{ schemaVersion: number; payload: Plan }[]> {
  const db = await openDB(DATABASE_NAME);
  try {
    return await db.getAll('plans');
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

describe('idb plan store: a plan whose currency is not its country’s (ADR-0053)', () => {
  it('this build writes it as a v3 row the previous build reads and rewrites as it is', async () => {
    const plan = changeCountry(acknowledge(aPlan(), 1, NOW), uk, NOW, 'keep').plan;
    const entry = anEntry();
    expect(plan).toMatchObject({ schemaVersion: 3, country: 'GB', payCurrency: 'EUR', displayCurrency: 'EUR' });
    await open().write({ plan, entries: [entry] });
    const [written] = await planRows();
    expect(written).toMatchObject({ schemaVersion: 3, payload: plan });

    const previous = open({ rowVersions: PREVIOUS_BUILD });
    expect(await previous.load()).toStrictEqual({ ...EMPTY_SNAPSHOT, plan, entries: [entry] });
    const edited = { ...plan, why: 'Still in euros.', updatedAt: instant('2026-11-09T10:00:00.000Z') };
    await previous.write({ plan: edited });
    expect((await open().load()).plan).toStrictEqual(edited);
  });
});
