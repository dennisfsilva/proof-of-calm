import { truncate, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, IMPORT_MAX_BYTES, type Instant, type Plan } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { cspViolations, recordCspViolations, routeFixturePrices, test } from './support';

// Settings → Currency & data → Import an exchange's file (docs/DOMAIN.md §3.13, docs/CONTENT-STYLE.md §3). On the
// viewport matrix: a EUR plan of BTC 70 % and ETH 30 % from 1 Dec 2025, with nothing logged, takes the core's
// synthetic Kraken ledger (packages/core/test/exchange/kraken-synthetic.expected.ts reads its rows): its preview's
// heading takes the focus and counts December's BTC and ETH, January's BTC and ETH bought on 18 and 19 Dec, the extra
// buy of 16 Dec, the sale and the invite bonus; Import writes them at Kraken and its result line takes the focus;
// the same file again adds nothing. No CSP violation on the way. On desktop, the alerts of a file the import does not
// take: a ZIP, Kraken's Trades export, a CSV of another format, a ledger's header alone, a ledger with no plan, and a
// file past the size limit.

test.use({ serviceWorkers: 'block' });

const NOW = Date.parse('2026-01-20T10:00:00Z');
const LEDGER = fileURLToPath(
  new URL('../../../packages/core/test/exchange/kraken-synthetic-2025-12.csv', import.meta.url),
);
const LEDGER_HEADER = 'txid,refid,time,type,subtype,aclass,subclass,asset,wallet,amount,fee,balance';
const at = (day: string) => `${day}T18:00:00+01:00` as Instant;

/** The fixture plan moved to the ledger's months: buy day 1 from December 2025, no starting amount, nothing logged. */
function ledgerPlan(): Plan {
  const plan = fixtureSnapshot().plan as Plan;
  return {
    ...plan,
    startingAmount: '0' as Plan['startingAmount'],
    firstBuy: '2025-12-01' as CalendarDate,
    buyDay: 1,
    lastBuy: '2026-11-01' as CalendarDate,
    skips: [],
    createdAt: at('2025-11-20'),
    updatedAt: at('2025-11-20'),
  };
}

/** Opens Currency & data at NOW, with the ledger's plan seeded unless `plan` is false. */
async function openData(page: Page, plan = true) {
  await page.clock.setFixedTime(new Date(NOW));
  await routeFixturePrices(page, NOW);
  if (plan) await seedPlan(page, { ...fixtureSnapshot(), plan: ledgerPlan(), entries: [] });
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

const fileInput = (page: Page) => page.locator('input[type="file"]');
const preview = (page: Page) => page.getByRole('region', { name: 'What this file adds' });

test('a Kraken ledger previews, imports at Kraken, and adds nothing the second time', async ({ page }) => {
  await page.addInitScript(recordCspViolations);
  await openData(page);
  await expect(page.getByText('Exchange exports Proof of Calm reads, as CSV: Kraken (Ledgers).')).toBeVisible();

  await fileInput(page).setInputFiles(LEDGER);
  const heading = page.getByRole('heading', { name: 'What this file adds' });
  await expect(heading).toBeFocused();
  await expect(preview(page)).toContainText(
    'kraken-synthetic-2025-12.csv: a Kraken ledger of 47 rows, from 1 Dec 2025 to 28 Dec 2025.',
  );
  await expect(preview(page)).toContainText(
    'Adds 7 entries: 4 monthly buys, 1 extra buy, 1 sale, and 1 Coins added entry at no cost.',
  );
  for (const section of ['Monthly buys (4)', 'Extra buys (1)', 'Sales (1)', 'Coins added at no cost (1)'])
    await expect(preview(page).getByRole('button', { name: section })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Venue for these entries' })).toHaveValue('Kraken');

  await preview(page).getByRole('button', { name: 'Import 7 entries' }).click();
  const result = page.getByRole('status').filter({ hasText: 'Entries added: 7.' });
  await expect(result).toBeFocused();
  await expect(preview(page)).toHaveCount(0);

  // The same file chosen again on the same screen, as a person would: the browser fires no change event for a
  // selection that equals the input's current one, so the section must have emptied the input after reading it.
  await fileInput(page).setInputFiles(LEDGER);
  await expect(heading).toBeFocused();
  await expect(preview(page)).toContainText('Nothing to add from this file.');
  await expect(preview(page)).toContainText('Imported earlier, not added: 7.');
  await expect(preview(page).getByRole('button', { name: /^Import/u })).toHaveCount(0);
  expect(await page.evaluate(cspViolations)).toEqual([]);

  // The Log holds the seven, newest first, each at Kraken: the sale's sheet names the venue.
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  const rows = page.getByRole('row').getByRole('button', { name: /Dec 2025/u });
  const names = [
    '19 Dec 2025 Monthly buy ETH',
    '18 Dec 2025 Monthly buy BTC',
    '16 Dec 2025 Extra buy BTC',
    '7 Dec 2025 Coins added BTC',
    '4 Dec 2025 Sale BTC',
    '2 Dec 2025 Monthly buy ETH',
    '1 Dec 2025 Monthly buy BTC',
  ];
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) await expect(rows.nth(index)).toHaveAccessibleName(name);
  await page.getByRole('button', { name: '4 Dec 2025 Sale BTC' }).click();
  await page.getByRole('button', { name: 'Edit entry' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('textbox', { name: /^Venue/u })).toHaveValue('Kraken');
  expect(await page.evaluate(cspViolations)).toEqual([]);
});

test.describe('a file the exchange import does not take', () => {
  test.beforeEach(({ page: _ }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
    test.skip(testInfo.project.name !== 'desktop', 'the alerts do not depend on the viewport');
  });

  /** Chooses a file of `text` named `name` and returns the alert. */
  async function choose(page: Page, name: string, text: string | Buffer) {
    await fileInput(page).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    const alert = page.getByRole('alert');
    await expect(alert).toBeFocused();
    await expect(preview(page)).toHaveCount(0);
    return alert;
  }

  test('a ZIP, the Trades export, another CSV and a header alone each have their alert', async ({ page }) => {
    await openData(page);
    const zip = await choose(page, 'ledgers.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]));
    await expect(zip).toHaveText('This is a ZIP file. Open it, then choose the CSV file inside.');
    const trades = await choose(page, 'trades.csv', 'txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol\n');
    await expect(trades).toHaveText(
      "This is Kraken's Trades export. Export the Ledgers from Kraken instead, then import that file.",
    );
    const other = await choose(page, 'other.csv', 'date,description,amount\n2025-12-01,coffee,3.20\n');
    await expect(other).toContainText("Choose a Proof of Calm backup, an export from the DCA plan page, or Kraken's");
    const header = await choose(page, 'ledgers.csv', `${LEDGER_HEADER}\n`);
    await expect(header).toHaveText(
      'This Kraken ledger has no rows, so nothing was imported. Export the Ledgers again for a period with transactions.',
    );
  });

  test('a ledger with no plan asks for one', async ({ page }) => {
    await openData(page, false);
    await fileInput(page).setInputFiles(LEDGER);
    await expect(page.getByRole('alert')).toHaveText(
      'This Kraken ledger needs a plan for its coins, currency, and months. Set up a plan, then choose the file again.',
    );
    await expect(preview(page)).toHaveCount(0);
  });

  test('a file one byte past the limit is not read', async ({ page }, testInfo) => {
    const path = testInfo.outputPath('large.csv');
    await writeFile(path, `${LEDGER_HEADER}\n`);
    await truncate(path, IMPORT_MAX_BYTES + 1);
    await openData(page);
    await fileInput(page).setInputFiles(path);
    const alert = page.getByRole('alert');
    await expect(alert).toBeFocused();
    await expect(alert).toHaveText(/^This file is larger than 50\sMB, so it was not read\./u);
  });
});
