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
// is online whatever the host's network does, so the line is the live one (./network.ts). A late answer
// moves nothing below the prices line: its slot holds the line's widest forms (docs/ENGINEERING.md §4), and
// Portfolio's unpriced value keeps the priced block's place. The positions are checked on every project,
// the CLS on Chromium's.

test.use({ serviceWorkers: 'block' });

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

type LayoutShift = PerformanceEntry & { readonly value: number; readonly hadRecentInput: boolean };

/**
 * The sum of the layout shifts since the navigation, without those right after an input, under 0.1. The
 * Layout Instability API exists only in Chromium, so the WebKit projects check the measured positions alone.
 */
async function expectSteady(page: Page, browserName: string) {
  if (browserName === 'chromium') expect(await layoutShift(page)).toBeLessThan(0.1);
}

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

test.beforeEach(async ({ page, browserName }) => {
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
  // Today reads the closes too and keeps a copy on the device: they fail while the plan is seeded, so no copy
  // reaches Portfolio; a test's own route of /api/history takes the place of this one.
  await page.route('**/api/history/*', (route) => route.fulfill({ status: 503 }));
  // WebKit follows the host's network, which CDP cannot pin there (./network.ts).
  if (browserName === 'chromium') await pinNetwork(page, true);
  await seedPlan(page, fixtureSnapshot());
});

test('the cold boot of /log moves less than CLS 0.1', async ({ page, browserName }) => {
  await page.goto('/log');
  await ready(page);
  await expect(page.locator('tbody [data-slot="table-row"]').first()).toBeVisible();
  await expectSteady(page, browserName);
});

test('the cold boot of /today moves less than CLS 0.1, the prices line included', async ({ page, browserName }) => {
  await page.goto('/today');
  await ready(page);
  await expect(page.getByText(/^Prices as of /)).toBeVisible();
  await expectSteady(page, browserName);
});

// The production check of 2026-10-29 (lighthouse-vercel on a20d28d9): /api/history answered 502 while
// CoinGecko failed, and the holdings table moved up when the value chart's line replaced its frame. Each
// 502 waits until the loading frame shows, as a slow upstream failure does, so the shift is the late one.
test('/portfolio keeps its layout while /api/history answers 502', async ({ page, browserName }) => {
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
  await expectSteady(page, browserName);
});

/**
 * Answers /api/history/:coin after the returned release runs, as a slow upstream: daily closes at the fixture
 * prices ending on `end`, `days` of them for the coin (365 when it is not named).
 */
function heldHistory(page: Page, end: string, days: Partial<Record<string, number>> = {}) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const routed = page.route('**/api/history/*', async (route) => {
    await held;
    const coin = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const count = days[coin] ?? 365;
    const close = coin === 'ETH' ? '2500.5' : '60000.12';
    const closes = Array.from({ length: count }, (_, index) => [
      new Date(endMs - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10),
      close,
    ]);
    await route.fulfill({ json: { coin, currency: 'EUR', closes, fetchedAt: new Date(endMs).toISOString() } });
  });
  return routed.then(() => release);
}

/** Opens /portfolio with the closes held, then measures the holdings table before and after `release`. */
async function expectTableKept(page: Page, browserName: string, release: () => void, line: RegExp) {
  await page.goto('/portfolio');
  await ready(page);
  const table = page.locator('main [data-slot="table-container"]');
  await expect(page.locator('main section[aria-busy="true"]')).toBeVisible();
  await expect(table).toBeVisible();
  const before = await table.boundingBox();
  release();
  await expect(page.getByText(line)).toBeVisible();
  expect((await table.boundingBox())?.y).toBe(before?.y);
  await expectSteady(page, browserName);
}

// Session 27e's design check (DC-B, main e1f6d5aa1): a read that ends with nothing to draw put a line in the
// frame's place, lifting the table 347.69 px (457.50 at 125 %, CLS 0.165 / 0.227) for a coin with one close
// and 265.39 px (357.13, CLS 0.096 / 0.148) for buys after the last close. The frame keeps its place.
test('/portfolio keeps its layout when a coin has one daily close', async ({ page, browserName }) => {
  const release = await heldHistory(page, '2026-10-20', { ETH: 1 });
  await expectTableKept(page, browserName, release, /^The price history has fewer than two daily closes for ETH/);
});

test('/portfolio keeps its layout when every buy is later than the last daily close', async ({ page, browserName }) => {
  // The fixture's entries deleted and one buy on the clock's day, 20 Oct 2026; the closes end on 19 Oct.
  const fixture = fixtureSnapshot();
  const first = fixture.entries[0];
  if (first === undefined) throw new Error('no fixture entry');
  const deleted = fixture.entries.map((entry) => ({ ...entry, deletedAt: entry.updatedAt }));
  const buy = {
    ...first,
    id: '00000000-0000-4000-8000-000000000099' as typeof first.id,
    kind: 'extra' as const,
    slot: null,
    date: '2026-10-20' as typeof first.date,
    createdAt: '2026-10-20T09:00:00+01:00' as typeof first.createdAt,
    updatedAt: '2026-10-20T09:00:00+01:00' as typeof first.updatedAt,
  };
  await seedPlan(page, { ...fixture, entries: [...deleted, buy] });
  const release = await heldHistory(page, '2026-10-19');
  await expectTableKept(page, browserName, release, /^There is no value to draw since the first entry/);
});

/** Holds /api/prices until the returned release runs, then hands it to the fixture answer, as a slow upstream. */
async function latePrices(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/prices?*', async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}

// Session 27d's evaluator (#548): the line wraps onto two at 14 px on the phones and at 125 %, and its late
// arrival moved Today's strip 20.3 px (25.4 px at 125 %) and Portfolio's range buttons 112 to 146 px.
test("Today's plan strip keeps its y when /api/prices answers late", async ({ page, browserName }) => {
  const release = await latePrices(page);
  await page.goto('/today');
  await expect(page.getByText('Invested', { exact: true })).toBeVisible();
  const strip = page.getByRole('link', { name: 'Your plan', exact: true });
  await expect(strip).toBeVisible();
  const before = await strip.boundingBox();
  release();
  await expect(page.getByText(/^Prices as of /)).toBeVisible();
  expect((await strip.boundingBox())?.y).toBe(before?.y);
  await expectSteady(page, browserName);
});

/**
 * Starts counting every layout shift from now on, those right after an input too, since the press that starts
 * a retry is one; the returned read gives their sum.
 */
async function shiftsFromNow(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { shifts: number };
    target.shifts = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) target.shifts += entry.value;
    }).observe({ type: 'layout-shift' });
  });
  return () => page.evaluate(() => (window as unknown as { shifts: number }).shifts);
}

const scrollHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

// Session 27g (#562): on a wealth-snapshot plan the value of 1 January sits last on Portfolio. After a failed
// read it shows nothing; a retry (pressing Portfolio's tab, #557) showed its loading line, and a second failure
// took it away again, so the page's end grew and shrank under the reader. It stays hidden across the retry.
test("/portfolio's end keeps its place across a retry that fails again", async ({ page, browserName }) => {
  // The beforeEach's 503 is in place before this seed too, so Today keeps no closes (docs/BUILD-PROMPT.md's lessons).
  const fixture = fixtureSnapshot();
  if (fixture.plan === null) throw new Error('no fixture plan');
  const plan = {
    ...fixture.plan,
    country: 'NL' as typeof fixture.plan.country,
    countryRuleVersion: 1,
    holdingRule: { kind: 'none' as const },
  };
  await seedPlan(page, { ...fixture, plan });
  // 15 March 2030: the fixture's coins were held at the end of 31 December 2029, so the block has a line.
  await page.clock.setFixedTime(new Date(fixtureNowMs('sell')));
  // The first read fails at once; the retry's requests wait for the release, then fail again. Only requests
  // after the press are held: the seed's Today can still ask for the closes after this route is in place, and
  // counting those held the first read itself (CI run 45822358259, the reduced-motion project).
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = false;
  let retried = 0;
  await page.route('**/api/history/*', async (route) => {
    if (hold) {
      retried += 1;
      await held;
    }
    await route.fulfill({ status: 503 });
  });
  await page.goto('/portfolio');
  await ready(page);
  const failure = page.getByText(/^The price history could not be loaded/);
  await expect(failure).toBeVisible();
  await expect(page.getByText(/^Value on 1 January/)).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const before = await scrollHeight(page);
  const shifts = await shiftsFromNow(page);

  hold = true;
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  // One request per served coin, BTC and ETH.
  await expect.poll(() => retried).toBeGreaterThanOrEqual(2);
  expect(await scrollHeight(page)).toBe(before);
  await expect(page.getByText(/^Loading the daily closes/)).toHaveCount(0);
  release();
  await expect(failure).toBeVisible();
  expect(await scrollHeight(page)).toBe(before);
  if (browserName === 'chromium') expect(await shifts()).toBeLessThan(0.01);
});

test("Portfolio's range buttons keep their y when prices land", async ({ page, browserName }) => {
  await page.route('**/api/history/*', (route) => route.fulfill({ status: 502 }));
  const release = await latePrices(page);
  await page.goto('/portfolio');
  await expect(page.getByText(/^No price yet for /)).toBeVisible();
  await expect(page.getByText(/^The price history could not be loaded/)).toBeVisible();
  const ranges = page.locator('main [data-slot="segmented-control"]').first();
  const before = await ranges.boundingBox();
  release();
  await expect(page.getByText(/^Prices as of /)).toBeVisible();
  expect((await ranges.boundingBox())?.y).toBe(before?.y);
  await expectSteady(page, browserName);
});
