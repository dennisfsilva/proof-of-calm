import { expect, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { type EntryRow, entryRow, type PlanRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { DEFAULT_PREFS, type Prefs } from '@proofofcalm/core';

// A plan in the browser's store for a spec (e.g. `fixtureSnapshot()` from lib/services/fixtures): the
// rows are built here, in Node, by the store's own row builders, and put into the database the app has
// already opened, then the page reloads and the services read them as any stored plan.
//
// The device id: the rows carry a fixed foreign id, as an older build's rows would; the reload's open
// stamps them with the local id, as it does every row it reads (ADR-0019 Readings, 2026-11-24). The prefs are left as they are, unless the spec passes
// some: then the defaults with those fields go in under the store's one prefs key, `'device'` (PREFS_KEY
// in packages/app/src/lib/adapters/idb-store.ts:46), in the same transaction.
const SEED_DEVICE_ID = '00000000-0000-4000-8000-00000000e2e0' as Parameters<typeof planRow>[1];

type Rows = { readonly plans: PlanRow[]; readonly entries: EntryRow[] };

export async function seedPlan(page: Page, snapshot: Snapshot, prefs?: Partial<Prefs>): Promise<void> {
  const screenArea = page.locator('main#main');
  await page.goto('/today');
  await expect(screenArea).not.toHaveAttribute('aria-busy', 'true');
  const { plan } = snapshot;
  const rows: Rows = {
    plans: plan === null ? [] : [planRow(plan, SEED_DEVICE_ID)],
    entries: snapshot.entries.map((entry) => entryRow(entry, plan?.id ?? null, SEED_DEVICE_ID)),
  };
  await page.evaluate(
    async ({ name, rows, prefs }) => {
      // No version: the database opens at the version the app created, so no upgrade runs here.
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['plans', 'entries', 'prefs'], 'readwrite');
        for (const row of rows.plans) transaction.objectStore('plans').put(row);
        for (const row of rows.entries) transaction.objectStore('entries').put(row);
        if (prefs !== null) transaction.objectStore('prefs').put(prefs, 'device');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { name: DATABASE_NAME, rows, prefs: prefs === undefined ? null : { ...DEFAULT_PREFS, ...prefs } },
  );
  await page.reload();
  await expect(screenArea).not.toHaveAttribute('aria-busy', 'true');
}
