import { expect, type Page } from '@playwright/test';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { test } from './support';

// The Plan screen on the viewport matrix (ROADMAP M1, docs/DESIGN.md §8): the fixture plan (Portugal,
// 365 days) at its two dates with the page's clock fixed, the reference and totals, the timeline as a
// drawing from 48rem and a list below it with the table at every width, the holding line once with the
// country's first condition, the sellable lines only in the sell window, and "Edit plan" opening Settings.

const HOLDING_NOTE = 'Computed from your dates, not tax advice';

async function openPlan(page: Page, phase: FixturePhase) {
  await page.clock.setFixedTime(new Date(fixtureNowMs(phase)));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/plan');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
}

/** True where the timeline is drawn instead of listed: 48rem of the root font size. */
const wide = (page: Page) =>
  page.evaluate(() => {
    const rootPx = Number(getComputedStyle(document.documentElement).fontSize.replace('px', ''));
    return window.innerWidth >= 48 * rootPx;
  });

test('in the buy phase: the plan in its words, the timeline, no sellable lines', async ({ page }) => {
  await openPlan(page, 'buy');
  await expect(page.getByText(/^Your plan buys until/)).toBeVisible();
  await expect(page.getByText(/invested so far/)).toBeVisible();
  await expect(page.getByText(HOLDING_NOTE)).toHaveCount(1);
  await expect(page.getByText(/sellable now/)).toHaveCount(0);
  const timeline = page.locator('[data-slot="timeline"]');
  if (await wide(page)) {
    await expect(timeline.getByRole('img', { name: /is in the buy phase/ })).toBeVisible();
  } else {
    await expect(timeline.locator('[aria-current="date"]')).toBeVisible();
  }
  await expect(timeline.getByText('Show as a table')).toBeVisible();
});

test('in the sell window: one sellable line per coin and the holding line once', async ({ page }) => {
  await openPlan(page, 'sell');
  await expect(page.getByText(/sellable now/)).toHaveCount(2);
  await expect(page.getByText(HOLDING_NOTE)).toHaveCount(1);
  await expect(page.getByText(/Buys left/)).toHaveCount(0);
  if (await wide(page)) {
    await expect(page.getByRole('img', { name: /is in the sell window/ })).toBeVisible();
  }
});

test(`Portugal's counterparty sentence sits beside the first date`, async ({ page }) => {
  await openPlan(page, 'buy');
  await expect(page.getByText(/the counterparty is tax-resident/i)).toBeVisible();
  await page.getByRole('button', { name: 'Show 3 more conditions' }).click();
  await expect(page.getByRole('link', { name: 'Sources' })).toBeVisible();
});

test('Edit plan opens Settings', async ({ page }) => {
  await openPlan(page, 'buy');
  await page.getByRole('link', { name: 'Edit plan' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // The focus moves to the heading of the screen it opens, not to the page (docs/DESIGN.md §6).
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
});
