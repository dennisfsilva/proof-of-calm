import { expect, type Page } from '@playwright/test';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { type EntryRow, entryRow, type PlanRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { templateById } from '@proofofcalm/content';
import { exportBackup, type Instant } from '@proofofcalm/core';
import { chooseCountry, test } from './support';

// Rows this build cannot read, on the viewport matrix (ADR-0019, Quarantine, and its Readings of 2026-11-26):
// an entry row with a payload that fails validation is set aside on load, so Today and the Log say so under
// their titles until a backup's Add missing entries only brings it back, or Hide this line hides both; a plan
// row set aside changes NoPlan's words and the Log's empty text, and onboarding over it asks which currency the
// kept entries were paid in (ADR-0053 Readings, 2026-11-26). The rows are built by the store's own row builders,
// as `newer-version.spec.ts` does, then given a payload no schema reads.

const SEED_DEVICE_ID = '00000000-0000-4000-8000-00000000e2e1' as Parameters<typeof planRow>[1];
const UNREADABLE = { payload: { shape: 'unreadable' } } as const;
const TODAY_LINE =
  '1 saved entry could not be read, so Today and Portfolio leave it out. The Log says how to bring it back.';
const LOG_LINE = /^1 saved entry could not be read, so it is not in this list\. To bring it back, import a JSON backup/;

type Rows = { readonly plans: readonly PlanRow[]; readonly entries: readonly unknown[] };

const screenArea = (page: Page) => page.locator('main#main');
const fixture = fixtureSnapshot();

/** Puts `rows` into the database the app has opened, then reloads, as `newer-version.spec.ts` does. */
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

/** The fixture's plan and entry rows with one live entry's row unreadable. */
function withUnreadableEntry(): Rows {
  const { plan, entries } = fixture;
  if (plan === null) throw new Error('the fixture holds a plan');
  const rows = entries.map((entry): EntryRow => entryRow(entry, plan.id, SEED_DEVICE_ID));
  const live = entries.findIndex((entry) => entry.deletedAt === null);
  return {
    plans: [planRow(plan, SEED_DEVICE_ID)],
    entries: rows.map((row, index) => (index === live ? { ...row, ...UNREADABLE } : row)),
  };
}

async function openLog(page: Page) {
  await page.getByRole('link', { name: 'Log' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
});

test('an unreadable entry brings the lines on Today and the Log, and Add missing entries only ends them', async ({
  page,
}) => {
  await seedRows(page, withUnreadableEntry());
  await expect(page.getByText(TODAY_LINE)).toBeVisible();
  await openLog(page);
  await expect(page.getByText(LOG_LINE)).toBeVisible();
  // A new record gets a new id and never ends the line, so recording is the way back only without a backup.
  await expect(page.getByText(LOG_LINE)).toContainText(
    'with Add missing entries only. Without one, record it again, then hide this line.',
  );
  await expect(page.getByRole('button', { name: 'Hide this line' })).toBeVisible();

  if (fixture.plan === null) throw new Error('the fixture holds a plan');
  const backup = exportBackup(fixture.plan, fixture.entries, `${FIXTURE_DATES.buy}T09:00:00.000Z` as Instant);
  await page.goto('/settings');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByText(/^1 saved item could not be read, so Proof of Calm set it aside\./)).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Add missing entries only' }).click();
  await expect(page.getByText(/^Entries added: 1\./)).toBeVisible();

  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText(TODAY_LINE)).toHaveCount(0);
  await openLog(page);
  await expect(page.getByText(LOG_LINE)).toHaveCount(0);
});

test('Hide this line hides the Log line and the Today line and moves focus to the Log title', async ({ page }) => {
  await seedRows(page, withUnreadableEntry());
  await openLog(page);
  await page.getByRole('button', { name: 'Hide this line' }).click();
  await expect(page.getByText(LOG_LINE)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeFocused();
  await page.reload();
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();
  await expect(page.getByText(LOG_LINE)).toHaveCount(0);
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText(TODAY_LINE)).toHaveCount(0);
});

test('an unreadable plan row changes the no-plan words on Today and the Log', async ({ page }) => {
  const { plan, entries } = fixture;
  if (plan === null) throw new Error('the fixture holds a plan');
  await seedRows(page, {
    plans: [{ ...planRow(plan, SEED_DEVICE_ID), ...UNREADABLE }],
    entries: entries.map((entry) => entryRow(entry, plan.id, SEED_DEVICE_ID)),
  });
  await expect(page.getByRole('heading', { name: 'Your plan could not be read' })).toBeVisible();
  await expect(page.getByText('It stays on this device as it was saved.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import a JSON backup' })).toHaveAttribute('href', '/settings');
  await expect(page.getByText('No plan yet')).toHaveCount(0);
  await openLog(page);
  const text = page.getByText(
    'Your plan could not be read, so no entries are listed. They stay on this device. Import a JSON backup in Settings to bring the plan back.',
  );
  await expect(text).toBeVisible();
  await expect(text.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
});

/** The fixture's entries under its plan row set aside, the row's payload `payload` (ADR-0053 Readings, 2026-11-26). */
function withPlanRowSetAside(payload: unknown): Rows {
  const { plan, entries } = fixture;
  if (plan === null) throw new Error('the fixture holds a plan');
  return {
    plans: [{ ...planRow(plan, SEED_DEVICE_ID), payload } as PlanRow],
    entries: entries.map((entry) => entryRow(entry, plan.id, SEED_DEVICE_ID)),
  };
}

/** From onboarding's country to its summary on the two-coins template, the reminder for later. */
async function toSummary(page: Page, country?: string) {
  await page.goto('/onboarding');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await chooseCountry(page, country === undefined ? {} : { country, confirm: `Continue with the ${country}` });
  await page.getByRole('radio', { name: templateById('two-coins')?.name ?? 'two-coins', exact: true }).click();
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.click();
  await page.getByLabel(/^Monthly amount/).fill('100');
  await page.getByLabel(/^Last buy/).fill('2036-10-01');
  await next.click();
  await expect(page.getByRole('heading', { level: 2, name: 'In one sentence, why are you doing this?' })).toBeFocused();
  await next.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Where should the monthly reminder go?' })).toBeFocused();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Check your plan' })).toBeFocused();
}

const START = 'Accept and start the plan';

test('onboarding over an unreadable plan row asks with four cards and starts in the answered currency', async ({
  page,
}) => {
  await seedRows(page, withPlanRowSetAside(UNREADABLE.payload));
  await toSummary(page);
  const cards = page.getByRole('radio');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveAccessibleName(/^Paid in EUR/);
  for (const card of await cards.all()) await expect(card).not.toBeChecked();
  await page.getByRole('button', { name: START }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose the currency they were paid in.');
  await expect(cards.first()).toBeFocused();

  await page.getByRole('radio', { name: /^Paid in USD/ }).click();
  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(screenArea(page)).toContainText('US$');
  await expect(screenArea(page)).not.toContainText('€');
});

test('the United Kingdom over a plan row kept in EUR asks with two cards, Paid in EUR first', async ({ page }) => {
  const { plan } = fixture;
  if (plan === null) throw new Error('the fixture holds a plan');
  await seedRows(
    page,
    withPlanRowSetAside({ ...(planRow(plan, SEED_DEVICE_ID).payload as object), coins: 'unreadable' }),
  );
  await toSummary(page, 'United Kingdom');
  const cards = page.getByRole('radio');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAccessibleName(/^Paid in EUR/);
  await expect(cards.nth(1)).toHaveAccessibleName(/^Paid in GBP/);
  await expect(
    page.getByText('They were saved with a plan that could not be read. That plan was in EUR.'),
  ).toBeVisible();

  await cards.first().click();
  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(screenArea(page)).toContainText('€');
  await expect(screenArea(page)).not.toContainText('£');
});

// An import with no plan asks before the file's plan shows the kept entries in its currency (ADR-0053 Readings,
// 2026-11-26): Do not import writes nothing, gives the focus back to the button that asked, and the plan row stays
// set aside with its entries in EUR.
test('a GBP backup over a readable EUR row asks first, and Do not import keeps the EUR entries', async ({ page }) => {
  const { plan } = fixture;
  if (plan === null) throw new Error('the fixture holds a plan');
  await seedRows(
    page,
    withPlanRowSetAside({ ...(planRow(plan, SEED_DEVICE_ID).payload as object), coins: 'unreadable' }),
  );
  const gbp = exportBackup(
    { ...plan, payCurrency: 'GBP', displayCurrency: 'GBP' },
    [],
    `${FIXTURE_DATES.buy}T09:00:00.000Z` as Instant,
  );
  await page.goto('/settings');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({
    name: 'gbp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(gbp)),
  });
  const opener = page.getByRole('button', { name: 'Import this backup' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(/^Show \d+ saved entries in GBP\?$/);
  await expect(dialog).toContainText(
    'They hold amounts or fees in EUR, the currency of your plan that could not be read.',
  );
  await expect(dialog.getByRole('button', { name: 'Do not import' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Do not import' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByText(/^Plan imported\./)).toHaveCount(0);

  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'Your plan could not be read' })).toBeVisible();
});
