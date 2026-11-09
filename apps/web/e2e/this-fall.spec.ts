import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The fall page on the viewport matrix (docs/EDUCATION.md §6, docs/CONTENT-STYLE.md §3): during a fall of the held
// coins Learn opens with the page's row and the row opens the page, whose figure's Why? opens When the market drops in
// the sheet, and that module's route links back to the page; with no fall under way the row is not there and the
// page's path gives the module in its place; a history that cannot be loaded leaves the failure line in the figure's
// place. The fixture plan holds coins on the buying phase's date, and the closes come from fixtures.

test.use({ serviceWorkers: 'block' });

const TITLE = 'The fall under way and your plan';
const NOW_MS = fixtureNowMs('buy');

type Shape = Parameters<typeof routeFixturePrices>[2];

async function seed(page: Page, shape: Shape) {
  await page.clock.setFixedTime(new Date(NOW_MS));
  await routeFixturePrices(page, NOW_MS, shape);
  await seedPlan(page, fixtureSnapshot());
}

/** The screen's own h1, and the screen area no longer busy. */
async function ready(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator('main#main[aria-busy="true"]')).toHaveCount(0);
}

for (const shape of ['week-fall', 'high-fall'] as const) {
  test(`during a ${shape}, Learn's row opens the page with the figure, the earlier falls and the next buy day`, async ({
    page,
  }) => {
    await seed(page, shape);
    await page.goto('/learn');
    await ready(page, 'Learn');
    await page.getByRole('link', { name: new RegExp(`^${TITLE}`) }).click();
    await ready(page, TITLE);
    await expect(page).toHaveURL(/\/learn\/fall-under-way$/);
    await expect(page.getByText(/below (its|their) 90-day high/)).toBeVisible();
    await expect(page.getByText(/Price data by CoinGecko$/)).toBeVisible();
    await expect(page.getByText(/^Earlier falls of Bitcoin/)).toBeVisible();
    await expect(page.getByText(/^Your next buy day is |^Today, .* is your buy day\.$/)).toBeVisible();
  });
}

test("during a fall, the figure's Why? opens the module in the sheet, and the module's route links to the page", async ({
  page,
}) => {
  await seed(page, 'week-fall');
  await page.goto('/learn/fall-under-way');
  await ready(page, TITLE);
  await page.getByRole('button', { name: 'Why? The fall under way' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/^A monthly buyer can do nothing, log the buy on the buy day/)).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'See its figures' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/learn\/fall-under-way$/);
  await page.goto('/learn/when-the-market-drops');
  await ready(page, 'When the market drops');
  await page.getByRole('link', { name: 'See its figures' }).click();
  await ready(page, TITLE);
});

test('with no fall under way Learn has no row for the page, and its path gives the module', async ({ page }) => {
  await seed(page, 'rise');
  await page.goto('/learn');
  await ready(page, 'Learn');
  await expect(page.getByRole('link', { name: new RegExp(`^${TITLE}`) })).toHaveCount(0);
  await page.goto('/learn/fall-under-way');
  await ready(page, 'When the market drops');
  await expect(page).toHaveURL(/\/learn\/when-the-market-drops$/);
  await expect(page.getByRole('link', { name: 'See its figures' })).toHaveCount(0);
});

test('a price history that cannot be loaded leaves the failure line in the figure’s place', async ({ page }) => {
  await seed(page, 'week-fall');
  await page.route('**/api/history/*', (route) => route.fulfill({ status: 502 }));
  await page.goto('/learn/fall-under-way');
  await ready(page, TITLE);
  await expect(page.getByText(/^The price history could not be loaded/)).toBeVisible();
  await expect(page.getByText(/Price data by CoinGecko/)).toHaveCount(0);
});
