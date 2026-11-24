import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import deLog from '../../../packages/app/src/messages/de/log.json' with { type: 'json' };
import dePortfolio from '../../../packages/app/src/messages/de/portfolio.json' with { type: 'json' };
import enLog from '../../../packages/app/src/messages/en/log.json' with { type: 'json' };
import enPortfolio from '../../../packages/app/src/messages/en/portfolio.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// German Portfolio and Log on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8,
// docs/CONTENT-STYLE.md §10), found by the merged German files' words: each screen stays inside the page with text set
// wider than this platform's fonts (CI's Linux fonts run about a pixel wider), and each control holds its own text
// inside its own box. The tables' own stacking cases are language-layout.spec.ts's; this file runs only where that one
// does (playwright.config.ts, `narrowOnly`).

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

/** The fixture with an extra buy on 28 February beside its 20 September sale, as language-layout.spec.ts seeds it. */
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

/** The fixture plan in German on its buy-phase day; the page and console errors seen since. */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript((key) => window.localStorage.setItem(key, 'de'), LANGUAGE_STORAGE_KEY);
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await routeFixturePrices(page, nowMs);
  await seedPlan(page, withLongDates());
  return errors;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
}

/** Two frames later: every observer has reported and the page has laid out again. */
function settled(page: Page) {
  return page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** Widens every glyph's advance by `spacing`, through the CSSOM: a stand-in for a platform whose fonts run wider. */
function widerText(page: Page, spacing: string) {
  return page.evaluate((value) => {
    document.body.style.letterSpacing = value;
  }, spacing);
}

/** Sets the root's text size, as the zoom-125 project's 125 % text does, through the CSSOM. */
function rootFont(page: Page, size: string) {
  return page.evaluate((value) => {
    document.documentElement.style.fontSize = value;
  }, size);
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

/** Each control is shown and holds its text inside its own box, and nothing ends past the viewport. */
async function ownBoxes(page: Page, controls: Record<string, Locator>) {
  await settled(page);
  for (const [key, control] of Object.entries(controls)) {
    await expect(control, `the ${key} control is shown`).toBeVisible();
    const box = await control.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(box.client, `the ${key} control has a box of its own`).toBeGreaterThan(0);
    expect(box.scroll, `the ${key} control's text stays inside its ${box.client} px box`).toBeLessThanOrEqual(
      box.client,
    );
  }
  const now = await pastTheViewport(page);
  expect(now.past, 'nothing ends past the viewport').toEqual([]);
  expect(now.scrolls, 'no page-wide horizontal scroll').toBe(false);
}

/** Each word on its own, so one key left in English fails the case. */
function expectGerman<T extends Record<string, string>>(words: T, english: T) {
  for (const key of Object.keys(words)) {
    expect(words[key]?.length, `the German ${key} has words`).toBeGreaterThan(0);
    expect(words[key], `the merged de file holds the German ${key}`).not.toBe(english[key]);
  }
}

/** What a screen shows of a message: its words before the first placeholder, or its select's `exempt` branch. */
const shown = (message: string) => message.slice(0, message.indexOf('{')).trim();
const exemptBranch = (message: string) => /exempt \{([^{}]*)\}/.exec(message)?.[1] ?? '';
/** The sale warning's words between its date and its units, in the branch where none of the sale is past the rule. */
const noneBetween = (message: string) => /none \{[^{}]*\{date\}([^{}]*)\{sold\}/.exec(message)?.[1]?.trim() ?? '';
/** A label with its `{coin}` and `{currency}` filled in, as the sheet names the field. */
const label = (message: string) => message.replace('{coin}', 'BTC').replace('{currency}', 'EUR');

const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });

/** Opens a sheet with `control` and waits for its heading and its animations. */
async function sheetOf(page: Page, control: Locator, heading: string) {
  await control.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await sheet.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((each) => each.finished)));
  return sheet;
}

// The fixture prices answer /api/prices and /api/history here, which the service worker's own requests would pass by.
test.use({ serviceWorkers: 'block' });

test("de: Portfolio keeps its value table, its ranges and its P/L inside their boxes with wider text", async ({
  page,
}) => {
  const range = (portfolio: typeof enPortfolio, key: keyof typeof enPortfolio.chart.ranges) =>
    portfolio.chart.rangeNames[key].replace('{label}', portfolio.chart.ranges[key]);
  // The screen's name is `Portfolio` in both languages, so it is no sign of the translation.
  const pick = (portfolio: typeof enPortfolio) => ({
    pnl: portfolio.summary.pnl,
    why: portfolio.summary.why,
    table: portfolio.chart.table.summary,
    '7d': range(portfolio, '7d'),
    '30d': range(portfolio, '30d'),
    '90d': range(portfolio, '90d'),
    '1y': range(portfolio, '1y'),
    all: range(portfolio, 'all'),
  });
  const words = pick(dePortfolio);
  expectGerman(words, pick(enPortfolio));
  const errors = await boot(page);
  await open(page, '/portfolio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(dePortfolio.title);
  await widerText(page, '0.03em');
  const pnl = page.locator('main#main dt').filter({ hasText: new RegExp(`^${words.pnl}$`, 'u') });
  await ownBoxes(page, {
    pnl,
    pnlFigure: pnl.locator('xpath=following-sibling::dd[1]'),
    why: button(page, words.why),
    '7d': button(page, words['7d']),
    '30d': button(page, words['30d']),
    '90d': button(page, words['90d']),
    '1y': button(page, words['1y']),
    all: button(page, words.all),
  });

  const details = page.locator('details[data-slot="chart-table"]', { has: page.getByText(words.table, { exact: true }) });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  const table = details.locator('table');
  await expect(table).toContainText(/\d\d?\.\s\S+\s20\d\d/);
  await ownBoxes(page, { summary: details.locator('summary') });
  const fits = await table.evaluate((element) => {
    const scroller = element.parentElement as HTMLElement;
    const right = scroller.getBoundingClientRect().right;
    return {
      scrolls: scroller.scrollWidth > scroller.clientWidth,
      cells: [...element.querySelectorAll('td, th')]
        .filter((cell) => cell.getBoundingClientRect().width > 0)
        .every((cell) => cell.getBoundingClientRect().right <= right + 0.5),
    };
  });
  expect(fits.scrolls, "the value table's scroller does not scroll").toBe(false);
  expect(fits.cells, 'every cell ends inside the scroller').toBe(true);
  expect(errors).toEqual([]);
});

test("de: the Log keeps its table, a row's details, the add sheet and the sale warning inside their boxes", async ({
  page,
}) => {
  const pick = (log: typeof enLog) => ({
    title: log.title,
    entry: log.table.entry,
    amount: log.table.amount,
    record: log.record,
    held: log.recordHeld,
    moved: log.recordMoved,
    exempt: shown(log.holding.exempt),
    why: exemptBranch(log.holding.why),
    edit: log.row.edit,
    delete: log.row.delete,
    sheet: log.form.title.dca,
    saleSheet: log.form.title.sell,
    dca: log.kind.dca,
    extra: log.kind.extra,
    sell: log.kind.sell,
    save: log.form.save,
    sold: label(log.form.sold),
    received: label(log.form.received),
    warning: noneBetween(log.form.saleWarning.exempt),
  });
  const words = pick(deLog);
  expectGerman(words, pick(enLog));
  const errors = await boot(page);
  await open(page, '/log');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(words.title);
  const table = page.locator('main#main table[data-slot="table"]');
  await expect(table.locator('thead')).toContainText(words.entry);
  await expect(table.locator('thead')).toContainText(words.amount);
  await widerText(page, '0.03em');
  await ownBoxes(page, {
    record: button(page, words.record),
    held: button(page, words.held),
    moved: button(page, words.moved),
  });

  const row = table.locator('tbody button[aria-expanded]', { hasText: /28\.\s\S+\s2026/ });
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await ownBoxes(page, {
    row,
    exempt: table.getByText(words.exempt).filter({ visible: true }),
    why: button(table, words.why),
    edit: button(table, words.edit),
    delete: button(table, words.delete),
  });

  const sheet = await sheetOf(page, button(page, words.record), words.sheet);
  await ownBoxes(page, {
    dca: button(sheet, words.dca),
    extra: button(sheet, words.extra),
    sell: button(sheet, words.sell),
    save: button(sheet, words.save),
  });

  // Every BTC in the fixture was bought within the last 365 days, so none of the sale is past the holding rule.
  await button(sheet, words.sell).click();
  await expect(sheet.getByRole('heading', { name: words.saleSheet, exact: true })).toBeVisible();
  await sheet.getByLabel(words.sold).fill('0.001');
  await sheet.getByLabel(words.received).fill('60');
  const warning = sheet.getByRole('status').filter({ hasText: words.warning });
  await ownBoxes(page, {
    sold: sheet.locator('label', { hasText: words.sold }),
    received: sheet.locator('label', { hasText: words.received }),
    warning,
  });
  const inside = await warning.evaluate((element) => {
    const own = element.getBoundingClientRect();
    const box = element.closest('[role="dialog"]')?.getBoundingClientRect();
    return box !== undefined && own.left >= box.left - 0.5 && own.right <= box.right + 0.5;
  });
  expect(inside, "the sale warning's box lies inside the sheet").toBe(true);
  expect(errors).toEqual([]);
});

// The move sheet's fill-all button shares its row with the sent units' input: at the project's text size and at 125 %
// text, the button lies inside the sheet and its label inside the button (docs/DESIGN.md §8, Button), as pt-PT's does.
test("de: the Log's move sheet keeps each control and its fill-all button inside the sheet at 125 % text", async ({
  page,
}) => {
  const pick = (log: typeof enLog) => ({
    moved: log.recordMoved,
    title: log.move.title.new,
    to: log.move.to,
    sent: log.move.sent,
    received: log.move.received,
    all: log.move.all,
    save: log.move.save,
  });
  const words = pick(deLog);
  expectGerman(words, pick(enLog));
  const errors = await boot(page);
  await open(page, '/log');
  const sheet = await sheetOf(page, button(page, words.moved), words.title);
  const all = button(sheet, words.all);
  for (const size of [null, '20px'] as const) {
    if (size !== null) await rootFont(page, size);
    await ownBoxes(page, {
      to: sheet.locator('label', { hasText: words.to }),
      sent: sheet.locator('label', { hasText: words.sent }),
      received: sheet.locator('label', { hasText: words.received }),
      all,
      save: button(sheet, words.save),
    });
    const boxes = await all.evaluate((element) => {
      const dialog = element.closest('[role="dialog"]');
      if (dialog === null) throw new Error('the button sits in the sheet');
      const own = element.getBoundingClientRect();
      const box = dialog.getBoundingClientRect();
      return {
        inside: own.left >= box.left - 0.5 && own.right <= box.right + 0.5,
        own: [own.left, own.right],
        box: [box.left, box.right],
      };
    });
    const at = size ?? "the project's text size";
    expect(boxes.inside, `at ${at}, the button's box ${boxes.own} lies inside the sheet's ${boxes.box}`).toBe(true);
  }
  expect(errors).toEqual([]);
});
