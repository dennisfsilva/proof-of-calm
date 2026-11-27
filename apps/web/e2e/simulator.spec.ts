import { expect, type Page } from '@playwright/test';
import learn from '../../../packages/app/src/features/learn/messages/en.json' with { type: 'json' };
import { SIMULATOR_DATA_FROM, SIMULATOR_DATASET, SIMULATOR_PATH } from './simulator-fixture';
import { test } from './support';

// The simulator's route and its data states on the viewport matrix (docs/EDUCATION.md §7): reached by its address
// alone while the publish switch's `display` is off. The unpublished state is the server's own answer for the
// dataset's path, a 404 (vercel.json rewrites only the app routes and the API); the published state is a synthetic
// file served by page.route (simulator-fixture.ts).

test.use({ serviceWorkers: 'block' });

const words = learn.simulator;

/** The screen's h1, and its result area no longer busy. */
async function ready(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: words.title, exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="simulator-result"][aria-busy="false"]')).toHaveCount(1);
}

test('with no dataset on the server, the screen says the price history is not published yet', async ({ page }) => {
  const answer = page.waitForResponse((response) => new URL(response.url()).pathname === SIMULATOR_PATH);
  await page.goto('/learn/simulator');
  expect((await answer).status()).toBe(404);
  await ready(page);
  await expect(page.getByText(words.unpublished, { exact: true })).toBeVisible();
  await expect(page.getByText(words.credit, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/learn\/simulator$/);
});

test('with a dataset, the screen gives its first day and the credit line', async ({ page }) => {
  await page.route(`**${SIMULATOR_PATH}`, (route) => route.fulfill({ json: SIMULATOR_DATASET }));
  await page.goto('/learn/simulator');
  await ready(page);
  await expect(page.getByText(SIMULATOR_DATA_FROM, { exact: true })).toBeVisible();
  await expect(page.getByText(words.credit, { exact: true })).toBeVisible();
  await expect(page.getByText(words.unpublished, { exact: true })).toHaveCount(0);
});
