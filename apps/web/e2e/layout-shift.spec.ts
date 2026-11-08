import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { pinNetwork } from './network';
import { seedPlan } from './seed';
import { test } from './support';

// The cold boot of /log, /today and /portfolio (its closes failing) over the seeded fixture plan moves less
// than CLS 0.1 (ADR-0045, "Readings recorded on 2026-10-20"; the M0 guarantee CLS ≤ 0.1). A buffered
// PerformanceObserver reads
// every layout shift since the navigation and sums those without recent input. /api/prices is answered
// by the page's route, so Today's prices line arrives as it would, and nothing reaches CoinGecko; the page
// is online whatever the host's network does, so the line is the live one (./network.ts).

test.use({ serviceWorkers: 'block' });
// biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the WebKit projects, which cannot measure this, not a disabled test
test.skip(({ browserName }) => browserName !== 'chromium', 'the Layout Instability API exists only in Chromium');

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

type LayoutShift = PerformanceEntry & { readonly value: number; readonly hadRecentInput: boolean };

/** The sum of the layout shifts since the navigation, without those right after an input. */
const layoutShift = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let sum = 0;
        const add = (entries: PerformanceEntryList) => {
          for (const entry of entries as LayoutShift[]) if (!entry.hadRecentInput) sum += entry.value;
        };
        const observer = new PerformanceObserver((list) => add(list.getEntries()));
        observer.observe({ type: 'layout-shift', buffered: true });
        // The buffered entries arrive in the observer's first callback, queued as a task.
        setTimeout(() => {
          add(observer.takeRecords());
          observer.disconnect();
          resolve(sum);
        }, 500);
      }),
  );

test.beforeEach(async ({ page }) => {
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
  await pinNetwork(page, true);
  await seedPlan(page, fixtureSnapshot());
});

test('the cold boot of /log moves less than CLS 0.1', async ({ page }) => {
  await page.goto('/log');
  await ready(page);
  await expect(page.locator('tbody [data-slot="table-row"]').first()).toBeVisible();
  expect(await layoutShift(page)).toBeLessThan(0.1);
});

test('the cold boot of /today moves less than CLS 0.1, the prices line included', async ({ page }) => {
  await page.goto('/today');
  await ready(page);
  await expect(page.getByText(/^Prices as of /)).toBeVisible();
  expect(await layoutShift(page)).toBeLessThan(0.1);
});

// The production check of 2026-10-29 (lighthouse-vercel on a20d28d9): /api/history answered 502 while
// CoinGecko failed, and the holdings table moved up when the value chart's line replaced its frame. Each
// 502 waits until the loading frame shows, as a slow upstream failure does, so the shift is the late one.
test('/portfolio keeps its layout while /api/history answers 502', async ({ page }) => {
  let release = () => {};
  const loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/history/*', async (route) => {
    await loaded;
    await route.fulfill({ status: 502 });
  });
  await page.goto('/portfolio');
  await ready(page);
  const table = page.locator('main [data-slot="table-container"]');
  await expect(page.locator('main section[aria-busy="true"]')).toBeVisible();
  await expect(table).toBeVisible();
  const before = await table.boundingBox();
  release();
  await expect(page.getByText(/^The price history could not be loaded/)).toBeVisible();
  expect((await table.boundingBox())?.y).toBe(before?.y);
  expect(await layoutShift(page)).toBeLessThan(0.1);
});
