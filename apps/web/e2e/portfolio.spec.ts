import { expect, type Route } from '@playwright/test';
import { createFormatters } from '@proofofcalm/app/lib/format';
import {
  FIXTURE_DATES,
  type FixturePhase,
  fixtureNowMs,
  fixtureSnapshot,
} from '@proofofcalm/app/lib/services/fixtures';
import type { CurrencyCode, Decimal, Plan } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// The Portfolio screen over the seeded fixture plan on every project of the matrix, at both of its
// dates (docs/DOMAIN.md §3.6, docs/DESIGN.md §7): the value with BTC and ETH priced, P/L with the fees
// shown separately, the allocation, the holdings table and a row opened to its detail. /api/prices is
// answered by the page's route, so nothing reaches CoinGecko; the service worker is blocked because a
// request it makes itself passes the page's routes by. The plan is Portugal's, so the figures are
// formatted in pt-PT, as the app formats them; the expected text allows for the browsers' spaces.
// The value chart reads /api/history/:coin, answered the same way from fixture closes; an open holdings
// row draws its coin's closes over the value chart's range. The same plan in the Netherlands, in nl-NL, adds
// the value on 1 January from the close of 31 December before the fixed clock (docs/JURISDICTIONS.md §7.8).

test.use({ serviceWorkers: 'block' });

const format = createFormatters('pt-PT', 'en-GB');
const EUR = 'EUR' as CurrencyCode;
const money = (amount: string, signed = false) => format.money(amount as Decimal, EUR, { signed });

/** The text with any run of spaces (U+0020, U+00A0, U+202F) optional, so a grouping space may differ. */
const loosely = (text: string) =>
  new RegExp(
    text
      .replace(/\s/g, '')
      .split('')
      .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*'),
  );

/**
 * Answers /api/history/:coin, never CoinGecko: a year of daily closes ending on `nowMs`'s date at the
 * fixture prices, rising by about 0.1 % a day; after `held` settles when one is given.
 */
const history =
  (nowMs: number, held: Promise<void> = Promise.resolve()) =>
  async (route: Route) => {
    await held;
    const url = new URL(route.request().url());
    const coin = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const last = coin === 'ETH' ? 2500.5 : 60000.12;
    const closes = Array.from({ length: 365 }, (_, index) => {
      const back = 364 - index;
      const close = Math.round(last * 0.999 ** back * 100) / 100;
      return [new Date(nowMs - back * 86_400_000).toISOString().slice(0, 10), String(close)];
    });
    return route.fulfill({
      json: { coin, currency: 'EUR', closes, fetchedAt: new Date(nowMs - 60_000).toISOString() },
    });
  };

test('the value chart takes its loaded height before the closes arrive, so nothing below it moves', async ({
  page,
}) => {
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
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/history/*', history(nowMs, held));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/portfolio');

  const allocation = page.getByRole('img', { name: /^Allocation by value: / });
  await expect(allocation).toBeVisible();
  await expect(page.locator('section[aria-busy="true"]')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = (await allocation.boundingBox())?.y;

  release();
  await expect(page.getByRole('img', { name: /^Portfolio value, / })).toBeVisible();
  const after = (await allocation.boundingBox())?.y;
  expect(before).toBeDefined();
  expect(Math.abs((after ?? 0) - (before ?? 0))).toBeLessThanOrEqual(1);
});

for (const phase of Object.keys(FIXTURE_DATES) as FixturePhase[]) {
  test(`the fixture plan's value, P/L and holdings on ${FIXTURE_DATES[phase]}`, async ({ page }) => {
    const nowMs = fixtureNowMs(phase);
    await page.clock.setFixedTime(new Date(nowMs));
    await page.route('**/api/prices?*', (route) =>
      route.fulfill({
        json: {
          at: new Date(nowMs - 30_000).toISOString(),
          prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
        },
      }),
    );
    await seedPlan(page, fixtureSnapshot());
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();

    // BTC 0.02215 at 60,000.12 and ETH 0.119 at 2,500.5; 1,700 invested and 150 back from a sale.
    await expect(page.getByText(loosely(money('1626.562158')))).toBeVisible();
    await expect(page.getByText(loosely(`${money('76.562158', true)} (+4,5%)`))).toBeVisible();
    await expect(page.getByText('Fees (not in P/L)')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Allocation by value: BTC 82\s*%, ETH 18\s*%$/ })).toBeVisible();
    await expect(page.getByText('Not bought yet')).toHaveCount(0);

    const holdings = page.getByRole('table', { name: 'Holdings' });
    await expect(holdings.getByRole('button')).toHaveText(['BTC', 'ETH']);
    const btc = holdings.getByRole('button', { name: 'BTC' });
    await btc.click();
    await expect(btc).toHaveAttribute('aria-expanded', 'true');
    // Every row holds its detail; BTC's comes first and only it is open.
    await expect(holdings.getByText('Average cost').first()).toBeVisible();
    await expect(holdings.getByText('Average cost').last()).toBeHidden();
    await expect(holdings.getByText(loosely(money('56433.408577')))).toBeVisible();

    // The open table fits its wrapper at every width and text size, so it needs no scrolling region.
    const fit = await holdings.evaluate((table) => ({
      table: table.scrollWidth,
      wrapper: table.parentElement?.clientWidth ?? 0,
    }));
    expect(fit.table).toBeLessThanOrEqual(fit.wrapper);
    await expect(page.getByRole('region', { name: 'Holdings' })).toHaveCount(0);
  });

  test(`the value chart of the fixture plan on ${FIXTURE_DATES[phase]}, its range kept across a reload`, async ({
    page,
  }) => {
    const nowMs = fixtureNowMs(phase);
    await page.clock.setFixedTime(new Date(nowMs));
    await page.route('**/api/prices?*', (route) =>
      route.fulfill({
        json: {
          at: new Date(nowMs - 30_000).toISOString(),
          prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
        },
      }),
    );
    await page.route('**/api/history/*', history(nowMs));
    await seedPlan(page, fixtureSnapshot());
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();

    // The default range is 30 days (docs/DOMAIN.md §2.3); the name states the range, its dates and the
    // first and last values; under it the closes' dates and credit, then the past-performance line.
    const chart = page.getByRole('img', { name: /^Portfolio value, / });
    await expect(chart).toHaveAccessibleName(/^Portfolio value, last 30 days \(.+ to .+\), from .+ to .+$/);
    // The drawn line only: its widest forms stand under it, invisible and unread, to hold its height.
    const source = page.getByText(/^Daily closes, .+ to .+, as of .+ · Price data by CoinGecko$/);
    await expect(source.filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/^Past performance is not a reliable indicator of future results\./)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
    await expect(page.getByText('Charts come later')).toHaveCount(0);

    // Each button's name starts with its visible label (7D … All) and then says the range in words.
    const ranges = page.getByRole('group', { name: 'Chart range' });
    await ranges.getByRole('button', { name: '90D, last 90 days' }).click();
    await expect(chart).toHaveAccessibleName(/^Portfolio value, last 90 days \(/);
    await expect(ranges.getByRole('button', { name: '90D, last 90 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(ranges.getByRole('button', { name: '90D, last 90 days' })).toContainText('90D');

    // An open holdings row draws its coin's closes over the same range, and follows it when it changes.
    const holdings = page.getByRole('table', { name: 'Holdings' });
    await holdings.getByRole('button', { name: 'BTC' }).click();
    const btcChart = holdings.getByRole('img', { name: /^BTC price, / });
    await expect(btcChart).toHaveAccessibleName(/^BTC price, last 90 days \(.+ to .+\), from .+ to .+$/);
    await expect(holdings.getByText('Price data by CoinGecko')).toBeVisible();
    await ranges.getByRole('button', { name: '30D, last 30 days' }).click();
    await expect(btcChart).toHaveAccessibleName(/^BTC price, last 30 days \(/);
    await expect(holdings.getByRole('img', { name: /^ETH price, / })).toHaveCount(0);
    await ranges.getByRole('button', { name: '90D, last 90 days' }).click();
    await expect(btcChart).toHaveAccessibleName(/^BTC price, last 90 days \(/);

    await page.reload();
    await expect(page.getByRole('img', { name: /^Portfolio value, last 90 days \(/ })).toBeVisible();
    await expect(ranges.getByRole('button', { name: '90D, last 90 days' })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('a Dutch plan shows its value on 1 January from the closes of 31 December, as an estimate, credited', async ({
  page,
}) => {
  const nowMs = fixtureNowMs('sell');
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
  await page.route('**/api/history/*', history(nowMs));
  const fixture = fixtureSnapshot();
  if (fixture.plan === null) throw new Error('no fixture plan');
  const plan: Plan = {
    ...fixture.plan,
    country: 'NL' as Plan['country'],
    countryRuleVersion: 1,
    holdingRule: { kind: 'none' },
  };
  await seedPlan(page, { ...fixture, plan });
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();

  // The closes of 31 Dec 2029, 74 days before the clock: BTC 55,718.35 and ETH 2,322.06, for 0.02215 BTC
  // and 0.119 ETH.
  const dutch = createFormatters('nl-NL', 'en-GB');
  await expect(page.getByText('Value on 1 January 2030')).toBeVisible();
  await expect(page.getByText(loosely(dutch.money('1510.4865925' as Decimal, EUR)))).toBeVisible();
  await expect(
    page.getByText(loosely('Estimate from the daily closes of 31 Dec 2029 for BTC and ETH · Price data by CoinGecko')),
  ).toBeVisible();
  await expect(page.getByText(/wealth|box 3|taxable/i)).toHaveCount(0);
  // The value chart draws, so it carries the past-performance line and the January line adds none (LEGAL §4).
  await expect(page.getByText(/^Past performance is not a reliable indicator/)).toHaveCount(1);
});
