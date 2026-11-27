import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import learn from '../../../packages/app/src/features/learn/messages/en.json' with { type: 'json' };
import { seedPlan } from './seed';
import {
  SIMULATOR_DATA_FROM,
  SIMULATOR_DATASET,
  SIMULATOR_ETH,
  SIMULATOR_PATH,
  SIMULATOR_SOL,
  simulatorPath,
} from './simulator-fixture';
import { test } from './support';

// The simulator's route on the viewport matrix (docs/EDUCATION.md §7): reached by its address alone while the
// publish switch's `display` is off. The unpublished state is the server's own answer for a dataset's path, a 404
// (vercel.json rewrites only the app routes and the API); a published coin is a synthetic file served by page.route
// (simulator-fixture.ts), and a coin left unrouted answers the server's 404 too.

test.use({ serviceWorkers: 'block' });

const words = learn.simulator;
const RUN = { name: words.form.run };

/** Serves the synthetic files of the coins given; every other coin's path reaches the server. */
async function serve(page: Page, files: readonly { readonly coin: string }[]) {
  for (const file of files) {
    await page.route(`**${simulatorPath(file.coin)}`, (route) => route.fulfill({ json: file }));
  }
}

/** The screen's h1, and its area no longer busy. */
async function ready(page: Page) {
  await page.goto('/learn/simulator');
  await expect(page.getByRole('heading', { level: 1, name: words.title, exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="simulator-result"][aria-busy="false"]')).toHaveCount(1);
}

const share = (page: Page, coin: string) => page.getByRole('textbox', { name: `${coin} share (%)` });
const amount = (page: Page) => page.getByRole('textbox', { name: 'Monthly amount (EUR)' });
const result = (page: Page) => page.getByRole('heading', { level: 2, name: words.result.heading });
const multiple = (page: Page) =>
  page.locator('dt', { hasText: words.result.multiple }).locator('xpath=following-sibling::dd[1]');

/** Runs and reads the multiple, after the result heading has taken the focus. */
async function run(page: Page): Promise<string> {
  await page.getByRole('button', RUN).click();
  await expect(result(page)).toBeFocused();
  return (await multiple(page).textContent()) ?? '';
}

/** Presses Tab, a bounded number of times, until `target` holds the focus. */
async function tabTo(page: Page, target: Locator) {
  const focused = () => target.evaluate((element) => element === document.activeElement);
  for (let step = 0; step < 80 && !(await focused()); step += 1) await page.keyboard.press('Tab');
  await expect(target).toBeFocused();
}

test('with no dataset on the server, the screen says the price history is not published yet', async ({ page }) => {
  const answer = page.waitForResponse((response) => new URL(response.url()).pathname === SIMULATOR_PATH);
  await ready(page);
  expect((await answer).status()).toBe(404);
  await expect(page.getByText(words.unpublished, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', RUN)).toHaveCount(0);
  await expect(page.getByText(words.credit, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/learn\/simulator$/);
});

test("with BTC's dataset, the form gives the data's first day under the start, and no credit before a run", async ({
  page,
}) => {
  await serve(page, [SIMULATOR_DATASET]);
  await ready(page);
  await expect(page.getByText(SIMULATOR_DATA_FROM, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', RUN)).toBeVisible();
  await expect(page.getByText(words.credit, { exact: true })).toHaveCount(0);
});

test('a run, then a changed split and changed dates, each run again, give different multiples', async ({ page }) => {
  await serve(page, [SIMULATOR_DATASET, SIMULATOR_SOL]);
  await ready(page);
  await page.getByRole('button', { name: 'Add Bitcoin' }).click();
  await share(page, 'Bitcoin').fill('100');
  await amount(page).fill('100');
  const first = await run(page);
  await expect(page.getByText(words.credit, { exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: 'Add Solana' }).click();
  await expect(result(page)).toHaveCount(0);
  await share(page, 'Bitcoin').fill('50');
  await share(page, 'Solana').fill('50');
  const second = await run(page);
  expect(second).not.toBe(first);

  await page.getByLabel(words.form.start, { exact: true }).fill('2024-10-01');
  await expect(result(page)).toHaveCount(0);
  const third = await run(page);
  expect(third).not.toBe(second);
});

test('a coin whose file answers 404 at a share above 0 is marked on its row and takes the focus', async ({ page }) => {
  await serve(page, [SIMULATOR_DATASET]);
  const answer = page.waitForResponse((response) => new URL(response.url()).pathname === simulatorPath('ETH'));
  await ready(page);
  await page.getByRole('button', { name: 'Add Bitcoin' }).click();
  await page.getByRole('button', { name: 'Add Ethereum' }).click();
  expect((await answer).status()).toBe(404);
  await share(page, 'Bitcoin').fill('50');
  await share(page, 'Ethereum').fill('50');
  await amount(page).fill('100');
  await expect(page.getByText(/^No reference closes for Ethereum yet\./)).toBeVisible();
  await page.getByRole('button', RUN).click();
  await expect(share(page, 'Ethereum')).toBeFocused();
  await expect(result(page)).toHaveCount(0);
});

test('Fill in from your plan copies the stored plan, and the result says the purchases are on Portfolio', async ({
  page,
}) => {
  await seedPlan(page, fixtureSnapshot());
  await serve(page, [SIMULATOR_DATASET, SIMULATOR_ETH]);
  await ready(page);
  await page.getByRole('button', { name: words.form.fill }).click();
  await expect(share(page, 'Bitcoin')).toHaveValue('70');
  await expect(share(page, 'Ethereum')).toHaveValue('30');
  // The seeded plan's number format writes the decimal separator (ADR-0034).
  await expect(amount(page)).toHaveValue(/^100[.,]00$/);
  await run(page);
  await expect(page.getByText(words.result.portfolio, { exact: true })).toBeVisible();
});

test('the form and Run work by keyboard alone, and the result heading takes the focus', async ({ page }) => {
  await serve(page, [SIMULATOR_DATASET]);
  await ready(page);
  await tabTo(page, page.getByRole('button', { name: 'Add Bitcoin' }));
  await page.keyboard.press('Enter');
  await expect(share(page, 'Bitcoin')).toBeFocused();
  await page.keyboard.type('100');
  await tabTo(page, amount(page));
  await page.keyboard.type('100');
  await tabTo(page, page.getByRole('button', RUN));
  await page.keyboard.press('Enter');
  await expect(result(page)).toBeFocused();
  await expect(multiple(page)).not.toBeEmpty();
});
