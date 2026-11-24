import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import dePlan from '../../../packages/app/src/messages/de/plan.json' with { type: 'json' };
import enPlan from '../../../packages/app/src/messages/en/plan.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// German Plan and its review on the narrow projects, android-small and zoom-125 (docs/DESIGN.md §7 and §8,
// docs/CONTENT-STYLE.md §10), found by the merged German file's words: the reference and totals, the timeline with its
// table and the holding rule's milestone, and /plan/review stay inside the page with text set wider than this
// platform's fonts, and each control holds its own text inside its own box. The fixture plan is Portugal's, so the
// country stands bare after the review's colon. The page's clock is fixed at the fixture's buy-phase instant; this
// file runs only where language-layout-de.spec.ts does (playwright.config.ts, `narrowOnly`).

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

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
  await seedPlan(page, fixtureSnapshot());
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

/** What a screen shows of a message: its words before the first placeholder. */
const shown = (message: string) => message.slice(0, message.indexOf('{')).trim();
/** A select's `other` branch up to its first placeholder ("Länderprofil" of "Länderprofil {countryFor} ansehen"). */
const otherLead = (message: string) => /other \{([^{}]*)\{/.exec(message)?.[1]?.trim() ?? '';
/** A message's words with its regular-expression characters escaped. */
const literal = (words: string) => words.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });
const link = (scope: Page | Locator, name: string) => scope.getByRole('link', { name, exact: true });

// The fixture prices answer /api/prices and /api/history here, which the service worker's own requests would pass by.
test.use({ serviceWorkers: 'block' });

test("de: Plan keeps its reference, totals, timeline and holding rule, and each control inside its box", async ({
  page,
}) => {
  // The screen's name is `Plan` in both languages, so it is no sign of the translation.
  const pick = (plan: typeof enPlan) => ({
    reference: shown(plan.reference.window),
    planned: /\{planned\} ([^{}(]*) \(/u.exec(plan.totals.planned)?.[1] ?? '',
    timeline: plan.timeline.heading,
    table: plan.timeline.table.summary,
    exempt: plan.timeline.milestone.exempt,
    note: plan.holding.note,
    window: plan.why.window,
    parts: plan.why.parts,
    pause: plan.pause.pause,
    end: plan.endBuying.title,
    edit: plan.edit,
    review: plan.change.review,
  });
  const words = pick(dePlan);
  expectGerman(words, pick(enPlan));
  const errors = await boot(page);
  await open(page, '/plan');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(dePlan.title);
  await expect(page.getByText(new RegExp(`^${literal(words.reference)}`, 'u'))).toBeVisible();
  await expect(page.getByText(new RegExp(literal(words.planned), 'u'))).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: words.timeline, exact: true })).toBeVisible();
  await expect(page.getByText(words.note, { exact: true })).toHaveCount(1);

  const timeline = page.locator('[data-slot="timeline"]');
  await expect(timeline.locator('[aria-current="date"]')).toBeVisible();
  const details = timeline.locator('details', { has: page.getByText(words.table, { exact: true }) });
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  // The holding rule's milestone: Portugal's 365 days make the last buy's first tax-free day a row of the table.
  await expect(details.locator('table')).toContainText(words.exempt);

  await widerText(page, '0.03em');
  for (const size of [null, '20px']) {
    if (size !== null) await rootFont(page, size);
    await ownBoxes(page, {
      timeline: page.getByRole('heading', { level: 2, name: words.timeline, exact: true }),
      table: details.locator('summary'),
      // The Why? controls are buttons named by their aria-label, which opens with the visible word (why-link.tsx).
      window: button(page, words.window),
      parts: button(page, words.parts),
      pause: button(page, words.pause),
      end: button(page, words.end),
      edit: link(page, words.edit),
      review: link(page, words.review),
    });
  }
  expect(errors).toEqual([]);
});

test('de: the review keeps its headings, the country line and each control inside its box', async ({ page }) => {
  const pick = (plan: typeof enPlan) => ({
    title: plan.review.title,
    back: plan.review.back,
    right: plan.review.right.heading,
    rules: plan.review.rules.heading,
    where: plan.review.where.heading,
    country: shown(plan.review.rules.country),
    card: otherLead(plan.review.rules.link),
    log: plan.review.where.log,
    mark: plan.review.mark,
    edit: plan.edit,
    marked: shown(plan.review.marked),
  });
  const words = pick(dePlan);
  expectGerman(words, pick(enPlan));
  const errors = await boot(page);
  await open(page, '/plan/review');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(words.title);
  for (const heading of [words.right, words.rules, words.where]) {
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
  }
  // Portugal stands bare after the colon (CONTENT-STYLE §10, the country forms).
  await expect(page.getByText(`${words.country} Portugal.`, { exact: true })).toBeVisible();
  const card = page.getByRole('link', { name: new RegExp(`^${literal(words.card)} `, 'u') });

  await widerText(page, '0.03em');
  for (const size of [null, '20px']) {
    if (size !== null) await rootFont(page, size);
    await ownBoxes(page, {
      back: link(page, words.back),
      edit: link(page, words.edit),
      card,
      log: link(page, words.log),
      mark: button(page, words.mark),
    });
  }
  await expect(card).toHaveText(new RegExp(`^${literal(words.card)} für Portugal ansehen$`, 'u'));

  await button(page, words.mark).click();
  await expect(page.getByText(new RegExp(`^${literal(words.marked)}`, 'u'))).toBeVisible();
  await ownBoxes(page, { back: link(page, words.back), log: link(page, words.log) });
  expect(errors).toEqual([]);
});
