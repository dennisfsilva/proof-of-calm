import { expect, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { type EntryRow, entryRow, type PlanRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import type { Snapshot } from '@proofofcalm/app/lib/ports';

// A plan in the browser's store for a spec (e.g. `fixtureSnapshot()` from lib/services/fixtures): the
// rows are built here, in Node, by the store's own row builders, and put into the database the app has
// already opened, then the page reloads and the services read them as any stored plan.
//
// The device id: the rows carry a fixed id, not the one in this device's `meta` store (a fresh device
// has none until its first write). The store only compares row stamps for sync, so a foreign id is
// what an imported or synced row would carry. Nothing goes to the outbox: a seeded plan is not a write
// waiting for sync. The prefs are left as they are.
const SEED_DEVICE_ID = '00000000-0000-4000-8000-00000000e2e0' as Parameters<typeof planRow>[1];

type Rows = { readonly plans: PlanRow[]; readonly entries: EntryRow[] };

export async function seedPlan(page: Page, snapshot: Snapshot): Promise<void> {
  const screenArea = page.locator('main#main');
  await page.goto('/today');
  await expect(screenArea).not.toHaveAttribute('aria-busy', 'true');
  const { plan } = snapshot;
  const rows: Rows = {
    plans: plan === null ? [] : [planRow(plan, SEED_DEVICE_ID)],
    entries: snapshot.entries.map((entry) => entryRow(entry, plan?.id ?? null, SEED_DEVICE_ID)),
  };
  await page.evaluate(
    async ({ name, rows }) => {
      // No version: the database opens at the version the app created, so no upgrade runs here.
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['plans', 'entries'], 'readwrite');
        for (const row of rows.plans) transaction.objectStore('plans').put(row);
        for (const row of rows.entries) transaction.objectStore('entries').put(row);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { name: DATABASE_NAME, rows },
  );
  await page.reload();
  await expect(screenArea).not.toHaveAttribute('aria-busy', 'true');
}
