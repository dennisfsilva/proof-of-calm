import { type BrowserContext, expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { PRICE_TTL } from '@proofofcalm/core';
import { pinNetwork } from './network';
import { seedPlan } from './seed';
import { test } from './support';

// Offline once installed (ADR-0033 Consequences; ADR-0045 §5): the real service worker controls the page
// over the seeded fixture plan on 20 October 2026, then the context goes offline. Today keeps the stored
// plan, the same portfolio number and the one "Prices from {time}, {date} · offline" line with CoinGecko's
// credit, with no banner, and Portfolio the same line (docs/CONTENT-STYLE.md §3, the Offline row); every screen opens from the navigation and from a cold deep
// link out of the precached shell; an entry recorded offline survives an offline reload, and the line
// turns live once back online. /api/prices is answered by the context's route, because the worker's own
// request passes the page's routes by; offline, the route refuses as the network would, and the page's
// navigator.onLine is pinned to the spec's network, not the host's (./network.ts). Like pwa.spec.ts,
// this runs on the desktop project only: the worker does not depend on the viewport.

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
/** The portfolio number's list: the value first, the prices line last. */
const portfolio = (page: Page) => page.locator('dl').filter({ hasText: /^Portfolio value/ });
const portfolioNumber = (page: Page) => portfolio(page).locator('dd').first();
const pricesLine = (page: Page) => portfolio(page).locator('dd').last();
const OFFLINE_LINE = /^Prices from \d{2}:\d{2}, 20\sOct\s2026 · offline · Price data by CoinGecko$/u;
const LIVE_LINE = /^Prices as of \d{2}:\d{2}, 20\sOct\s2026 · Price data by CoinGecko$/u;

const network = { offline: false };
let errors: string[] = [];
let clockMs = 0;

test.beforeEach(async ({ page }, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the projects pwa.spec.ts leaves out, not a disabled test
  test.skip(testInfo.project.name !== 'desktop', 'the service worker does not depend on the viewport');
  network.offline = false;
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors, 'no uncaught error on any screen').toEqual([]);
});

/** The fixture plan priced on 20 October 2026, with the service worker controlling the page. */
async function installed(page: Page, context: BrowserContext) {
  const nowMs = fixtureNowMs('buy');
  clockMs = nowMs;
  await page.clock.setFixedTime(new Date(clockMs));
  await context.route('**/api/prices?*', (route) =>
    network.offline
      ? route.abort('internetdisconnected')
      : route.fulfill({
          json: {
            at: new Date(nowMs - 30_000).toISOString(),
            prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
          },
        }),
  );
  await pinNetwork(page, true);
  await seedPlan(page, fixtureSnapshot());
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller !== null) return;
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    );
  });
  await expect(pricesLine(page)).toHaveText(LIVE_LINE);
}

/**
 * A reload a second later, or `laterMs` later. The app's clock answers at least 1 ms after its previous
 * answer (ADR-0042), so under a clock that never moves the stored prices would carry a fetch time after
 * the next load's now, which the store reads as a clock that went back and drops; real time moves on
 * between two loads.
 */
async function reload(page: Page, laterMs = 1000) {
  clockMs += laterMs;
  await page.clock.setFixedTime(new Date(clockMs));
  await page.reload();
}

async function goOffline(page: Page) {
  network.offline = true;
  await page.context().setOffline(true);
  await pinNetwork(page, false);
}

/** Back online: `setOffline(false)` hands navigator.onLine back to the host, so the page is pinned again. */
async function goOnline(page: Page) {
  network.offline = false;
  await page.context().setOffline(false);
  await pinNetwork(page, true);
}

/** A screen that opened: its heading, a settled screen area, and neither the data error nor the offline page. */
async function opened(page: Page, name: string) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Your data could not be opened.' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Offline' })).toHaveCount(0);
}

test('offline, Today shows the stored plan, the same portfolio number and the offline prices line with no banner', async ({
  page,
  context,
}) => {
  await installed(page, context);
  const value = await portfolioNumber(page).textContent();

  await goOffline(page);
  await reload(page);
  await opened(page, 'Today');
  await expect(page.getByRole('heading', { level: 2, name: 'October 2026 is still open' })).toBeVisible();
  await expect(portfolioNumber(page)).toHaveText(value ?? '');
  await expect(pricesLine(page)).toHaveText(OFFLINE_LINE);
  // The line is the only word of it: no banner, no alert.
  await expect(page.getByText(/offline/i)).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await goOnline(page);
});

test('offline, Portfolio shows the same prices line as Today', async ({ page, context }) => {
  await installed(page, context);
  await goOffline(page);
  await reload(page);
  await opened(page, 'Today');
  await expect(pricesLine(page)).toHaveText(OFFLINE_LINE);
  const line = await pricesLine(page).textContent();

  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await opened(page, 'Portfolio');
  await expect(page.getByText(OFFLINE_LINE)).toHaveText(line ?? '');
  await expect(page.getByText(/^Prices as of/u)).toHaveCount(0);
  await goOnline(page);
});

test('offline, Portfolio, Log, Plan and Settings open from the navigation and from a cold deep link', async ({
  page,
  context,
}) => {
  await installed(page, context);
  await goOffline(page);
  await reload(page);
  await opened(page, 'Today');
  for (const [link, name] of [
    ['Portfolio', 'Portfolio'],
    ['Log', 'Log'],
    ['Today', 'Today'],
    ['Your plan', 'Plan'],
    ['Settings', 'Settings'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await opened(page, name);
  }
  for (const [path, name] of [
    ['/portfolio', 'Portfolio'],
    ['/log', 'Log'],
    ['/plan', 'Plan'],
    ['/settings', 'Settings'],
  ] as const) {
    await page.goto(path);
    await opened(page, name);
  }
  await goOnline(page);
});

test('an entry recorded offline is in the Log after an offline reload, and the line turns live once back online', async ({
  page,
  context,
}) => {
  await installed(page, context);
  await goOffline(page);
  await page.getByRole('button', { name: 'Bought as planned' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'October 2026 is recorded' })).toBeFocused();
  await expect(pricesLine(page)).toHaveText(OFFLINE_LINE);

  // Past the client TTL, so the reload's refresh asks for prices and gets no answer: the line must turn
  // live on the reconnect itself, not on the next timed refresh a minute later.
  await reload(page, (PRICE_TTL.clientSeconds + 1) * 1000);
  await opened(page, 'Today');
  await expect(page.getByRole('heading', { level: 2, name: 'October 2026 is recorded' })).toBeVisible();
  await page.getByRole('link', { name: 'Log', exact: true }).click();
  await opened(page, 'Log');
  await expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toContainText('20 Oct 2026');

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await opened(page, 'Today');
  await expect(pricesLine(page)).toHaveText(OFFLINE_LINE);
  await goOnline(page);
  await expect(pricesLine(page)).toHaveText(LIVE_LINE);
});
