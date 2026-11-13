import { expect, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { addDays, type CalendarDate, strip } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// The sell phase across Today, the Log, Plan and Portfolio on the viewport matrix (docs/DOMAIN.md §3.5, §3.7,
// §3.10): the fixture plan, its buying ended in September 2026, on 15 March 2030, inside its sell window (1 Sep
// 2029 to 31 Aug 2030), where every purchase is past Portugal's 365 days. Today names the phase and its strip
// puts the today marker on the Sell segment; a sale recorded in the Log lowers Plan's sellable line and
// Portfolio's units, and both hold after a reload; the day after the window closes, Today and Plan name the
// time after the sell window closed. The plan is Portugal's, so units read in pt-PT (ADR-0034); /api/prices is
// answered by the page's route.

test.use({ serviceWorkers: 'block' });

// Buying ended after September's purchases ("End buying today", docs/DOMAIN.md §6), so no month from October
// 2026 on is left open and Plan's and Portfolio's figures below are the purchases the fixture logged.
const ended = '2026-09-20' as CalendarDate;
const fixture = fixtureSnapshot();
if (fixture.plan === null || fixture.plan.sellWindow === null) throw new Error('the fixture plan has a sell window');
const plan = { ...fixture.plan, lastBuy: ended, endedBuyingOn: ended };
const snapshot = { ...fixture, plan };
const { sellWindow } = fixture.plan;
const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

async function seedAt(page: Page, nowMs: number, seeded: Snapshot = snapshot) {
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
  await seedPlan(page, seeded);
}

/** Plan's sellable line of a coin, with its units as pt-PT writes them (a no-break space before the code). */
const sellable = (page: Page, units: string, coin: string) =>
  page.getByText(new RegExp(`^${units}\\s${coin} sellable now$`, 'u'));

/** Portfolio's units of a coin, in the holdings row's detail once the row is open. */
async function heldUnits(page: Page, units: string, coin: string) {
  await page.goto('/portfolio');
  await ready(page);
  const holdings = page.getByRole('table', { name: 'Holdings' });
  await holdings.getByRole('button', { name: coin }).click();
  await expect(holdings.getByText(new RegExp(`^${units}\\s${coin}$`, 'u'))).toBeVisible();
}

test('in the sell window Today names the phase and the strip marks it', async ({ page }) => {
  await seedAt(page, fixtureNowMs('sell'));
  await expect(page.getByRole('heading', { level: 2, name: 'In the sell window' })).toBeVisible();
  await expect(page.getByText(/^It closes on 31\sAug\S*\s2030\.$/u)).toBeVisible();

  // The today marker stands where the core places 15 March 2030, inside the Sell segment.
  const geometry = strip(plan, FIXTURE_DATES.sell as CalendarDate);
  const sell = geometry.segments.find((segment) => segment.kind === 'sell');
  if (sell === undefined || geometry.today === null) throw new Error('the strip has a sell segment and today');
  const marker = page.locator('[data-slot="progress-strip-today"] line');
  await expect(marker).toHaveAttribute('x1', geometry.today);
  expect(Number(geometry.today)).toBeGreaterThan(Number(sell.from));
  expect(Number(geometry.today)).toBeLessThan(Number(sell.to));
});

test('after the buying phase the phase leads Today, and months left open wait in its quiet list', async ({ page }) => {
  // The plain fixture, its months from October 2026 never logged: past the buying phase they no longer lead (§3.3).
  await seedAt(page, fixtureNowMs('sell'), fixture);
  await expect(page.getByRole('heading', { level: 2, name: 'In the sell window' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /is still open$/u })).toHaveCount(0);
  const open = page.getByRole('list', { name: 'Also open' });
  await expect(open.getByRole('listitem').first()).toHaveText(/^October\s2026: /u);
});

test("a sale recorded in the Log lowers Plan's sellable line and Portfolio's holding, and a reload keeps both", async ({
  page,
}) => {
  await seedAt(page, fixtureNowMs('sell'));
  await page.goto('/plan');
  await ready(page);
  // 0.0125 + 5 × 0.00121 + 0.0036 BTC bought; the fixture's one sale was ETH.
  await expect(sellable(page, '0,02215000', 'BTC')).toBeVisible();
  await expect(sellable(page, '0,119000', 'ETH')).toBeVisible();

  await page.goto('/log');
  await ready(page);
  await page.getByRole('button', { name: 'Record a purchase' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Sale' }).click();
  await expect(sheet).toContainText('Log a sale');
  await sheet.getByLabel('BTC sold (units)').fill('0.01');
  await sheet.getByLabel('BTC sold for, before fees (EUR)').fill('600');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('Recorded: sold');

  await page.goto('/plan');
  await ready(page);
  await expect(sellable(page, '0,01215000', 'BTC')).toBeVisible();
  await expect(sellable(page, '0,119000', 'ETH')).toBeVisible();
  await heldUnits(page, '0,01215000', 'BTC');

  await page.reload();
  await ready(page);
  await heldUnits(page, '0,01215000', 'BTC');
  await page.goto('/plan');
  await page.reload();
  await ready(page);
  await expect(sellable(page, '0,01215000', 'BTC')).toBeVisible();
});

test("past the window's close, Today and Plan show the phase text for a finished window", async ({ page }) => {
  const closed = addDays(sellWindow.closes, 1);
  await seedAt(page, Date.parse(`${closed}T10:00:00Z`));
  await expect(page.getByRole('heading', { level: 2, name: 'The sell window has closed' })).toBeVisible();
  await expect(page.getByText(/^The plan ends on 31\sDec\S*\s2030\.$/u)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'In the sell window' })).toHaveCount(0);

  await page.goto('/plan');
  await ready(page);
  // The drawing's summary names the phase at every width (the drawing itself shows from 48rem).
  await expect(page.locator('[data-slot="timeline"] [role="img"]')).toHaveAttribute(
    'aria-label',
    /is after the sell window closed\.$/,
  );
  await expect(page.getByText(/sellable now/)).toHaveCount(0);
  // Buying ended in September: the totals say when, with no share of the planned total.
  await expect(page.getByText(/ invested\. Buying ended on 20\sSep\S*\s2026\.$/u)).toBeVisible();
});
