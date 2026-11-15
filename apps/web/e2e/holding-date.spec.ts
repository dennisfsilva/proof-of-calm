import { expect, type Page } from '@playwright/test';
import { test } from './support';

// The holding-date tool (docs/research/holding-date-tool.md; ADR-0045 Deviations of 2026-11-15): a script island on
// the prerendered page. The inputs live in the fragment, which no request carries; the result states a date only;
// the form is in the first paint, hidden without script, and posts nowhere (`method="dialog"`). Every test listens
// for CSP violations from the first script on, because WebKit refuses some controls under the hashed policy that
// Chromium allows, and csp.spec.ts runs on desktop only. Desktop and iphone: the island does not depend on more.

const PATH = '/en/holding-date';
const INPUTS = /bought=|country=|2027-03-01|2024-02-29/;

let requests: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the projects this flow leaves out, not a disabled test
  test.skip(!['desktop', 'iphone'].includes(testInfo.project.name), 'the island runs the same on every viewport');
  requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
});

const violations = (page: Page) => page.evaluate(() => (window as unknown as { violations: string[] }).violations);
const dateField = (page: Page) => page.getByLabel('Purchase date');
const submit = (page: Page) => page.getByRole('button', { name: 'Show the date' });
const invalidHint = (page: Page) => page.locator('#holding-invalid');
const noCountryHint = (page: Page) => page.locator('#holding-no-country');
const result = (page: Page, code: string) => page.locator(`[aria-live="polite"] [data-country="${code}"]`);

/** The page with its island started: the form is shown and the boot script has loaded the island's module. */
async function open(page: Page, hash = '') {
  await page.goto(`${PATH}${hash}`);
  await expect(page.locator('script[type="module"][src^="/assets/islands/holding-date-"]')).toHaveCount(1);
  await expect(page.locator('form[method="dialog"]')).toHaveAttribute('data-ready', '');
}

test('a submit writes the inputs into the fragment, shows the date, and sends neither anywhere', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Portugal' }).check();
  await dateField(page).fill('2027-03-01');
  await submit(page).click();
  await expect(page).toHaveURL(/\/en\/holding-date#country=pt&bought=2027-03-01$/);
  const pt = result(page, 'pt');
  await expect(pt).toBeVisible();
  await expect(pt.getByText(/^Tax-free from 29\sFeb\s2028$/u)).toBeVisible();
  await expect(pt.getByText(/^For a purchase on 1\sMar\s2027$/u)).toBeVisible();
  await expect(pt.getByText('Computed from your dates, not tax advice')).toBeVisible();
  await expect(pt.getByRole('link', { name: /^Sources/ })).toBeVisible();
  await expect(pt.locator('time[data-from]')).toHaveAttribute('datetime', '2028-02-29');
  await expect(page.locator('[aria-live="polite"] [data-country]:visible')).toHaveCount(1);
  expect(requests.filter((url) => INPUTS.test(url))).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('the fragment URL opened fresh shows the result, a lower-rate rule with its own words', async ({ page }) => {
  await open(page, '#country=de&bought=2024-02-29');
  await expect(page.getByRole('radio', { name: 'Germany' })).toBeChecked();
  await expect(dateField(page)).toHaveValue('2024-02-29');
  await expect(result(page, 'de').getByText(/^Tax-free from 1\sMar\s2025$/u)).toBeVisible();
  await page.goto(`${PATH}#country=us&bought=2024-02-29`);
  await expect(result(page, 'us').getByText(/^Long-term rate from 1\sMar\s2025$/u)).toBeVisible();
  await expect(result(page, 'de')).toBeHidden();
  expect(requests.filter((url) => INPUTS.test(url))).toEqual([]);
  expect(await violations(page)).toEqual([]);
});

test('#country=de, as the country page links it, preselects Germany and shows no result yet', async ({ page }) => {
  await page.goto('/en/countries/de');
  await page.getByRole('link', { name: 'Show the date a purchase passes this holding rule' }).click();
  await expect(page).toHaveURL(/\/en\/holding-date#country=de$/);
  await expect(page.locator('form[method="dialog"]')).toHaveAttribute('data-ready', '');
  await expect(page.getByRole('radio', { name: 'Germany' })).toBeChecked();
  await expect(page.locator('[aria-live="polite"] [data-country]:visible')).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
});

test('a country whose rule sets no period shows its rule text, with no date', async ({ page }) => {
  await open(page, '#country=fr&bought=2025-06-01');
  const fr = result(page, 'fr');
  await expect(fr).toBeVisible();
  await expect(fr.locator('[data-effect]:visible')).toHaveCount(0);
  await expect(fr.locator('time:visible')).toHaveCount(0);
});

test('each hint shows under its field, marks it and takes the focus, and a valid submit clears both', async ({
  page,
}) => {
  await open(page);
  await submit(page).click();
  await expect(noCountryHint(page)).toHaveText('Choose a country.');
  await expect(invalidHint(page)).toHaveText(/^Choose a purchase date from 3\sJan\s2009 to \d{1,2}\s\w{3}\s\d{4}\.$/u);
  await expect(page.getByRole('radio').first()).toBeFocused();
  await expect(dateField(page)).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('radio', { name: 'Germany' }).check();
  await dateField(page).fill('2008-12-31');
  await submit(page).click();
  await expect(noCountryHint(page)).toBeHidden();
  await expect(invalidHint(page)).toBeVisible();
  await expect(dateField(page)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  await dateField(page).fill('2024-02-29');
  await submit(page).click();
  await expect(invalidHint(page)).toBeHidden();
  await expect(noCountryHint(page)).toBeHidden();
  await expect(dateField(page)).not.toHaveAttribute('aria-invalid');
  await expect(result(page, 'de')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// A hint means the inputs on screen are not the ones an earlier result answered, so that result is hidden.
test('a hint after a result hides the result: the date cleared', async ({ page }) => {
  await open(page, '#country=pt&bought=2027-03-01');
  await expect(result(page, 'pt')).toBeVisible();
  await dateField(page).fill('');
  await submit(page).click();
  await expect(invalidHint(page)).toBeVisible();
  await expect(page.locator('[aria-live="polite"] [data-country]:visible')).toHaveCount(0);
});

test('a hint after a result hides the result: no country chosen', async ({ page }) => {
  await open(page, '#country=pt&bought=2027-03-01');
  await expect(result(page, 'pt')).toBeVisible();
  // A checked radio cannot be unchecked by a click; the state is set as a form reset would leave it.
  await page.evaluate(() => {
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="country"]')) radio.checked = false;
  });
  await submit(page).click();
  await expect(noCountryHint(page)).toBeVisible();
  await expect(page.locator('[aria-live="polite"] [data-country]:visible')).toHaveCount(0);
});

// Hints belong to a submit: a fragment read on the same page (typed in the address bar, or Back) clears them first.
test('a fragment changed after the date hint clears the hint and shows its result', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'Germany' }).check();
  await submit(page).click();
  await expect(invalidHint(page)).toBeVisible();
  await expect(dateField(page)).toHaveAttribute('aria-invalid', 'true');
  await page.evaluate(() => {
    location.hash = '#country=pt&bought=2027-03-01';
  });
  await expect(result(page, 'pt').getByText(/^Tax-free from 29\sFeb\s2028$/u)).toBeVisible();
  await expect(invalidHint(page)).toBeHidden();
  await expect(noCountryHint(page)).toBeHidden();
  await expect(dateField(page)).not.toHaveAttribute('aria-invalid');
  expect(await violations(page)).toEqual([]);
});

test('a fragment changed after the no-country hint clears the hint and shows its result', async ({ page }) => {
  await open(page);
  await dateField(page).fill('2027-03-01');
  await submit(page).click();
  await expect(noCountryHint(page)).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#country=pt&bought=2027-03-01';
  });
  await expect(result(page, 'pt').getByText(/^Tax-free from 29\sFeb\s2028$/u)).toBeVisible();
  await expect(noCountryHint(page)).toBeHidden();
  await expect(invalidHint(page)).toBeHidden();
  await expect(dateField(page)).not.toHaveAttribute('aria-invalid');
  expect(await violations(page)).toEqual([]);
});

test('with the boot script removed, a submit leaves the URL unchanged', async ({ page }) => {
  await page.route(`**${PATH}`, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    await route.fulfill({ response, body });
  });
  await page.goto(PATH);
  await expect(page.locator('script')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Portugal' }).check();
  await dateField(page).fill('2027-03-01');
  await submit(page).click();
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  await expect(result(page, 'pt')).toBeHidden();
  expect(requests.filter((url) => INPUTS.test(url))).toEqual([]);
});

// A worker built before the `pages` route dropped the fragment kept a navigation under its full URL, and WebKit
// keeps that first key on a later put of the bare page. Seeded before the current worker is registered, which deletes
// every `pages` key holding a fragment when it activates and keeps the others. The page registers it as the app does
// (`register.ts`), without navigating: in the local Windows WebKit a page's Cache Storage writes did not survive one.
test('the worker deletes a pages key with a fragment that an earlier worker left, and keeps the others', async ({
  page,
}) => {
  await page.goto(PATH);
  await page.evaluate(async () => {
    const pages = await caches.open('pages');
    const html = () => new Response('<!doctype html><title>kept</title>', { headers: { 'content-type': 'text/html' } });
    await pages.put('/en/holding-date#country=pt&bought=2026-03-01', html());
    await pages.put('/en/countries/pt', html());
  });
  const keys = () =>
    page.evaluate(async () =>
      (await (await caches.open('pages')).keys()).map((key) => new URL(key.url).pathname + new URL(key.url).hash),
    );
  expect(await keys()).toContain('/en/holding-date#country=pt&bought=2026-03-01');

  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(keys).not.toContainEqual(expect.stringContaining('#'));
  expect(await keys()).toContain('/en/countries/pt');
});

test.describe('with script off', () => {
  test.use({ javaScriptEnabled: false });

  test('the tool is hidden and the list of rules shown', async ({ page }) => {
    await page.goto(PATH);
    await expect(page.locator('form')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Holding rules by country' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Portugal', exact: true })).toBeVisible();
  });
});

// The form is in the first paint and the result region keeps its height, so neither the island starting nor a
// result from the fragment moves the page (Chromium's Layout Instability API; WebKit has none).
for (const [name, hash] of [
  ['the bare page', ''],
  ['a fragment load', '#country=pt&bought=2027-03-01'],
] as const) {
  test(`${name} shifts its layout by less than 0.01`, async ({ page, browserName }) => {
    // biome-ignore lint/suspicious/noSkippedTests: the API exists only in Chromium
    test.skip(browserName !== 'chromium', 'the Layout Instability API exists only in Chromium');
    await open(page, hash);
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let sum = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) sum += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(sum)));
        }),
    );
    expect(shift).toBeLessThan(0.01);
  });
}
