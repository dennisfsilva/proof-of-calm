import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// The "Why?" links on the viewport matrix (docs/CONTENT-STYLE.md §3): each opens its module in a sheet over the
// screen it stands on, on its section, and closing gives the focus back. The real module, not the fixture: the
// table grows with each link a new module brings (docs/EDUCATION.md). The fixture plan bought until 20 September
// 2026, so on 15 March 2028 it is in the hold phase. A click in Safari does not focus a button, so the links are
// pressed with a key: the focus they get back is then the one they had.

test.use({ serviceWorkers: 'block' });

const ended = '2026-09-20' as CalendarDate;
const fixture = fixtureSnapshot();
if (fixture.plan === null) throw new Error('the fixture has a plan');
const snapshot = { ...fixture, plan: { ...fixture.plan, lastBuy: ended, endedBuyingOn: ended } };
const HOLD_MS = Date.UTC(2028, 2, 15, 12);

const IDEA = 'Averaging takes away the timing decision, not the risk.';
const CYCLES =
  "Since 2013, bitcoin's highs have come about 4 years apart so far; 4 completed cycles are 4 data points, not a law.";
const WINDOW = 'The window is a discipline device';
const RISK = 'You can lose everything, and the order of operations matters.';
const TAXES = 'Where you live decides what holding means for tax, and the rules keep changing.';

const LINKS = [
  { path: '/today', name: 'Why? The hold phase', idea: IDEA, section: 'Why some people hold' },
  { path: '/today', name: 'Why? The sell window', idea: CYCLES, section: WINDOW },
  { path: '/plan', name: 'Why? The sell window', idea: CYCLES, section: WINDOW },
  { path: '/plan', name: 'Why? The three parts', idea: CYCLES, section: 'Three parts' },
] as const;

async function seedInHold(page: Page) {
  await page.clock.setFixedTime(new Date(HOLD_MS));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(HOLD_MS - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
  await seedPlan(page, snapshot);
}

/** Walks the focus back to the sheet's `Close` in bounded presses; only the press that lands on it is under test. */
async function shiftTabToClose(page: Page, sheet: Locator, close: Locator) {
  const presses = 6;
  let reached = false;
  for (let press = 0; press < presses && !reached; press += 1) {
    const place = await sheet.evaluate((popup) => popup.scrollTop);
    await page.keyboard.press('Shift+Tab');
    reached = await close.evaluate((button) => button === document.activeElement);
    if (reached) expect(await sheet.evaluate((popup) => popup.scrollTop)).toBe(place);
  }
  if (!reached) throw new Error(`Shift+Tab does not reach Close within ${presses} presses`);
  await expect(close).toBeFocused();
}

for (const { path, name, idea, section } of LINKS) {
  test(`${name} on ${path} opens its module on the section, and closing gives the focus back`, async ({ page }) => {
    await seedInHold(page);
    await page.goto(path);
    const link = page.getByRole('button', { name, exact: true });
    await link.press('Enter');

    const sheet = page.getByRole('dialog', { name: idea });
    await expect(sheet).toBeVisible();
    const heading = sheet.getByRole('heading', { level: 2, name: section });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe(path);

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

    // A module has no foot, so `Close` stays in view over a long one, and the section it opened on stands clear of it.
    const close = sheet.getByRole('button', { name: 'Close' });
    await expect(close).toBeInViewport({ ratio: 1 });
    const [closeBox, headingBox] = await Promise.all([close.boundingBox(), heading.boundingBox()]);
    if (closeBox === null || headingBox === null) throw new Error('both stand on the page');
    expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(headingBox.y);

    // `Close` is sticky, so a browser that scrolled to reveal it would only cost the reader the place. Shift+Tab walks
    // back to it. What WebKit's Tab does with links differs by platform: it skips them on Windows and macOS and reaches
    // them on Linux, as the other engines do. Where it reaches them, a link standing before the section (the cycles
    // module's Risk link) is a stop on the way, and its reveal may scroll; only the press that lands on `Close` is
    // under test, and it must leave the place where it was.
    await shiftTabToClose(page, sheet, close);

    await close.click();
    await expect(sheet).toBeHidden();
    await expect(link).toBeFocused();
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

// docs/DESIGN.md §6 and §8: a link Tab reaches under the stuck `Close` stops with its whole ring clear of it, by the
// module's scroll margin, since the popup's padding is only the ring's extent. The cycles module's Risk link is its
// one link, so it is the stop after `Close`; scrolled 20 px below the popup's top, it starts under the button.
test('a link Tab reaches under Close stops with its ring clear of it', async ({ page }, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: a runtime skip where WebKit's Tab may skip links, not a disabled test
  test.skip(
    testInfo.project.name === 'iphone',
    "WebKit's Tab differs by platform: it skips links on Windows and macOS (reaches them on Linux), so it may never land on the link",
  );
  await seedInHold(page);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Why? The sell window', exact: true }).press('Enter');
  const sheet = page.getByRole('dialog', { name: CYCLES });
  await expect(sheet.getByRole('heading', { level: 2, name: WINDOW })).toBeFocused();
  const close = sheet.getByRole('button', { name: 'Close' });
  const link = sheet.getByRole('link', { name: 'Risk disclosure' });

  await close.focus();
  await link.evaluate((element) => {
    const popup = element.closest('[role="dialog"]');
    if (popup === null) throw new Error('the link stands in the popup');
    popup.scrollTop += element.getBoundingClientRect().top - popup.getBoundingClientRect().top - 20;
  });
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();

  const button = await close.boundingBox();
  if (button === null) throw new Error('Close stands on the page');
  // Each line of the link, grown by the ring's extent (`--focus-offset` and `--focus-width`, 4 px), against the button.
  const covered = await link.evaluate(
    (element, { x, y, width, height }) =>
      [...element.getClientRects()].filter(
        (line) => line.left - 4 < x + width && x < line.right + 4 && line.top - 4 < y + height && y < line.bottom + 4,
      ).length,
    button,
  );
  expect(covered).toBe(0);
});

// docs/LEGAL.md §4: the line under the figures carries the Risk link. Learn's route opens with no plan, so that
// reader has met no disclosure; the sheet opens only with one.
test('the Risk link stands beside the past-performance line, with no plan and in the sheet', async ({ page }) => {
  const line = 'Past performance is not a reliable indicator of future results.';
  await page.goto('/learn/cycles');
  await expect(page.getByText(line).getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');

  await seedInHold(page);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Why? The three parts', exact: true }).press('Enter');
  const sheet = page.getByRole('dialog', { name: CYCLES });
  await expect(sheet.getByText(line).getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
});

// docs/EDUCATION.md, the links table: Portfolio's P/L line opens Risk honestly at its top, since the module is the
// answer as a whole; the link stands wherever the P/L does. Escape closes, as a press of Close does above.
test("the P/L line's Why? on /portfolio opens Risk honestly, and closing gives the focus back", async ({ page }) => {
  await seedInHold(page);
  await page.goto('/portfolio');
  const link = page.getByRole('button', { name: 'Why? Your profit and loss', exact: true });
  await link.press('Enter');
  const sheet = page.getByRole('dialog', { name: RISK });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2, name: 'The order that matters' })).toBeAttached();
  expect(new URL(page.url()).pathname).toBe('/portfolio');

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(link).toBeFocused();
});

// #24 D8: an opened purchase row's holding line carries the Why? right after its date, which opens the tax module on
// the plan's country's card (docs/EDUCATION.md §4): Portugal's heading takes the focus below Close, and the sheet lists
// no other countries. Escape gives the focus back to the link.
test("the Log's holding date's Why? opens the tax module on Portugal's card", async ({ page }) => {
  await seedInHold(page);
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: /Monthly buy/u }).first().click();
  const link = page.getByRole('button', { name: 'Why? The tax-free date', exact: true });
  await expect(link).toHaveCount(1);
  await link.press('Enter');

  const sheet = page.getByRole('dialog', { name: TAXES });
  await expect(sheet).toBeVisible();
  const heading = sheet.getByRole('heading', { level: 2, name: 'Portugal', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(sheet.getByRole('heading', { name: 'Other countries' })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/log');

  const close = sheet.getByRole('button', { name: 'Close' });
  await expect(close).toBeInViewport({ ratio: 1 });
  const [closeBox, headingBox] = await Promise.all([close.boundingBox(), heading.boundingBox()]);
  if (closeBox === null || headingBox === null) throw new Error('both stand on the page');
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(headingBox.y);

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

  await shiftTabToClose(page, sheet, close);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(link).toBeFocused();
});

test('from /learn the Risk honestly row opens its module', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('link', { name: /^Risk honestly/u }).click();
  await expect(page).toHaveURL(/\/learn\/risk-honestly$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Risk honestly' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Keeping coins yourself' })).toBeVisible();
});

test('from /learn the row opens the same module', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('link', { name: /^Start here/u }).click();
  await expect(page).toHaveURL(/\/learn\/start-here$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Start here' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Why some people hold' })).toBeVisible();
});
