import { expect, type Locator, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { exportBackup, type Instant, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// Settings → Currency & data, "Delete everything" on the viewport matrix (docs/CONTENT-STYLE.md "Delete the
// plan", ADR-0019 Readings): the plan goes at once and the toast's Undo brings it back; once the toast is gone
// a reload finds the device empty. Both destructive dialogs open on their safe button, so a tap or Enter
// right after the opening animation never deletes or replaces anything.

const fixture = fixtureSnapshot();
const live = fixture.entries.filter((entry) => entry.deletedAt === null).length;

async function openData(page: Page) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixture);
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  // The zoom-125 project runs this flow at 125 % text too, not only the matrix (docs/ENGINEERING.md §3).
  if (test.info().project.name === 'zoom-125') await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

/** Waits until every animation of the dialog has finished, so the focus is where it stays. */
async function settled(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((each) => each.finished)),
  );
}

/** The rows left in the plan and entry stores of this browser's database. */
function storedRows(page: Page): Promise<number> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (store: string) =>
      new Promise<number>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const total = (await count('plans')) + (await count('entries'));
    database.close();
    return total;
  }, DATABASE_NAME);
}

async function deletePlan(page: Page) {
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete this plan and its ${live} entries?` });
  await settled(dialog);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog).toBeHidden();
}

test('Delete everything deletes the plan at once, and Undo brings it back', async ({ page }) => {
  await openData(page);
  await deletePlan(page);
  await expect(page.getByText('Plan deleted.')).toBeVisible();
  await expect(page.getByText(/^Nothing to export yet\./)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeVisible();
  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('button', { name: 'Export JSON backup' })).toBeVisible();
});

test('after the undo window a reload finds the device empty', async ({ page }) => {
  await openData(page);
  await deletePlan(page);
  const toast = page.getByText('Plan deleted.');
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: UNDO_WINDOW_MS + 4000 });
  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/^Nothing to export yet\./)).toBeVisible();
  expect(await storedRows(page)).toBe(0);
});

test('neither destructive dialog opens on its destructive button', async ({ page }) => {
  await openData(page);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const remove = page.getByRole('dialog', { name: `Delete this plan and its ${live} entries?` });
  await settled(remove);
  await expect(remove.getByRole('button', { name: 'Delete everything' })).not.toBeFocused();
  await expect(remove.getByRole('button', { name: 'Keep this plan' })).toBeFocused();
  await remove.getByRole('button', { name: 'Keep this plan' }).click();
  await expect(remove).toBeHidden();

  if (fixture.plan === null) throw new Error('the fixture has a plan');
  const backup = exportBackup(
    fixture.plan,
    fixture.entries.slice(0, 2),
    `${FIXTURE_DATES.buy}T10:00:00.000Z` as Instant,
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Replace everything' }).click();
  const replace = page.getByRole('dialog', { name: `Replace this plan and its ${live} entries?` });
  await settled(replace);
  await expect(replace.getByRole('button', { name: 'Replace everything' })).not.toBeFocused();
  await expect(replace.getByRole('button', { name: 'Keep this plan' })).toBeFocused();
});
