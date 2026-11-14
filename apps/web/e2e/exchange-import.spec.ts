import { readFile, truncate, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { zipOf } from '@proofofcalm/app/lib/adapters/zip.testing';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, IMPORT_MAX_BYTES, type Instant, type Plan } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { cspViolations, recordCspViolations, routeFixturePrices, test } from './support';

// Settings → Currency & data → Import an exchange's file (docs/DOMAIN.md §3.13, docs/CONTENT-STYLE.md §3). On the
// viewport matrix: a EUR plan of BTC 70 % and ETH 30 % from 1 Dec 2025, with nothing logged, takes the core's
// synthetic Kraken ledger (packages/core/test/exchange/kraken-synthetic.expected.ts reads its rows): its preview's
// heading takes the focus and counts December's BTC and ETH, January's BTC and ETH bought on 18 and 19 Dec, the extra
// buy of 16 Dec, the sale and the invite bonus; Import writes them at Kraken and its result line takes the focus;
// the same file again adds nothing. No CSP violation on the way. The core's synthetic Trade Republic export, over the
// same plan moved to May 2026, previews in Trade Republic's words, imports at Trade Republic and adds nothing the
// second time. A ZIP of the ledger previews as the ledger does. On
// desktop, the alerts of a file the import does not take: a ZIP of two CSVs, Kraken's Trades export, a CSV of another format, a ledger's header alone, a ledger with no plan, and a
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

/** Opens Currency & data at `now`, with the ledger's plan (or `plan`) seeded unless `plan` is false. */
async function openData(page: Page, plan: Plan | false = ledgerPlan(), now = NOW) {
  await page.clock.setFixedTime(new Date(now));
  await routeFixturePrices(page, now);
  if (plan) await seedPlan(page, { ...fixtureSnapshot(), plan, entries: [] });
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
  await expect(
    page.getByText(
      'Exchange exports Proof of Calm reads, as CSV or ZIP: Kraken (Ledgers), Trade Republic (Transaction export).',
    ),
  ).toBeVisible();

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

const TR_EXPORT = fileURLToPath(
  new URL('../../../packages/core/test/exchange/trade-republic-synthetic.csv', import.meta.url),
);
const TR_NOW = Date.parse('2026-07-20T10:00:00Z');

test('a Trade Republic export previews, imports at Trade Republic, and adds nothing the second time', async ({
  page,
}) => {
  await page.addInitScript(recordCspViolations);
  // The ledger's plan moved to the export's months: buy day 1 from May 2026.
  const plan = { ...ledgerPlan(), firstBuy: '2026-05-01' as CalendarDate, lastBuy: '2027-04-01' as CalendarDate };
  await openData(page, plan, TR_NOW);

  await fileInput(page).setInputFiles(TR_EXPORT);
  const heading = page.getByRole('heading', { name: 'What this file adds' });
  await expect(heading).toBeFocused();
  await expect(preview(page)).toContainText(
    'trade-republic-synthetic.csv: a Trade Republic transaction export of 16 rows, from 2 May 2026 to 4 Jul 2026.',
  );
  await expect(page.getByRole('textbox', { name: 'Venue for these entries' })).toHaveValue('Trade Republic');
  await preview(page)
    .getByRole('button', { name: /^Left out/u })
    .click();
  await expect(preview(page)).toContainText('Trade Republic benefit credit, such as Saveback, money paid to you');
  await expect(preview(page)).not.toContainText('Kraken');

  const button = preview(page).getByRole('button', { name: /^Import \d+ entr/u });
  const added = ((await button.textContent()) ?? '').replace(/\D/gu, '');
  await button.click();
  const result = page.getByRole('status').filter({ hasText: `Entries added: ${added}.` });
  await expect(result).toBeFocused();

  await fileInput(page).setInputFiles(TR_EXPORT);
  await expect(heading).toBeFocused();
  await expect(preview(page)).toContainText('Nothing to add from this file.');
  await expect(preview(page)).toContainText(`Imported earlier, not added: ${added}.`);
  await expect(preview(page).getByRole('button', { name: /^Import/u })).toHaveCount(0);
  expect(await page.evaluate(cspViolations)).toEqual([]);

  // A purchase in the Log names Trade Republic as its venue.
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page
    .getByRole('row')
    .getByRole('button', { name: /2026 (Monthly|Extra) buy BTC/u })
    .first()
    .click();
  await page.getByRole('button', { name: 'Edit entry' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Venue and note' }).click();
  await expect(sheet.getByRole('textbox', { name: /^Venue/u })).toHaveValue('Trade Republic');
});

test('a ZIP of the ledger previews', async ({ page }) => {
  await openData(page);
  const archive = zipOf([{ name: 'kraken/ledgers.csv', data: await readFile(LEDGER) }]);
  await fileInput(page).setInputFiles({
    name: 'kraken.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: 'What this file adds' })).toBeFocused();
  await expect(preview(page)).toContainText('kraken.zip: a Kraken ledger of 47 rows, from 1 Dec 2025 to 28 Dec 2025.');
  await expect(preview(page).getByRole('button', { name: 'Import 7 entries' })).toBeVisible();
});

test('a month recorded in another tab after the preview showed refuses Import and shows the new preview', async ({
  page,
  context,
}, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
  test.skip(testInfo.project.name !== 'desktop', 'the race does not depend on the viewport');
  await openData(page);
  await fileInput(page).setInputFiles(LEDGER);
  await expect(page.getByRole('heading', { name: 'What this file adds' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Venue for these entries' }).fill('Kraken Pro');
  await expect(preview(page)).not.toContainText('Replaces');
  // This tab hears the other tab's write on the cross-tab channel, as its snapshot does.
  const heard = page.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        const channel = new BroadcastChannel(name);
        channel.onmessage = () => resolve();
      }),
    DATABASE_NAME,
  );

  const other = await context.newPage();
  await other.clock.setFixedTime(new Date(NOW));
  await routeFixturePrices(other, NOW);
  await other.goto('/today');
  await expect(other.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await other.getByRole('button', { name: 'Bought as planned' }).click();
  await expect(other.getByRole('status').filter({ hasText: /^Recorded: /u })).toBeVisible();
  await other.close();
  await heard;
  // The snapshot reloads after the message: the preview shown stays the one the person reviewed.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  await expect(preview(page)).not.toContainText('Replaces');

  await preview(page).getByRole('button', { name: 'Import 7 entries' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(
    'The plan or the Log changed after this preview was made, so nothing was imported. The preview ' +
      'now shows what the file adds: check it, then import.',
  );
  await expect(alert).toBeFocused();
  await expect(preview(page)).toContainText(/Replaces \d+ estimates? from Bought as planned\./u);
  await expect(page.getByRole('textbox', { name: 'Venue for these entries' })).toHaveValue('Kraken Pro');
  await expect(page.getByRole('status').filter({ hasText: 'Entries added' })).toHaveCount(0);

  // The Log holds the month recorded in the other tab and nothing from the file.
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('row').getByRole('button', { name: /Dec 2025/u })).toHaveCount(0);
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

  test('a ZIP of two CSVs has its alert', async ({ page }) => {
    await openData(page);
    const ledger = await readFile(LEDGER);
    const archive = zipOf([
      { name: 'ledgers.csv', data: ledger },
      { name: 'trades.csv', data: 'txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol\n' },
    ]);
    const zip = await choose(page, 'kraken.zip', Buffer.from(archive));
    await expect(zip).toHaveText(
      'This ZIP file holds more than one CSV file, so it was not read. Open it, then choose the CSV file of ' +
        "Kraken's Ledgers export.",
    );
  });

  test('the Trades export, another CSV and a header alone each have their alert', async ({ page }) => {
    await openData(page);
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
