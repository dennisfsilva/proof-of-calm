import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, type Entry, exportBackup, type Instant, type Plan } from '@proofofcalm/core';
import deCountries from '../../../packages/app/src/messages/de/countries.json' with { type: 'json' };
import deSettings from '../../../packages/app/src/messages/de/settings.json' with { type: 'json' };
import enSettings from '../../../packages/app/src/messages/en/settings.json' with { type: 'json' };
import netherlands from '../../../packages/content/jurisdictions/nl.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// German Settings on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8,
// docs/CONTENT-STYLE.md §10), found by the merged German file's words: the tab bar, the Plan tab's save and calendar
// rows, the country change from the Netherlands to the United Kingdom with its currency question, the exports, the
// backup's replace dialog, the pasted file of the DCA plan page with its report, an exchange's file through its held
// question, its sections and the import, and the delete dialog with its undo.
// Each control holds its own text inside its own box with text set wider than this platform's fonts, and nothing
// ends past the viewport. This file runs only where language-layout.spec.ts does (playwright.config.ts, `narrowOnly`).

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

const fixture = fixtureSnapshot();
if (fixture.plan === null) throw new Error('the fixture has a plan');
const plan: Plan = fixture.plan;

/** The fixture plan in the Netherlands: its EUR entries make the change to the United Kingdom ask for the currency. */
const inTheNetherlands: Snapshot = {
  ...fixture,
  plan: { ...plan, country: 'NL' as Plan['country'], countryRuleVersion: netherlands.status.version },
};

/** The plan in German on the fixture's buy-phase day; the page and console errors seen since. */
async function boot(page: Page, snapshot: Snapshot = fixture, nowMs = fixtureNowMs('buy')): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript((key) => window.localStorage.setItem(key, 'de'), LANGUAGE_STORAGE_KEY);
  await page.clock.setFixedTime(new Date(nowMs));
  await routeFixturePrices(page, nowMs);
  await seedPlan(page, snapshot);
  return errors;
}

/** Settings in German on `tab`, with text set wider than this platform's fonts (CI's Linux fonts run wider). */
async function openTab(page: Page, tab: keyof typeof deSettings.tabs) {
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(deSettings.title);
  await page.getByRole('tab', { name: deSettings.tabs[tab], exact: true }).click();
  await page.evaluate(() => {
    document.body.style.letterSpacing = '0.03em';
  });
}

/** Two frames later: every observer has reported and the page has laid out again. */
function settled(page: Page) {
  return page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
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
function expectGerman(words: Record<string, string>, english: Record<string, string>) {
  for (const key of Object.keys(words)) {
    expect(words[key]?.length, `the German ${key} has words`).toBeGreaterThan(0);
    expect(words[key], `the merged de file holds the German ${key}`).not.toBe(english[key]);
  }
}

/** A select's `other` branch with its arguments filled in, as the screen shows it. */
const otherBranch = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    /other \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\}$/u.exec(message)?.[1] ?? '',
  );
const fill = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), message);

const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });

/** Opens a dialog with `control` and waits for its animations. */
async function dialogOf(page: Page, control: Locator) {
  await control.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((each) => each.finished)),
  );
  return dialog;
}

// The fixture prices answer /api/prices and /api/history here, which the service worker's own requests would pass by.
test.use({ serviceWorkers: 'block' });

test('de: the Settings tabs, the Plan save and the calendar row hold their words in their boxes', async ({ page }) => {
  const pick = (settings: typeof enSettings) => ({
    coins: settings.tabs.coins,
    hold: settings.tabs.hold,
    data: settings.tabs.data,
    save: settings.save,
    calendar: settings.reminder.calendar,
  });
  const words = pick(deSettings);
  expectGerman(words, pick(enSettings));
  const errors = await boot(page);
  await openTab(page, 'plan');
  const tabs = Object.fromEntries(
    (['plan', 'coins', 'hold', 'data'] as const).map((tab) => [
      tab,
      page.getByRole('tab', { name: deSettings.tabs[tab], exact: true }),
    ]),
  );
  await ownBoxes(page, { ...tabs, save: button(page, words.save), calendar: button(page, words.calendar) });
  expect(errors).toEqual([]);
});

test('de: the change from the Netherlands to the United Kingdom asks for the currency inside its boxes', async ({
  page,
}) => {
  const keep = fill(deSettings.country.question.keep, { logged: 'EUR' });
  const change = fill(deSettings.country.question.country, { countryCurrency: 'GBP' });
  const confirm = otherBranch(deSettings.country.confirm, { countryTo: deCountries.GB.to });
  const englishConfirm = otherBranch(enSettings.country.confirm, { countryTo: 'the United Kingdom' });
  expectGerman({ keep, change, confirm }, { keep: 'Keep EUR', change: 'Change to GBP', confirm: englishConfirm });
  const errors = await boot(page, inTheNetherlands);
  await openTab(page, 'data');
  // The select names each country by its rules file, which is English in a language without one, as German is.
  const select = page.getByRole('combobox', { name: deSettings.country.label, exact: true });
  await expect(select).toHaveText(new RegExp(`${deCountries.NL.name}|Netherlands`, 'u'));
  await select.click();
  await page.getByRole('option', { name: new RegExp(`^(${deCountries.GB.name}|United Kingdom)$`, 'u') }).click();
  await expect(page.getByText(otherBranch(deSettings.country.summary, { countryTo: deCountries.GB.to }))).toBeVisible();
  await ownBoxes(page, {
    select,
    keep: page.getByRole('radio', { name: new RegExp(`^${keep}`, 'u') }),
    change: page.getByRole('radio', { name: new RegExp(`^${change}`, 'u') }),
    confirm: button(page, confirm),
  });
  expect(errors).toEqual([]);
});

/** The fixture plan's backup with its first two entries, chosen through the file picker. */
async function chooseBackup(page: Page) {
  const backup = exportBackup(plan, fixture.entries.slice(0, 2), `${FIXTURE_DATES.buy}T10:00:00.000Z` as Instant);
  const chooser = page.waitForEvent('filechooser');
  await button(page, deSettings.data.import.choose).click();
  await (await chooser).setFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
}

test("de: the exports and a backup's replace dialog hold their words in their boxes", async ({ page }) => {
  const pick = (settings: typeof enSettings) => ({
    json: settings.data.exportJson,
    csv: settings.data.exportCsv,
    taxYear: settings.data.taxYear.export,
    choose: settings.data.import.choose,
    replace: settings.data.import.replace,
    addMissing: settings.data.import.addMissing,
    export: settings.data.confirm.export,
    cancel: settings.data.confirm.cancel,
  });
  const words = pick(deSettings);
  expectGerman(words, pick(enSettings));
  const errors = await boot(page);
  await openTab(page, 'data');
  await ownBoxes(page, {
    json: button(page, words.json),
    csv: button(page, words.csv),
    taxYear: button(page, words.taxYear),
    choose: button(page, words.choose),
  });
  await chooseBackup(page);
  await ownBoxes(page, { replace: button(page, words.replace), addMissing: button(page, words.addMissing) });
  const dialog = await dialogOf(page, button(page, words.replace));
  await ownBoxes(page, {
    export: button(dialog, words.export),
    cancel: button(dialog, words.cancel),
    replace: button(dialog, words.replace),
  });
  await button(dialog, words.replace).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(fill(deSettings.data.import.replaced, { count: '2' }), { exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

// The golden two-coins export of the DCA plan page (18 purchases), with a tax note the import leaves out.
const prototypeFile = {
  ...JSON.parse(readFileSync(new URL('../../../packages/core/test/golden/two-coins.json', import.meta.url), 'utf8'))
    .state,
};
prototypeFile.settings = { ...prototypeFile.settings, taxNote: 'Ask the accountant.' };

test('de: a pasted file of the DCA plan page and its report hold their words in their boxes', async ({ page }) => {
  const pick = (settings: typeof enSettings) => ({
    paste: settings.data.paste.label,
    read: settings.data.paste.read,
    replace: settings.data.import.replace,
    taxNote: settings.data.prototype.report['tax-note-dropped'],
  });
  const words = pick(deSettings);
  expectGerman(words, pick(enSettings));
  const errors = await boot(page);
  await openTab(page, 'data');
  const box = page.getByRole('textbox', { name: words.paste, exact: true });
  await box.fill(JSON.stringify(prototypeFile));
  await ownBoxes(page, { paste: box, read: button(page, words.read) });
  await button(page, words.read).click();
  await expect(page.getByText(fill(deSettings.data.prototype.pasted, { count: '18' }), { exact: true })).toBeVisible();
  const dialog = await dialogOf(page, button(page, words.replace));
  await ownBoxes(page, { replace: button(dialog, words.replace) });
  await button(dialog, words.replace).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(fill(deSettings.data.import.replaced, { count: '18' }), { exact: true })).toBeFocused();
  const taxNote = page.getByRole('listitem').filter({ hasText: words.taxNote });
  const report = await taxNote.locator('xpath=..').getByRole('listitem').all();
  expect(report.length, 'the report lists what the import adjusted').toBeGreaterThan(0);
  await ownBoxes(page, Object.fromEntries(report.map((item, index) => [`report line ${index + 1}`, item])));
  expect(errors).toEqual([]);
});

// The core's synthetic Kraken ledger of December 2025 (exchange-import.spec.ts reads it in English), over the fixture
// plan moved to its months, with BTC added at Ledger on 2 Dec, after the ledger's first BTC purchase, so the preview
// asks whether that purchase is those coins.
const LEDGER = fileURLToPath(
  new URL('../../../packages/core/test/exchange/kraken-synthetic-2025-12.csv', import.meta.url),
);
const LEDGER_NOW = Date.parse('2026-01-20T10:00:00Z');
const at = (day: string) => `${day}T18:00:00+01:00` as Instant;
const ledgerPlan: Plan = {
  ...plan,
  startingAmount: '0' as Plan['startingAmount'],
  firstBuy: '2025-12-01' as CalendarDate,
  buyDay: 1,
  lastBuy: '2026-11-01' as CalendarDate,
  skips: [],
  createdAt: at('2025-11-20'),
  updatedAt: at('2025-11-20'),
};
const heldAtLedger: Entry = {
  id: 'aaaaaaaa-0000-4000-8000-000000000020' as Entry['id'],
  kind: 'held',
  date: '2025-12-02' as CalendarDate,
  coin: 'BTC' as Entry['coin'],
  amount: null,
  units: '0.002' as Entry['units'],
  fee: null,
  note: '',
  slot: null,
  venue: 'Ledger',
  source: 'manual',
  createdAt: at('2025-12-02'),
  updatedAt: at('2025-12-02'),
  deletedAt: null,
};

/** A message whose arguments are each a count, or a plural of one, as a pattern of every text it can show. */
function shown(message: string, whole = true) {
  const branches = [...message.matchAll(/(?:one|other) \{((?:[^{}]|\{[^{}]*\})*)\}/gu)].map((match) => match[1] ?? '');
  const pattern = (text: string) => text.replace(/[()[\]^$.*+?|\\]/gu, '\\$&').replace(/\{[a-z]+\}/gu, '\\d+');
  const any = (branches.length > 0 ? branches : [message]).map(pattern).join('|');
  return new RegExp(whole ? `^(?:${any})$` : any, 'u');
}

test("de: an exchange's file, its held question, its sections and the import hold their words in their boxes", async ({
  page,
}) => {
  const pick = (settings: typeof enSettings) => ({
    heading: settings.data.exchange.heading,
    venue: settings.data.exchange.venue,
    addHeld: settings.data.exchange.addHeld,
    import: settings.data.exchange.import,
    cancel: settings.data.exchange.cancel,
    result: settings.data.exchange.result,
    ...Object.fromEntries(
      Object.entries(settings.data.exchange.section).map(([key, text]) => [`section.${key}`, text]),
    ),
  });
  const words = pick(deSettings);
  expectGerman(words, pick(enSettings));
  const errors = await boot(page, { ...fixture, plan: ledgerPlan, entries: [heldAtLedger] }, LEDGER_NOW);
  await openTab(page, 'data');
  await page.locator('input[type="file"]').setInputFiles(LEDGER);
  const preview = page.getByRole('region', { name: words.heading, exact: true });
  await expect(page.getByRole('heading', { name: words.heading, exact: true })).toBeFocused();
  await expect(preview.locator('[lang="en"]'), 'no English line in the German preview').toHaveCount(0);

  const held = preview.getByRole('checkbox', { name: shown(words.addHeld) });
  await held.check();
  const sections = Object.values(deSettings.data.exchange.section).map((title) =>
    preview.getByRole('button', { name: shown(title) }),
  );
  const shownSections = [];
  for (const section of sections) if ((await section.count()) > 0) shownSections.push(section);
  expect(
    shownSections.length,
    'the preview shows its monthly buys, sale, coins added and left-out lines',
  ).toBeGreaterThanOrEqual(4);
  for (const section of shownSections) await section.click();
  await ownBoxes(page, {
    venue: page.getByRole('textbox', { name: words.venue, exact: true }),
    held,
    import: preview.getByRole('button', { name: shown(words.import) }),
    cancel: button(preview, words.cancel),
    ...Object.fromEntries(shownSections.map((section, index) => [`section ${index + 1}`, section])),
  });
  const lines = await preview.getByRole('listitem').all();
  await ownBoxes(page, Object.fromEntries(lines.map((line, index) => [`preview line ${index + 1}`, line])));

  await preview.getByRole('button', { name: shown(words.import) }).click();
  await expect(page.getByRole('status').filter({ hasText: shown(words.result, false) })).toBeFocused();
  expect(errors).toEqual([]);
});

test('de: the delete dialog and its undo hold their words in their boxes', async ({ page }) => {
  const pick = (settings: typeof enSettings) => ({
    open: settings.delete.open,
    cancel: settings.delete.cancel,
    export: settings.delete.export,
    undo: settings.delete.undo,
    deleted: settings.delete.deleted,
  });
  const words = pick(deSettings);
  expectGerman(words, pick(enSettings));
  const errors = await boot(page);
  await openTab(page, 'data');
  await ownBoxes(page, { open: button(page, words.open) });
  const dialog = await dialogOf(page, button(page, words.open));
  await ownBoxes(page, {
    cancel: button(dialog, words.cancel),
    export: button(dialog, words.export),
    confirm: button(dialog, deSettings.delete.confirm),
  });
  await button(dialog, deSettings.delete.confirm).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(words.deleted)).toBeVisible();
  await ownBoxes(page, { undo: button(page, words.undo) });
  await button(page, words.undo).click();
  await expect(button(page, words.open)).toBeVisible();
  expect(errors).toEqual([]);
});
