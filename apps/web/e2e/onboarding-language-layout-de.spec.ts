import { expect, type Locator, type Page } from '@playwright/test';
import deCountries from '../../../packages/app/src/lib/countries/messages/de.json' with { type: 'json' };
import deLearn from '../../../packages/app/src/messages/de/learn.json' with { type: 'json' };
import deOnboarding from '../../../packages/app/src/messages/de/onboarding.json' with { type: 'json' };
import enLearn from '../../../packages/app/src/messages/en/learn.json' with { type: 'json' };
import enOnboarding from '../../../packages/app/src/messages/en/onboarding.json' with { type: 'json' };
import deTwoCoins from '../../../packages/content/i18n/de/templates/two-coins.json' with { type: 'json' };
import gb from '../../../packages/content/jurisdictions/gb.json' with { type: 'json' };
import nl from '../../../packages/content/jurisdictions/nl.json' with { type: 'json' };
import us from '../../../packages/content/jurisdictions/us.json' with { type: 'json' };
import { test } from './support';

// German Onboarding and Learn on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8,
// docs/CONTENT-STYLE.md §10), found by the merged German files' words: every onboarding step and Learn's index and
// country cards stay inside the page with text set wider than this platform's fonts, and each control holds its own
// text inside its own box. The device sits in Amsterdam, so Onboarding names the Netherlands in its German forms;
// the disclosure stays English (docs/LEGAL.md §4) and says so with lang="en". This file runs only where
// language-layout.spec.ts does (playwright.config.ts, `narrowOnly`).

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

/** German in storage on a day in the onboarding spec's October; the page and console errors seen since. */
async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript((key) => window.localStorage.setItem(key, 'de'), LANGUAGE_STORAGE_KEY);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  return errors;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await widerText(page, '0.03em');
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

const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });
const heading = (page: Page, level: number, name: string) => page.getByRole('heading', { level, name, exact: true });
/** A label's words before its bracketed currency. */
const shown = (message: string) => message.slice(0, message.indexOf(' (')).trim();

// No price or history request is answered here, and the service worker's own requests would pass by the page's.
test.use({ serviceWorkers: 'block', timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' });

test('de: every onboarding step keeps its controls inside their boxes with wider text, the Netherlands in its forms', async ({
  page,
}) => {
  const pick = (onboarding: typeof enOnboarding) => ({
    title: onboarding.title,
    next: onboarding.next,
    back: onboarding.back,
    label: onboarding.country.label,
    template: onboarding.template.heading,
    about: onboarding.template.about,
    numbers: onboarding.numbers.heading,
    firstBuy: onboarding.numbers.firstBuy,
    lastBuy: onboarding.numbers.lastBuy,
    why: onboarding.why.heading,
    reminder: onboarding.reminder.heading,
    calendar: onboarding.reminder.calendar,
    later: onboarding.reminder.later,
    summary: onboarding.summary.heading,
    start: onboarding.start,
    riskLink: onboarding.disclosure.riskLink,
  });
  const words = pick(deOnboarding);
  expectGerman(words, pick(enOnboarding));
  const netherlands = deCountries.NL;
  const errors = await boot(page);
  await open(page, '/onboarding');
  await expect(heading(page, 1, words.title)).toBeVisible();

  // Country: Amsterdam's device in Dutch suggests the Netherlands with confidence, so the confirm stands ready and
  // names them in their `with` form (the picker's own names are out of this branch: they stay the profiles').
  await expect(page.getByText(`Dieses Gerät schlägt ${netherlands.the} vor.`, { exact: true })).toBeVisible();
  const select = page.getByRole('combobox', { name: words.label });
  await expect(select).toHaveText(new RegExp(nl.name, 'u'));
  const confirm = button(page, `Weiter ${netherlands.with}`);
  await ownBoxes(page, { select, confirm });
  await confirm.click();

  // Template: the German name of the two-coins starting point.
  await expect(heading(page, 2, words.template)).toBeFocused();
  const radio = page.getByRole('radio', { name: deTwoCoins.name, exact: true });
  await radio.click();
  // The picked starting point's explanation sits behind one closed control under the cards.
  await ownBoxes(page, { radio, about: button(page, words.about), next: button(page, words.next) });
  await button(page, words.next).click();

  // Amounts and dates.
  await expect(heading(page, 2, words.numbers)).toBeFocused();
  const monthly = page.getByLabel(new RegExp(`^${shown(deOnboarding.numbers.monthly)}`, 'u'));
  const starting = page.getByLabel(new RegExp(`^${shown(deOnboarding.numbers.starting)}`, 'u'));
  const firstBuy = page.getByLabel(new RegExp(`^${words.firstBuy}`, 'u'));
  const lastBuy = page.getByLabel(new RegExp(`^${words.lastBuy}`, 'u'));
  await monthly.fill('100');
  await lastBuy.fill('2036-10-01');
  await ownBoxes(page, { monthly, starting, firstBuy, lastBuy, back: button(page, words.back) });
  await button(page, words.next).click();

  // The sentence, then the reminder.
  await expect(heading(page, 2, words.why)).toBeFocused();
  await ownBoxes(page, { sentence: page.getByRole('textbox', { name: words.why }), next: button(page, words.next) });
  await button(page, words.next).click();
  await expect(heading(page, 2, words.reminder)).toBeFocused();
  await ownBoxes(page, { calendar: button(page, words.calendar), later: button(page, words.later) });
  await button(page, words.later).click();

  // Summary: the Netherlands' holding rule in its `for` form, the English disclosure marked as English.
  await expect(heading(page, 2, words.summary)).toBeFocused();
  await expect(page.getByText(`Die Haltefrist ${netherlands.for}.`, { exact: false })).toBeVisible();
  const disclosure = page.getByText(enOnboarding.disclosure.text.slice('{product}'.length, 50), { exact: false });
  await expect(disclosure).toHaveAttribute('lang', 'en');
  const risk = page.getByRole('link', { name: words.riskLink, exact: true });
  // The link runs inline in the disclosure, so its paragraph is the box that holds it.
  await ownBoxes(page, {
    disclosure: risk.locator('xpath=..'),
    back: button(page, words.back),
    start: button(page, words.start),
  });
  expect(errors).toEqual([]);
});

test('de: Learn keeps its index and the NL, GB and US cards inside the page with wider text', async ({ page }) => {
  const pick = (learn: typeof enLearn) => ({
    title: learn.title,
    countries: learn.countries.title,
    line: learn.countries.line,
    back: learn.countries.back,
    inEnglish: learn.card.inEnglish,
    holdingRule: learn.card.holdingRule,
  });
  const words = pick(deLearn);
  expectGerman(words, pick(enLearn));
  const errors = await boot(page);
  await open(page, '/learn');
  await expect(heading(page, 1, words.title)).toBeVisible();
  const row = page.getByRole('link', { name: new RegExp(`^${words.countries}`, 'u') });
  await ownBoxes(page, { row });

  for (const [code, country] of [
    ['nl', nl],
    ['gb', gb],
    ['us', us],
  ] as const) {
    await open(page, `/learn/countries/${code}`);
    await expect(heading(page, 1, country.name)).toHaveAttribute('lang', 'en');
    const card = page.getByRole('article');
    await expect(card.getByText(words.inEnglish, { exact: true })).toBeVisible();
    const forms = deCountries[code.toUpperCase() as keyof typeof deCountries];
    const sources = card.getByRole('heading', { level: 2, name: `Quellen ${forms.for}`, exact: true });
    const back = page.getByRole('link', { name: words.back, exact: true });
    const firstSource = card.getByRole('link', { name: /^Quellen für / }).first();
    await ownBoxes(page, { back, sources, firstSource });
  }
  expect(errors).toEqual([]);
});
