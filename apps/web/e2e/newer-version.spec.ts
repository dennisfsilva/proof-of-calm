import { expect, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { type EntryRow, entryRow, type PlanRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { test } from './support';

// Rows a newer build wrote, on the viewport matrix (ADR-0019 Readings, "Row shape"; docs/RELEASE.md,
// Versioning; docs/CONTENT-STYLE.md, Newer version): this build reads plans and entries up to v3, so a
// plan row and an entry row at v4 bring the full newer-version screen, and an entry row at v4 beside a
// plan this build reads brings the one line above Today. The rows are built by the store's own row
// builders, as `seed.ts` does, then raised to v4 with a payload this build does not know.

const SEED_DEVICE_ID = '00000000-0000-4000-8000-00000000e2e1' as Parameters<typeof planRow>[1];
const NEWER = { schemaVersion: 4, payload: { shape: 'a newer build' } } as const;

type Rows = { readonly plans: readonly PlanRow[]; readonly entries: readonly unknown[] };

const screenArea = (page: Page) => page.locator('main#main');

/** Puts `rows` into the database the app has opened, then reloads, as `seedPlan` does. */
async function seedRows(page: Page, rows: Rows): Promise<void> {
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(
    async ({ name, rows }) => {
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
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
}

const fixtureRows = () => {
  const { plan, entries } = fixtureSnapshot();
  if (plan === null) throw new Error('the fixture holds a plan');
  const [first, ...rest] = entries.map((entry): EntryRow => entryRow(entry, plan.id, SEED_DEVICE_ID));
  if (first === undefined) throw new Error('the fixture holds entries');
  return { plan: planRow(plan, SEED_DEVICE_ID), first, rest };
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
});

test('a plan and an entry a newer version saved bring the newer-version screen', async ({ page }) => {
  const { plan, first } = fixtureRows();
  await seedRows(page, { plans: [{ ...plan, ...NEWER }], entries: [{ ...first, ...NEWER }] });

  await expect(
    page.getByRole('heading', { name: 'Your plan was saved by a newer version of Proof of Calm.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'This version cannot open it, so it stays as it was saved. Reload the page to open it in the newer version.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'If this screen comes back after the reload, your plan stays on this device, unread; a newer version of Proof of Calm can open it.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your data could not be opened.' })).toHaveCount(0);
});

test('an entry a newer version saved, beside a plan this version reads, brings the line above Today', async ({
  page,
}) => {
  const { plan, first, rest } = fixtureRows();
  await seedRows(page, { plans: [plan], entries: [{ ...first, ...NEWER }, ...rest] });

  await expect(
    page.getByText(
      '1 entry was saved by a newer version of Proof of Calm, so it is not shown here. Reload the page to see it.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your plan was saved by a newer version of Proof of Calm.' }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your data could not be opened.' })).toHaveCount(0);
});
