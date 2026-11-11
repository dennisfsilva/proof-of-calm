import { type BrowserContext, expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The annual review page on the viewport matrix (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page
// (M2)"; docs/DESIGN.md §6 "Focus after an action", "Focus on a route change"): the seeded fixture plan, set up
// on 5 April 2026, on 20 October 2026. A direct load and an offline reload of /plan/review show the page; Plan's
// `Review the plan` opens it with the focus on its h1; `Mark as reviewed` moves the focus to the result line,
// and a reload counts from the review. The matrix spec lays the page out on every project in light and dark.
// /api/prices and /api/history are answered by routes, so nothing reaches CoinGecko: the page's, with the
// worker blocked, and the context's for the offline reload, since the worker's own requests pass the page's by.

const NOW_MS = fixtureNowMs('buy');
const SET_UP = /^You set up this plan on 5\sApr\s2026\.$/u;

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
const title = (page: Page) => page.getByRole('heading', { level: 1, name: 'Review the plan' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW_MS));
});

/** The context's answers for the worker's requests: the fixture prices, and no history (Plan and the page read none). */
async function routeContext(context: BrowserContext) {
  await context.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(NOW_MS - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } },
      },
    }),
  );
  await context.route('**/api/history/*', (route) => route.abort());
}

/** The page opened: its heading, a settled screen area, the first sentence, and not Today or the offline page. */
async function opened(page: Page) {
  await expect(title(page)).toBeVisible();
  await ready(page);
  await expect(page.getByText(SET_UP)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Offline' })).toHaveCount(0);
}

// In light and dark: the focus moves and their rings, in both themes (as undo-focus.spec.ts runs them).
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('an offline reload of /plan/review shows the page from the precached shell', async ({
      page,
      context,
      browserName,
    }) => {
      // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on WebKit, as offline.spec.ts runs the worker on Chromium only
      test.skip(browserName !== 'chromium', 'the offline path of the service worker is proven on Chromium');
      await routeContext(context);
      await seedPlan(page, fixtureSnapshot());
      await page.goto('/plan/review');
      await opened(page);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (navigator.serviceWorker.controller !== null) return;
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
      });
      await context.setOffline(true);
      await page.reload();
      await opened(page);
      await context.setOffline(false);
    });

    test.describe('with the worker blocked', () => {
      test.use({ serviceWorkers: 'block' });

      test.beforeEach(async ({ page }) => {
        await routeFixturePrices(page, NOW_MS);
        await seedPlan(page, fixtureSnapshot());
      });

      test('a direct load of /plan/review shows the page, and opening it writes nothing', async ({ page }) => {
        await page.goto('/plan/review');
        await opened(page);
        await expect(page.getByRole('button', { name: 'Mark as reviewed' })).toBeVisible();
        await page.reload();
        await opened(page);
      });

      test("Plan's link opens the page with the focus on its h1", async ({ page }) => {
        await page.goto('/plan');
        await ready(page);
        await page.getByRole('link', { name: 'Review the plan' }).click();
        await expect(page).toHaveURL(/\/plan\/review$/);
        await expect(title(page)).toBeFocused();
        await expect(page.getByText(SET_UP)).toBeVisible();
      });

      test('Mark as reviewed focuses the result line, and a reload counts from the review', async ({ page }) => {
        await page.goto('/plan/review');
        await opened(page);
        await page.getByRole('button', { name: 'Mark as reviewed' }).click();
        const line = page.getByText(/^You reviewed this plan on 20\sOct\s2026\. Next review from 20\sOct\s2027\.$/u);
        await expect(line).toBeFocused();
        await expect(line).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Mark as reviewed' })).toHaveCount(0);
        await page.reload();
        await expect(title(page)).toBeVisible();
        await ready(page);
        await expect(page.getByText(/^You last reviewed this plan on 20\sOct\s2026\.$/u)).toBeVisible();
      });
    });
  });
}
