import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { test } from './support';

// Today on the viewport matrix (docs/DOMAIN.md §3.3 to §3.5, §3.11; docs/DESIGN.md §7): before a plan,
// the one sentence with its two links; over the seeded fixture plan on 20 October 2026, October's late
// buy leads with one chip per coin and the one tap, the strip leads to Plan, and the backup banner to
// Settings; "Bought as planned" records it and the toast's Edit opens the new entries; "Skip October 2026"
// skips it and the toast's Undo opens it again; with the day's prices only in another currency than the
// plan's, the one tap records nothing and opens the form for the units. /api/prices is answered by the
// page's route, so nothing reaches CoinGecko. Every flow runs in light and dark, at 125 % text on the
// zoom-125 project (support.ts).

test.use({ serviceWorkers: 'block' });

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

type Prices = Readonly<Record<string, Readonly<Record<string, string>>>>;
const BOTH: Prices = { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } };

/** The fixture plan on 20 October 2026, both coins priced (in EUR and USD by default): October's buy (5 October) is late. */
async function lateOctober(page: Page, prices: Prices = BOTH) {
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(nowMs - 30_000).toISOString(), prices } }),
  );
  await seedPlan(page, fixtureSnapshot());
  await ready(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('without a plan: one "No plan yet" and the two ways in', async ({ page }) => {
      await page.goto('/today');
      await ready(page);
      await expect(page.getByText('No plan yet')).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Set up a plan' })).toHaveAttribute('href', '/onboarding');
      await expect(page.getByRole('link', { name: 'import a file' })).toHaveAttribute('href', '/settings');
    });

    test('a late month leads, with its chips, the one tap, the strip and the backup banner', async ({ page }) => {
      await lateOctober(page);
      await expect(page.getByRole('heading', { level: 2, name: 'October 2026 is still open' })).toBeVisible();
      await expect(page.getByText('Buy day was 5 Oct 2026, 15 days ago. Record it or skip the month.')).toBeVisible();
      await expect(page.getByRole('list', { name: 'Planned split' }).getByRole('listitem')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Bought as planned' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bought a different amount' })).toBeVisible();
      await expect(page.getByText('Portfolio value')).toBeVisible();
      await expect(page.locator('[data-slot="progress-strip-today"]')).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Export a copy.' })).toHaveAttribute('href', '/settings');

      await page.getByRole('link', { name: 'Your plan' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    });

    test('Bought as planned records October, and the toast’s Edit opens the new entries', async ({ page }) => {
      await lateOctober(page);
      await page.getByRole('button', { name: 'Bought as planned' }).click();
      const recorded = page.getByRole('heading', { level: 2, name: 'October 2026 is recorded' });
      await expect(recorded).toBeFocused();
      await expect(page.getByText(/^Recorded: 100,00\s€ on 20\sOct\s2026\.$/u)).toBeVisible();

      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Edit the entry' });
      await expect(sheet.getByRole('textbox', { name: 'BTC cost before fees (EUR)' })).toHaveValue('70,00');
      await expect(sheet.getByRole('textbox', { name: 'ETH cost before fees (EUR)' })).toHaveValue('30,00');
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    });

    test('Skip October 2026 skips the month with a note, and the toast’s Undo opens it again', async ({ page }) => {
      await lateOctober(page);
      await page.getByRole('button', { name: 'Skip October 2026' }).click();
      const sheet = page.getByRole('dialog', { name: 'Skip October 2026' });
      await sheet.getByRole('textbox', { name: 'Note (optional)' }).fill('car repair');
      await sheet.getByRole('button', { name: 'Skip October 2026' }).click();
      await expect(sheet).toBeHidden();
      const skipped = page.getByRole('heading', { level: 2, name: 'October 2026 is skipped' });
      await expect(skipped).toBeFocused();
      await expect(page.getByText('October 2026 skipped.')).toBeVisible();

      await page.getByRole('button', { name: 'Undo' }).click();
      const open = page.getByRole('heading', { level: 2, name: 'October 2026 is still open' });
      await expect(open).toBeFocused();
      await expect(page.getByRole('button', { name: 'Skip October 2026' })).toBeVisible();
    });

    // A EUR plan with the day's prices only in USD: the one tap converts nothing (docs/DOMAIN.md §3.4: a price in the pay currency or none),
    // writes nothing, and the form opens on the plan's amounts with the units left to type.
    test('the one tap refuses prices in another currency', async ({ page }) => {
      await lateOctober(page, { BTC: { USD: '70000' }, ETH: { USD: '2900' } });
      await page.getByRole('button', { name: 'Bought as planned' }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toContainText('Log the monthly buy');
      await expect(sheet.getByRole('textbox', { name: 'BTC cost before fees (EUR)' })).toHaveValue('70,00');
      await expect(sheet.getByRole('textbox', { name: 'BTC received (units)' })).toHaveValue('');
      await expect(sheet.getByRole('textbox', { name: 'ETH received (units)' })).toHaveValue('');
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('heading', { level: 2, name: 'October 2026 is still open' })).toBeVisible();
      await expect(page.locator('[data-slot="toast"]:not([hidden])')).toHaveCount(0);
    });
  });
}
