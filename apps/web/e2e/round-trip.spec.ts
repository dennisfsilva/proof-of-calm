import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { applyTextZoom, test } from './support';

// Flows across Settings, the Log, Plan and Portfolio on the viewport matrix (docs/DOMAIN.md §3.13,
// docs/CONTENT-STYLE.md §3 "Import a file"): the JSON backup this device exports, imported on a fresh
// device (a second browser context, which takes the project's options) or back here after "Delete
// everything", shows the same screens; "Add missing entries only" keeps a deletion and a new entry made
// here since the export; "Replace everything" over a changed plan asks first and its "Export a copy first"
// saves a file. A deletion in the Log stays undone after a reload, and stays deleted once the toast is gone.
// /api/prices is answered by each page's route, so nothing reaches CoinGecko.

test.use({ serviceWorkers: 'block' });

const fixture = fixtureSnapshot();
const live = fixture.entries.filter((entry) => entry.deletedAt === null).length;
const toast = (page: Page) => page.locator('[data-slot="toast"]:not([hidden])');
const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

/** The page's clock at the fixture's buying-phase date, and both coins priced. */
async function atBuyDate(page: Page) {
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
}

/** Settings → Currency & data; without a plan the screen opens on it. */
async function openData(page: Page) {
  await page.goto('/settings');
  await ready(page);
  const tab = page.getByRole('tab', { name: 'Currency & data' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

/** Saves the file a click on `button` downloads, under its suggested name, and returns its path. */
async function download(page: Page, testInfo: TestInfo, button: string): Promise<string> {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  const file = await event;
  expect(file.suggestedFilename()).toBe(`proof-of-calm-backup-${FIXTURE_DATES.buy}.json`);
  // One file per button, so a second export in the test keeps the first.
  const path = testInfo.outputPath(`${button.replaceAll(' ', '-')}.json`);
  await file.saveAs(path);
  return path;
}

/** Chooses the file at `path` through the import's file picker. */
async function chooseFile(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles(path);
}

/** What the Log, Plan and Portfolio show, each once Portugal's rules format it (pt-PT, ADR-0034). */
async function screens(page: Page) {
  await page.goto('/log');
  await ready(page);
  await expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toContainText(/100,00/u);
  const log = await page.locator('main#main').textContent();
  await page.goto('/plan');
  await ready(page);
  await expect(page.getByText('Computed from your dates, not tax advice')).toBeVisible();
  const plan = await page.locator('main#main').textContent();
  await page.goto('/portfolio');
  await ready(page);
  const holdings = page.getByRole('table', { name: 'Holdings' });
  await expect(holdings.getByRole('button')).toHaveText(['BTC', 'ETH']);
  await expect(holdings).toContainText(/\d,\d{2}\s€/u);
  const portfolio = await holdings.textContent();
  return { log, plan, portfolio };
}

/** The Log's row of the fixture's one extra purchase. */
const extraRow = (page: Page) => page.getByRole('button', { name: /Extra buy/ });

async function deleteExtra(page: Page) {
  await page.goto('/log');
  await ready(page);
  await extraRow(page).click();
  await page.getByRole('button', { name: 'Delete entry' }).click();
  // The toast can rise under the click, and a pointer resting on it holds its window by design.
  await page.mouse.move(0, 0);
  await expect(toast(page)).toContainText('Entry deleted.');
  await expect(extraRow(page)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await atBuyDate(page);
  await seedPlan(page, fixture);
});

test('a backup exported here and imported on a fresh device shows the same Log, Portfolio and Plan', async ({
  page,
  browser,
}, testInfo) => {
  await openData(page);
  const backup = await download(page, testInfo, 'Export JSON backup');
  const here = await screens(page);

  const device = await browser.newContext();
  try {
    const there = await device.newPage();
    // Opened here, not by `test`: the fresh device takes the zoom-125 project's text zoom itself.
    await applyTextZoom(there, testInfo);
    expect(there.viewportSize()).toEqual(page.viewportSize());
    await atBuyDate(there);
    await openData(there);
    await expect(there.getByText(/^Nothing to export yet\./)).toBeVisible();
    await chooseFile(there, backup);
    await there.getByRole('button', { name: 'Import this backup' }).click();
    await expect(there.getByText(`Plan imported. Entries now: ${live}.`)).toBeVisible();
    expect(await screens(there)).toEqual(here);
  } finally {
    await device.close();
  }
});

test('Delete everything, the undo window passing, then the exported backup brings every entry back', async ({
  page,
}, testInfo) => {
  await openData(page);
  const backup = await download(page, testInfo, 'Export JSON backup');
  const before = await screens(page);

  await openData(page);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete this plan and its ${live} entries?` });
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Plan deleted.')).toBeVisible();
  await expect(page.getByText('Plan deleted.')).toBeHidden({ timeout: UNDO_WINDOW_MS + 4000 });
  await page.reload();
  await ready(page);
  await expect(page.getByText(/^Nothing to export yet\./)).toBeVisible();

  await chooseFile(page, backup);
  await page.getByRole('button', { name: 'Import this backup' }).click();
  await expect(page.getByText(`Plan imported. Entries now: ${live}.`)).toBeVisible();
  expect(await screens(page)).toEqual(before);
});

test('Add missing entries only, after a delete and a new entry here: the delete holds, the new entry stays, and the result lines count both', async ({
  page,
}, testInfo) => {
  await openData(page);
  const backup = await download(page, testInfo, 'Export JSON backup');

  await deleteExtra(page);
  await expect(toast(page)).toBeHidden({ timeout: UNDO_WINDOW_MS + 4000 });
  // October's monthly buy, which the backup does not hold: one entry per coin.
  await page.getByRole('button', { name: 'Record a purchase' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Log the monthly buy');
  await sheet.getByLabel('BTC received (units)').fill('0.0012');
  await sheet.getByLabel('ETH received (units)').fill('0.012');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(toast(page)).toContainText('Recorded:');

  await openData(page);
  await chooseFile(page, backup);
  await page.getByRole('button', { name: 'Add missing entries only' }).click();
  // The backup's live entries: all but the deleted one are here already, and the deleted one stays deleted.
  const result = page.getByText(`Entries added: 0. Already in this plan, not added: ${live - 1}.`);
  await expect(result).toBeVisible();
  await expect(page.getByText('Deleted earlier on this device, not added: 1.')).toBeVisible();

  await page.goto('/log');
  await ready(page);
  await expect(extraRow(page)).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toContainText('Oct');
});

test('Replace everything over a changed plan asks first, Export a copy first saves a file, then the backup takes its place', async ({
  page,
}, testInfo) => {
  await openData(page);
  const backup = await download(page, testInfo, 'Export JSON backup');

  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByLabel('Monthly amount (EUR)').fill('250');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await chooseFile(page, backup);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  const dialog = page.getByRole('dialog', { name: `Replace this plan and its ${live} entries?` });
  await expect(dialog).toBeVisible();
  const copy = await download(page, testInfo, 'Export a copy first');
  const saved: unknown = JSON.parse(await readFile(copy, 'utf8'));
  // The copy holds the changed plan, the one the replace removes.
  expect(saved).toMatchObject({ format: 'proof-of-calm', plan: { monthlyAmount: '250' } });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace everything' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Plan replaced. Entries now: ${live}.`)).toBeVisible();

  await page.goto('/plan');
  await ready(page);
  await expect(page.getByText(/then 100,00\s€ a month on day 5/u)).toBeVisible();
});

test('Undo in the Log then a reload keeps the entry', async ({ page }) => {
  await deleteExtra(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(extraRow(page)).toHaveCount(1);
  await page.reload();
  await ready(page);
  await expect(extraRow(page)).toHaveCount(1);
});

test('the undo window passing then a reload keeps it deleted', async ({ page }) => {
  await deleteExtra(page);
  await expect(toast(page)).toBeHidden({ timeout: UNDO_WINDOW_MS + 4000 });
  await page.reload();
  await ready(page);
  await expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toBeVisible();
  await expect(extraRow(page)).toHaveCount(0);
});
