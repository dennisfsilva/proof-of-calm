import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import enPlan from '../../../packages/app/src/messages/en/plan.json' with { type: 'json' };
import enPortfolio from '../../../packages/app/src/messages/en/portfolio.json' with { type: 'json' };
import enSettings from '../../../packages/app/src/messages/en/settings.json' with { type: 'json' };
import enToday from '../../../packages/app/src/messages/en/today.json' with { type: 'json' };
import ptPlan from '../../../packages/app/src/messages/pt-PT/plan.json' with { type: 'json' };
import ptPortfolio from '../../../packages/app/src/messages/pt-PT/portfolio.json' with { type: 'json' };
import ptSettings from '../../../packages/app/src/messages/pt-PT/settings.json' with { type: 'json' };
import ptToday from '../../../packages/app/src/messages/pt-PT/today.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// pt-PT's long dates on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8): "28 de fevereiro
// de 2026" keeps its month name and its no-break spaces (docs/CONTENT-STYLE.md §4), so a table whose columns are then
// wider than its box stacks each row's cells, measured afresh at every change and stored nowhere
// (docs/research/narrow-tables.md). The Log, Today's dates table, Portfolio's value table and its Holdings with a coin's
// daily closes open stay inside their box with every amount's € in view; `data-stacked` always agrees with a measure taken here; English keeps their columns.

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

/**
 * The summaries that open Today's dates table and Portfolio's value table, read from the app's merged message files of
 * each language the test boots in, so a run finds them by the words its screen shows, whatever those are translated to.
 */
const SUMMARIES = {
  en: { today: enToday.strip.table, portfolio: enPortfolio.chart.table.summary },
  'pt-PT': { today: ptToday.strip.table, portfolio: ptPortfolio.chart.table.summary },
} as const;

type Language = keyof typeof SUMMARIES;

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

/** The Log's entries table, Today's dates table or Portfolio's value table, opened by its summary in `language`. */
async function tableOf(page: Page, screen: 'log' | 'today' | 'portfolio', language: Language): Promise<Locator> {
  await open(page, `/${screen}`);
  if (screen === 'log') return page.locator('main#main table[data-slot="table"]');
  const summary = SUMMARIES[language][screen];
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
    const table = await tableOf(page, screen, 'pt-PT');
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

test("pt-PT: a coin's daily closes open in Holdings stack inside its row and keep Holdings inside its box", async ({
  page,
}) => {
  const errors = await boot(page, 'pt-PT');
  await open(page, '/portfolio');
  const holdings = page.locator('main#main table[data-slot="table"]');
  await holdings.locator('tbody button[aria-expanded]').first().click();
  const details = holdings.locator('details[data-slot="chart-table"]');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  const closes = details.locator('table');
  await expect(closes).toContainText(/de\s\S+\sde\s20\d\d/);
  // The closes' four columns are wider than the row's cell: they stack there instead of widening Holdings.
  expect((await expectFitting(closes)).stacked).toBe(true);
  // Whenever Holdings does scroll, its wrapper is the tab stop a keyboard user scrolls it with (WCAG 2.1.1).
  const wrapper = await holdings.evaluate((element) => {
    const box = element.parentElement as HTMLElement;
    return { scrolls: box.scrollWidth > box.clientWidth, tabindex: box.getAttribute('tabindex') };
  });
  if (wrapper.scrolls) expect(wrapper.tabindex, 'a Holdings that scrolls is a tab stop').toBe('0');
  // Holdings does not stack, so a fresh measure wider than its box would be a Holdings that scrolls.
  await expectFitting(holdings);
  expect(errors).toEqual([]);
});

test('pt-PT at 125 % text: the Log unstacks at a 16 px root and stacks again at 20 px, every time it changes', async ({
  page,
}, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: the 20 px root is the zoom-125 project's, a runtime skip elsewhere
  test.skip(testInfo.project.name !== 'zoom-125', 'the text-size round trip runs on zoom-125');
  const errors = await boot(page, 'pt-PT');
  const table = await tableOf(page, 'log', 'pt-PT');
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
  const table = await tableOf(page, 'log', 'pt-PT');
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

/** Widens every glyph's advance by `spacing`, through the CSSOM: a stand-in for a platform whose fonts run wider. */
function widerText(page: Page, spacing: string) {
  return page.evaluate((value) => {
    document.body.style.letterSpacing = value;
  }, spacing);
}

/** No plan stored, the language pt-PT: the shell opens onboarding's first step. */
async function bootEmpty(page: Page): Promise<Errors> {
  const errors: Errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript((key) => window.localStorage.setItem(key, 'pt-PT'), LANGUAGE_STORAGE_KEY);
  return errors;
}

/** Whether the page scrolls sideways, and the innermost elements that end past the viewport, to name in a failure. */
function pastTheViewport(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const past = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => element.getBoundingClientRect().right > width + 0.5)
      .filter((element) => getComputedStyle(element).position !== 'absolute')
      .filter((element) => ![...element.children].some((child) => child.getBoundingClientRect().right > width + 0.5))
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`);
    return { scrolls: document.documentElement.scrollWidth > width, past };
  });
}

// CI's Linux fonts set pt-PT's Portfolio about a pixel wider than this machine's (run 43803113963, zoom-125): text
// spaced 0.03 em wider stands in for them, so the case fails on every platform while a row cannot wrap.
for (const path of ['/portfolio', '/onboarding'] as const) {
  test(`pt-PT: ${path} stays inside the page with text set wider than this platform's fonts`, async ({ page }) => {
    const errors = path === '/portfolio' ? await boot(page, 'pt-PT') : await bootEmpty(page);
    await open(page, path);
    await expect(page).toHaveURL(new RegExp(path));
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await widerText(page, '0.03em');
    await settled(page);
    const now = await pastTheViewport(page);
    expect(now.past, 'nothing ends past the viewport').toEqual([]);
    expect(now.scrolls, 'no page-wide horizontal scroll').toBe(false);
    expect(errors).toEqual([]);
  });
}

// Plan in pt-PT, its heading and its timeline's table found by the merged pt-PT file's words, the table open, as the
// widest state of the screen: it stays inside the page with the same wider text.
test("pt-PT: /plan stays inside the page with its timeline's table open and text set wider than this platform's fonts", async ({
  page,
}) => {
  const words = { title: ptPlan.title, table: ptPlan.timeline.table.summary, why: ptPlan.why.window };
  const english: typeof words = { title: enPlan.title, table: enPlan.timeline.table.summary, why: enPlan.why.window };
  // Each word on its own, so one key left in English fails the case.
  for (const key of Object.keys(words) as (keyof typeof words)[]) {
    expect(words[key], `the merged pt-PT file holds Plan's own ${key}`).not.toBe(english[key]);
  }
  const errors = await boot(page, 'pt-PT');
  await open(page, '/plan');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(words.title);
  const details = page.locator('details[data-slot="chart-table"]', {
    has: page.getByText(words.table, { exact: true }),
  });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('table')).toContainText(/de\s\S+\sde\s20\d\d/);
  // Each Why? control's name starts with its visible pt-PT word (WCAG 2.5.3, axe's label-content-name-mismatch).
  await expect(page.getByRole('button', { name: words.why, exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  await widerText(page, '0.03em');
  await settled(page);
  const now = await pastTheViewport(page);
  expect(now.past, 'nothing ends past the viewport').toEqual([]);
  expect(now.scrolls, 'no page-wide horizontal scroll').toBe(false);
  expect(errors).toEqual([]);
});

// Settings in pt-PT, its tabs found by the merged pt-PT file's words: the Plan, Hold & sell and Data tabs, the longest
// of its words, stay inside the page with the same wider text.
test('pt-PT: /settings keeps its Plan, Hold and Data tabs inside the page with text set wider than its fonts', async ({
  page,
}) => {
  const tabs = { plan: ptSettings.tabs.plan, hold: ptSettings.tabs.hold, data: ptSettings.tabs.data };
  const english: typeof tabs = { plan: enSettings.tabs.plan, hold: enSettings.tabs.hold, data: enSettings.tabs.data };
  // Each tab's name on its own, so one left in English fails the case.
  for (const key of Object.keys(tabs) as (keyof typeof tabs)[]) {
    expect(tabs[key], `the merged pt-PT file holds Settings' own ${key} tab`).not.toBe(english[key]);
  }
  expect(ptSettings.title).not.toBe(enSettings.title);
  const errors = await boot(page, 'pt-PT');
  await open(page, '/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ptSettings.title);
  // What each tab's own panel shows, found by the tab's name, since the panel left keeps its contents while it closes:
  // the form's save button, or the data section's heading.
  const panel = (key: keyof typeof tabs) => page.getByRole('tabpanel', { name: tabs[key], exact: true });
  const shown = {
    plan: panel('plan').getByRole('button', { name: ptSettings.save, exact: true }),
    hold: panel('hold').getByRole('button', { name: ptSettings.save, exact: true }),
    data: panel('data').getByRole('heading', { level: 2, name: ptSettings.data.heading, exact: true }),
  };
  await widerText(page, '0.03em');
  for (const key of Object.keys(tabs) as (keyof typeof tabs)[]) {
    const tab = page.getByRole('tab', { name: tabs[key], exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(shown[key]).toBeVisible();
    await settled(page);
    const now = await pastTheViewport(page);
    expect(now.past, `nothing on the ${key} tab ends past the viewport`).toEqual([]);
    expect(now.scrolls, `no page-wide horizontal scroll on the ${key} tab`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("in English, the Log's, Today's dates and Portfolio's value tables keep their columns", async ({ page }) => {
  const errors = await boot(page, null);
  for (const screen of ['log', 'today', 'portfolio'] as const) {
    const table = await tableOf(page, screen, 'en');
    await expect(table).toContainText(/\d\s\S{3}\s20\d\d/);
    const now = await expectFitting(table, screen !== 'today');
    expect(now.stacked, `${screen} keeps its columns`).toBe(false);
  }
  expect(errors).toEqual([]);
});
