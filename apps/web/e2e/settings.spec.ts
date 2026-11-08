import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { exportBackup, type Instant } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// Settings → Currency & data on the viewport matrix (docs/DOMAIN.md §3.13): the JSON backup and the CSV log download
// under their dated names, the fixture's own backup added as "missing entries only" adds nothing, and
// "Replace everything" over the plan asks first, then replaces it; on a device with no plan the one button
// "Import this backup" takes the backup's plan without asking. After an import the result line has the focus,
// as the button that ran it is gone. A file from the DCA plan page imports through the same buttons, or with no
// plan through the country step, and the report lists what the import adjusted.

const fixture = fixtureSnapshot();

async function openSettings(page: Page, { seed = true } = {}) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  if (seed) await seedPlan(page, fixture);
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  // With a plan the screen opens on the Plan tab; without one, on Currency & data.
  if (seed) await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

async function openPlanTab(page: Page, tab: 'Plan' | 'Coins & split' | 'Hold & sell') {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixture);
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: tab }).click();
}

// Settings → Plan, Coins & split and Hold & sell (docs/DOMAIN.md §6 "Edit the plan"): a saved change shows on
// Plan, or in the tab after a reload.
test('edits the monthly amount, saves it, and Plan shows it', async ({ page }) => {
  await openPlanTab(page, 'Plan');
  // The fixture plan is Portugal's, so amounts read in pt-PT (ADR-0034).
  const monthly = page.getByLabel('Monthly amount (EUR)');
  await expect(monthly).toHaveValue('100,00');
  await monthly.fill('250');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(monthly).toHaveValue('250,00');
  await page.goto('/plan');
  await expect(page.getByText(/then 250,00\s€ a month on day 5/u)).toBeVisible();
});

test('adds a coin, sets the split, saves both, and Plan shows them', async ({ page }) => {
  await openPlanTab(page, 'Coins & split');
  await page.getByRole('button', { name: 'Add Solana' }).click();
  await page.getByLabel('Bitcoin share (%)').fill('50');
  await page.getByLabel('Solana share (%)').fill('20');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.goto('/plan');
  await expect(page.getByText(/a month on day 5: BTC 50\s?%, ETH 30\s?%, SOL 20\s?%/)).toBeVisible();
});

test("saves an own holding rule, then goes back to the country's", async ({ page }) => {
  await openPlanTab(page, 'Hold & sell');
  const country = page.getByRole('radio', { name: "Portugal's rule" });
  const own = page.getByRole('radio', { name: 'Your own rule' });
  await expect(country).toHaveAttribute('aria-checked', 'true');
  await own.click();
  await page.getByLabel('Days').fill('730');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Hold & sell' }).click();
  await expect(own).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Days')).toHaveValue('730');
  await country.click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Hold & sell' }).click();
  await expect(country).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Days')).toHaveCount(0);
});

test('moves the sell window, saves it, and the tab shows it after a reload', async ({ page }) => {
  await openPlanTab(page, 'Hold & sell');
  await expect(page.getByRole('radio', { name: 'A sell window' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Opens')).toHaveValue('2029-09-01');
  await page.getByLabel('Opens').fill('2029-10-01');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Hold & sell' }).click();
  await expect(page.getByLabel('Opens')).toHaveValue('2029-10-01');
});

test('saves a last buy that opens the sell window early only once the person accepts it', async ({ page }) => {
  await openPlanTab(page, 'Plan');
  // The fixture's window opens on 1 Sep 2029; a last buy in 2030 passes its 365 days in 2031.
  await page.getByLabel('Last buy').fill('2030-01-05');
  await expect(
    page.getByText(
      /^The sell window opens on .+\. This last buy is .+ from .+\. You can also choose an earlier last buy\.$/,
    ),
  ).toBeVisible();
  const accept = page.getByRole('checkbox', { name: /^Open the sell window on .+, before this last buy passes / });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(accept).toBeFocused();
  await expect(accept).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Changes saved.')).toHaveCount(0);

  await accept.click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.reload();
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(page.getByLabel('Last buy')).toHaveValue('2030-01-05');
  // The stored acceptance holds for this last buy: the tab asks nothing more.
  await expect(accept).toHaveCount(0);
});

/** The fixture plan's backup with its first `count` entries, chosen through the file picker. */
async function chooseBackup(page: Page, count: number) {
  if (fixture.plan === null) throw new Error('the fixture has a plan');
  const backup = exportBackup(
    fixture.plan,
    fixture.entries.slice(0, count),
    `${FIXTURE_DATES.buy}T10:00:00.000Z` as Instant,
  );
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
}

test('exports the JSON backup and the CSV log under their dated names', async ({ page }) => {
  await openSettings(page);
  // The export line's own Risk link: About below the tabs carries another with the same name and target.
  const exportLine = page.getByText(/^Exports are generated by Proof of Calm from your own entries; not advice\./);
  await expect(exportLine).toBeVisible();
  await expect(exportLine.getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
  const json = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  expect((await json).suggestedFilename()).toBe(`proof-of-calm-backup-${FIXTURE_DATES.buy}.json`);
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV log' }).click();
  expect((await csv).suggestedFilename()).toBe(`proof-of-calm-log-${FIXTURE_DATES.buy}.csv`);
});

test('Add missing entries only adds nothing the device already holds', async ({ page }) => {
  await openSettings(page);
  await chooseBackup(page, fixture.entries.length);
  await expect(
    page.getByText(
      new RegExp(
        `^backup\\.json, exported on \\d{1,2}\\s\\w+\\s\\d{4}\\. Entries in this backup: ${fixture.entries.length}\\.$`,
      ),
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add missing entries only' }).click();
  const result = page.getByText(`Entries added: 0. Already in this plan, not added: ${fixture.entries.length}.`);
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
});

test('Replace everything over a plan asks first, then replaces it', async ({ page }) => {
  await openSettings(page);
  await chooseBackup(page, 2);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  const live = fixture.entries.filter((entry) => entry.deletedAt === null).length;
  const dialog = page.getByRole('dialog', { name: `Replace this plan and its ${live} entries?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Export a copy first' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace everything' }).click();
  await expect(dialog).toBeHidden();
  const result = page.getByText('Plan replaced. Entries now: 2.');
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
});

test('Import this backup on a device with no plan takes the backup without asking', async ({ page }) => {
  await openSettings(page, { seed: false });
  await expect(page.getByText('Nothing to export yet. Set up a plan or import a file.')).toBeVisible();
  await chooseBackup(page, 2);
  await expect(page.getByRole('button', { name: 'Replace everything' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Import this backup' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Plan imported. Entries now: 2.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON backup' })).toBeVisible();
});

// The golden two-coins export of the DCA plan page (18 purchases), with a tax note the import leaves out.
const prototypeFile = {
  ...JSON.parse(readFileSync(new URL('../../../packages/core/test/golden/two-coins.json', import.meta.url), 'utf8'))
    .state,
};
prototypeFile.settings = { ...prototypeFile.settings, taxNote: 'Ask the accountant.' };

async function choosePrototype(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({
    name: 'DCA-Plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(prototypeFile)),
  });
  await expect(
    page.getByText('DCA-Plan.json, exported from the DCA plan page. Purchases in this file: 18.'),
  ).toBeVisible();
}

const taxNoteLine = "The file's tax note was not imported. Copy it from the DCA plan page if you want to keep it.";

test('a file from the DCA plan page replaces the plan after the dialog, and lists what it adjusted', async ({
  page,
}) => {
  await openSettings(page);
  await choosePrototype(page);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Replace everything' }).click();
  await expect(dialog).toBeHidden();
  const result = page.getByText('Plan replaced. Entries now: 18.');
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(page.getByRole('listitem').filter({ hasText: taxNoteLine })).toBeVisible();
});

test('a file from the DCA plan page on a device with no plan asks for the country, then imports', async ({ page }) => {
  await openSettings(page, { seed: false });
  await choosePrototype(page);
  await expect(page.getByRole('button', { name: 'Import this backup' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Where do you live?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Portugal' }).click();
  await expect(page.getByText('Plan imported. Entries now: 18.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: taxNoteLine })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON backup' })).toBeVisible();
});
