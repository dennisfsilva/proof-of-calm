import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// pt-PT's long dates on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8): "28 de fevereiro
// de 2026" keeps its month name and its no-break spaces (docs/CONTENT-STYLE.md §4), so a table whose columns are then
// wider than its box stacks each row's cells, measured afresh at every change and stored nowhere
// (docs/research/narrow-tables.md). The Log, Today's dates table and Portfolio's value table stay inside their box with
// every amount's € in view; `data-stacked` always agrees with a measure taken here; English keeps their columns.

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

/** The fixture with an extra buy of 1234.56 EUR on 28 February, the longest Portuguese month, beside its 20 September sale. */
function withLongDates(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const february: Entry = {
    ...first,
    id: '00000000-0000-4000-8000-000000000200' as Entry['id'],
    kind: 'extra',
    date: '2026-02-28' as CalendarDate,
    amount: '1234.56' as Entry['amount'],
    units: '0.02' as Entry['units'],
    slot: null,
  };
  return { ...snapshot, entries: [...snapshot.entries, february] };
}

/** The page errors and console errors seen since boot. */
type Errors = string[];

/** The fixture plan with the long dates on its buy-phase day, in `language`, or in English when none is stored. */
async function boot(page: Page, language: string | null): Promise<Errors> {
  const errors: Errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  if (language !== null) {
    await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
      key: LANGUAGE_STORAGE_KEY,
      value: language,
    });
  }
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await routeFixturePrices(page, nowMs);
  await seedPlan(page, withLongDates());
  return errors;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
}

/** The Log's entries table, Today's dates table or Portfolio's value table, opened. */
async function tableOf(page: Page, screen: 'log' | 'today' | 'portfolio'): Promise<Locator> {
  await open(page, `/${screen}`);
  if (screen === 'log') return page.locator('main#main table[data-slot="table"]');
  const summary = screen === 'today' ? 'Show the dates as a table' : 'Show the values as a table';
  const details = page.locator('details[data-slot="chart-table"]', { has: page.getByText(summary, { exact: true }) });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  return details.locator('table');
}

/** Two frames later: every observer has reported and the table has laid out again. */
function settled(page: Page) {
  return page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** What the table shows now, and a measure of its columns side by side taken here (the attribute put back after). */
function layout(table: Locator) {
  return table.evaluate((element) => {
    const scroller = element.parentElement as HTMLElement;
    const stacked = element.hasAttribute('data-stacked');
    element.removeAttribute('data-stacked');
    const box = scroller.firstElementChild?.getBoundingClientRect().width ?? 0;
    const wider = element.getBoundingClientRect().width - box > 0.01;
    element.toggleAttribute('data-stacked', stacked);
    const right = scroller.getBoundingClientRect().right;
    const amounts = [...element.querySelectorAll('tbody *')]
      .filter((cell) => cell.childElementCount === 0 && /\d\s*€/.test(cell.textContent ?? ''))
      .filter((cell) => cell.getBoundingClientRect().width > 0)
      .map((cell) => ({ text: cell.textContent ?? '', inside: cell.getBoundingClientRect().right <= right + 0.5 }));
    const cells = [...element.querySelectorAll('td, th')]
      .filter((cell) => cell.getBoundingClientRect().width > 0)
      .every((cell) => cell.getBoundingClientRect().right <= right + 0.5);
    // Each shown row with two cells or more: its last cell's top against its first cell's bottom.
    const below = [...element.querySelectorAll<HTMLTableRowElement>('tbody tr:not([hidden])')]
      .filter((row) => row.cells.length > 1)
      .map((row) => {
        const first = row.cells[0]?.getBoundingClientRect();
        const last = row.cells[row.cells.length - 1]?.getBoundingClientRect();
        return (last?.top ?? 0) >= (first?.bottom ?? 0) - 0.5;
      });
    return {
      stacked,
      wider,
      scrolls: scroller.scrollWidth > scroller.clientWidth,
      pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
      amounts,
      cells,
      below,
    };
  });
}

/** The table fits its box, shows every cell and every amount's € (`money`: it has amounts), and is stacked exactly when its columns are wider. */
async function expectFitting(table: Locator, money = true) {
  await settled(table.page());
  const now = await layout(table);
  expect(now.stacked, 'data-stacked agrees with a fresh measure').toBe(now.wider);
  expect(now.scrolls, 'the scroller does not scroll').toBe(false);
  expect(now.pageScrolls, 'no page-wide horizontal scroll').toBe(false);
  expect(now.cells, 'every cell ends inside the scroller').toBe(true);
  if (money) expect(now.amounts.length).toBeGreaterThan(0);
  for (const amount of now.amounts) expect(amount.inside, `${amount.text} ends inside the scroller`).toBe(true);
  if (now.stacked) expect(now.below.every(Boolean), "each row's amount sits below its date").toBe(true);
  return now;
}

/** Sets the root's text size, as the zoom-125 project's 125 % text does, through the CSSOM. */
function rootFont(page: Page, size: string) {
  return page.evaluate((value) => {
    document.documentElement.style.fontSize = value;
  }, size);
}

// The fixture prices answer /api/prices and /api/history here, which the service worker's own requests would pass by.
test.use({ serviceWorkers: 'block' });

for (const screen of ['log', 'today', 'portfolio'] as const) {
  test(`pt-PT: ${screen}'s table stays inside its box, stacked exactly when its columns are wider`, async ({
    page,
  }, testInfo) => {
    const errors = await boot(page, 'pt-PT');
    const table = await tableOf(page, screen);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await expect(table).toContainText(/de\s\S+\sde\s20\d\d/);
    const money = screen !== 'today';
    const first = await expectFitting(table, money);
    // The Log's long dates are 2 px too wide at 125 % text: it stacks there.
    if (screen === 'log' && testInfo.project.name === 'zoom-125') expect(first.stacked).toBe(true);

    // Rotated and back: measured afresh each time.
    const size = page.viewportSize();
    if (size === null) throw new Error('the project sets a viewport');
    await page.setViewportSize({ width: size.height, height: size.width });
    await expectFitting(table, money);
    await page.setViewportSize(size);
    const back = await expectFitting(table, money);
    expect(back.stacked).toBe(first.stacked);
    expect(errors).toEqual([]);
  });
}

test('pt-PT at 125 % text: the Log unstacks at a 16 px root and stacks again at 20 px, every time it changes', async ({
  page,
}, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: the 20 px root is the zoom-125 project's, a runtime skip elsewhere
  test.skip(testInfo.project.name !== 'zoom-125', 'the text-size round trip runs on zoom-125');
  const errors = await boot(page, 'pt-PT');
  const table = await tableOf(page, 'log');
  await rootFont(page, '20px');
  expect((await expectFitting(table)).stacked).toBe(true);
  await rootFont(page, '16px');
  expect((await expectFitting(table)).stacked).toBe(false);
  await rootFont(page, '20px');
  expect((await expectFitting(table)).stacked).toBe(true);
  expect(errors).toEqual([]);
});

test('pt-PT: the keyboard reaches the first row toggle with its ring, and axe finds nothing on the Log', async ({
  page,
}, testInfo) => {
  const errors = await boot(page, 'pt-PT');
  const table = await tableOf(page, 'log');
  const { stacked } = await expectFitting(table);
  if (testInfo.project.name === 'zoom-125') expect(stacked).toBe(true);
  const toggle = table.locator('tbody button[aria-expanded]').first();
  for (let press = 0; press < 40; press += 1) {
    if (await toggle.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(toggle).toBeFocused();
  const ring = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).not.toBe('0px');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  expect(errors).toEqual([]);
});

test("in English, the Log's, Today's dates and Portfolio's value tables keep their columns", async ({ page }) => {
  const errors = await boot(page, null);
  for (const screen of ['log', 'today', 'portfolio'] as const) {
    const table = await tableOf(page, screen);
    await expect(table).toContainText(/\d\s\S{3}\s20\d\d/);
    const now = await expectFitting(table, screen !== 'today');
    expect(now.stacked, `${screen} keeps its columns`).toBe(false);
  }
  expect(errors).toEqual([]);
});
