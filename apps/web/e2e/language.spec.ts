import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import ptLearn from '../../../packages/app/src/messages/pt-PT/learn.json' with { type: 'json' };
import ptPlan from '../../../packages/app/src/messages/pt-PT/plan.json' with { type: 'json' };
import ptPortfolio from '../../../packages/app/src/messages/pt-PT/portfolio.json' with { type: 'json' };
import ptSettings from '../../../packages/app/src/messages/pt-PT/settings.json' with { type: 'json' };
import ptShell from '../../../packages/app/src/messages/pt-PT/shell.json' with { type: 'json' };
import portugalPt from '../../../packages/content/i18n/pt-PT/jurisdictions/pt.json' with { type: 'json' };
import germany from '../../../packages/content/jurisdictions/de.json' with { type: 'json' };
import portugal from '../../../packages/content/jurisdictions/pt.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The UI language (ADR-0023, the entry of 2026-11-15): a device preference in localStorage, read before the
// first render. The shell boots in it, sets the document's lang, loads the static and the lazy screens'
// namespaces from its files (under assets/messages/<locale>/), and an invalid value boots in English.

/** A message key where copy should be: `<namespace>.<screen>.<element>`, which use-intl renders for a missing one. */
const BARE_KEY = /\b(?:errors|learn|log|onboarding|plan|portfolio|settings|shell|today)\.[a-z][A-Za-z]*\.[a-z]/;

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';

async function bootIn(page: Page, language: string) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: LANGUAGE_STORAGE_KEY,
    value: language,
  });
}

const screenArea = (page: Page) => page.locator('main#main');

/**
 * Portugal's pt-PT text as the loader merges the overlay over English (ADR-0057): a string replaces English's, a
 * missing one or `null` keeps it, and an array merges only at English's length. A review may translate either
 * way, so no text is asserted to differ from English.
 */
const inPortuguese = (english: string, translated: string | null | undefined) => translated ?? english;
const ptConditions: readonly (string | null)[] = portugalPt.holdingRuleConditions;
const ptCondition = (index: number) =>
  inPortuguese(
    portugal.holdingRuleConditions[index] ?? '',
    ptConditions.length === portugal.holdingRuleConditions.length ? ptConditions[index] : undefined,
  );

test('boots in pt-PT from the stored language: the lang attribute, its message files and no bare key', async ({
  page,
}) => {
  await bootIn(page, 'pt-PT');
  const translated: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/messages/pt-PT/')) translated.push(response.url());
  });
  await page.goto('/today');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(screenArea(page)).not.toHaveText(BARE_KEY);
  expect(translated.some((url) => /\/today-[^/]+\.js$/.test(url))).toBe(true);

  // A lazy screen loads its namespace from the language's files and renders copy, not keys.
  await page.goto('/learn');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(screenArea(page)).not.toHaveText(BARE_KEY);
  expect(translated.some((url) => /\/learn-[^/]+\.js$/.test(url))).toBe(true);
});

test('boots in English when the stored language is not one the app has', async ({ page }) => {
  await bootIn(page, 'xx-YY');
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(screenArea(page)).not.toHaveText(BARE_KEY);
});

test.describe('when the stored language cannot load its static namespaces', () => {
  test.use({ serviceWorkers: 'block' });

  test("boots in English whole: the lang attribute, English's copy and English's date format", async ({
    page,
  }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
    test.skip(testInfo.project.name !== 'desktop', 'the boot does not depend on the viewport');
    await bootIn(page, 'pt-PT');
    const aborted: string[] = [];
    await page.route('**/assets/messages/pt-PT/**', (route) => {
      aborted.push(route.request().url());
      return route.abort();
    });
    // The fixture plan on 20 October 2026, whose October buy (5 October) is late; /api/prices answered here.
    const nowMs = fixtureNowMs('buy');
    await page.clock.setFixedTime(new Date(nowMs));
    await page.route('**/api/prices?*', (route) =>
      route.fulfill({
        json: {
          at: new Date(nowMs - 30_000).toISOString(),
          prices: { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } },
        },
      }),
    );
    await seedPlan(page, fixtureSnapshot());
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    expect(aborted.some((url) => /\/today-[^/]+\.js$/.test(url))).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Buy day was 5 Oct 2026, 15 days ago. Record it or skip the month.')).toBeVisible();
  });
});

test.describe("when the language's rules chunk cannot load (offline before it was ever fetched)", () => {
  test.use({ serviceWorkers: 'block' });

  // ADR-0057: the English rules file answers, so Plan keeps its holding line, conditions and review line in the
  // booted language's messages with the rule's English text, and Settings keeps the plan's country rule.
  test("Plan and Settings keep the plan's rule from the English file", async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
    test.skip(testInfo.project.name !== 'desktop', 'the fallback does not depend on the viewport');
    await bootIn(page, 'pt-PT');
    const aborted: string[] = [];
    // Routed before the seed, which loads Today and with it the rules (docs/BUILD-PROMPT.md).
    await page.route(/\/assets\/messages\/pt-PT\/pt-[^/]+\.js$/, (route) => {
      aborted.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    const nowMs = fixtureNowMs('buy');
    await page.clock.setFixedTime(new Date(nowMs));
    await routeFixturePrices(page, nowMs);
    await seedPlan(page, fixtureSnapshot());

    await page.goto('/plan');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('heading', { level: 1, name: ptPlan.title })).toBeVisible();
    expect(aborted.length).toBeGreaterThan(0);
    await expect(page.getByText(new RegExp(`^${ptPlan.holding.exempt.replace('{date}', '.+')}$`))).toBeVisible();
    await expect(page.getByText(portugal.holdingRuleConditions[0] ?? '')).toBeVisible();
    await expect(page.getByText(new RegExp(`^${ptShell.countryLine.sources.split(' {date}')[0]} `))).toBeVisible();

    await page.goto('/settings');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('tab', { name: ptSettings.tabs.hold }).click();
    await expect(page.getByRole('radio', { name: /^A regra de Portugal$/ })).toBeVisible();
    await expect(page.getByText(ptPlan.holdingRule.countryUnknown)).toHaveCount(0);

    // The profile's translation is a chunk of the same name, so Learn's card shows the English profile.
    await page.goto('/learn/countries/pt');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText(portugal.card.summary60)).toBeVisible();
  });
});

test.describe("when the language's chunks load", () => {
  test.use({ serviceWorkers: 'block' });

  // ADR-0057: Learn's card shows the profile through its pt-PT overlay, the rule conditions included.
  test("Learn's PT card shows the profile's pt-PT translation", async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
    test.skip(testInfo.project.name !== 'desktop', 'the translation does not depend on the viewport');
    await bootIn(page, 'pt-PT');
    await page.goto('/learn/countries/pt');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await expect(page.getByText(inPortuguese(portugal.card.summary60, portugalPt.card?.summary60))).toBeVisible();
    await expect(page.getByText(ptCondition(0))).toBeVisible();
  });
});

// WCAG 2.2 SC 3.1.2 (ADR-0057, the Corrections of 2026-11-16): English content text on a pt-PT screen carries
// lang="en" on its element, and a card whose profile text is English says so in Portuguese under its title.
const ON_TWO = ['desktop', 'iphone'];
const ptRulesText = (page: Page, text: string) => page.getByText(text, { exact: true });

/** A Learn module's front matter fields and its first section heading, read from its `.mdx` file. */
const frontMatter = (path: string) => {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(text)?.[1] ?? '';
  return {
    title: field('title'),
    idea: field('idea'),
    caveat: field('caveat'),
    heading: /^## (.+)$/m.exec(text)?.[1] ?? '',
  };
};
// Risk honestly has no pt-PT translation, so a pt-PT screen opens it in English; Cycles has one.
const riskHonestly = frontMatter('../../../packages/content/learn/risk-honestly.mdx');
const cyclesPt = frontMatter('../../../packages/content/i18n/pt-PT/learn/cycles.mdx');

/** The fixture plan in its buying phase, with the fixture's prices, so Plan and Portfolio's P/L both show. */
async function seedBuying(page: Page) {
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await routeFixturePrices(page, nowMs);
  await seedPlan(page, fixtureSnapshot());
}

test.describe('English content text on a pt-PT screen', () => {
  test.use({ serviceWorkers: 'block' });

  test("Learn's DE card marks its English text and says so; PT's translated text takes no lang", async ({
    page,
  }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip outside the two named projects, not a disabled test
    test.skip(!ON_TWO.includes(testInfo.project.name), 'desktop and iphone carry the language checks');
    await bootIn(page, 'pt-PT');
    await page.goto('/learn/countries/de');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(ptRulesText(page, germany.card.holdingRuleText)).toHaveAttribute('lang', 'en');
    await expect(ptRulesText(page, germany.card.summary60)).toHaveAttribute('lang', 'en');
    await expect(page.getByText(ptLearn.card.inEnglish)).toBeVisible();

    await page.goto('/learn/countries/pt');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    const summary = ptRulesText(page, inPortuguese(portugal.card.summary60, portugalPt.card?.summary60));
    await expect(summary).toBeVisible();
    await expect(summary).not.toHaveAttribute('lang', /./);
    await expect(page.getByText(ptLearn.card.inEnglish)).toHaveCount(0);
  });

  test("Portfolio's P/L Why? sheet marks the English module's body", async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip outside the two named projects, not a disabled test
    test.skip(!ON_TWO.includes(testInfo.project.name), 'desktop and iphone carry the language checks');
    await bootIn(page, 'pt-PT');
    await seedBuying(page);
    await page.goto('/portfolio');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: ptPortfolio.summary.why, exact: true }).click();
    const sheet = page.getByRole('dialog');
    const title = sheet.locator('[data-slot="sheet-title"]');
    await expect(title).toHaveText(riskHonestly.idea);
    await expect(title).toHaveAttribute('lang', 'en');
    await expect(sheet.locator('[data-slot="card"] p[lang="en"]')).toBeVisible();
    // The body's section headings sit inside the one lang="en" element; the sheet's title is a heading of its own.
    await expect(sheet.locator('[lang="en"] :is(h2, h3)').first()).toBeVisible();
    await expect(sheet.getByRole('button', { name: ptLearn.sheet.close })).toBeVisible();
  });

  test("Plan's Why? sheet opens Cycles in pt-PT, with nothing marked lang", async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip outside the two named projects, not a disabled test
    test.skip(!ON_TWO.includes(testInfo.project.name), 'desktop and iphone carry the language checks');
    await bootIn(page, 'pt-PT');
    await seedBuying(page);
    await page.goto('/plan');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: ptPlan.why.window }).click();
    const sheet = page.getByRole('dialog');
    const title = sheet.locator('[data-slot="sheet-title"]');
    await expect(title).toHaveText(cyclesPt.idea);
    await expect(title).not.toHaveAttribute('lang', /./);
    await expect(sheet.getByRole('heading', { level: 2, name: cyclesPt.heading })).toBeAttached();
    await expect(sheet.getByText(cyclesPt.caveat, { exact: true })).not.toHaveAttribute('lang', /./);
    await expect(sheet.locator('[lang]')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: ptLearn.sheet.close })).toBeVisible();
  });

  test("with PT's overlay chunk aborted, PT's English text takes lang=en and the line shows", async ({
    page,
  }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip outside the two named projects, not a disabled test
    test.skip(!ON_TWO.includes(testInfo.project.name), 'desktop and iphone carry the language checks');
    await bootIn(page, 'pt-PT');
    const aborted: string[] = [];
    // Routed before the seed, which loads Today and with it the rules (docs/BUILD-PROMPT.md).
    await page.route(/\/assets\/messages\/pt-PT\/pt-[^/]+\.js$/, (route) => {
      aborted.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    const nowMs = fixtureNowMs('buy');
    await page.clock.setFixedTime(new Date(nowMs));
    await routeFixturePrices(page, nowMs);
    await seedPlan(page, fixtureSnapshot());
    await page.goto('/learn/countries/pt');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    expect(aborted.length).toBeGreaterThan(0);
    await expect(ptRulesText(page, portugal.card.summary60)).toHaveAttribute('lang', 'en');
    await expect(page.getByText(ptLearn.card.inEnglish)).toBeVisible();
  });
});

// A Learn module's translation is a chunk of its own under assets/messages/pt-PT/ (ADR-0057, ADR-0048's Deviations):
// a failed import shows English, marked lang="en", and the mount loads it once more, which only the built app
// compiled by the React Compiler shows (useModuleBody).
const startHere = frontMatter('../../../packages/content/learn/start-here.mdx');
const startHerePt = frontMatter('../../../packages/content/i18n/pt-PT/learn/start-here.mdx');
const START_HERE_PT_CHUNK = /\/assets\/messages\/pt-PT\/start-here-[^/]+\.js$/;

test.describe("a Learn module's pt-PT chunk", () => {
  test.use({ serviceWorkers: 'block' });

  /** Aborts the first `failing` requests for start-here's pt-PT chunk and records the page's errors. */
  async function openStartHere(page: Page, failing: number) {
    await bootIn(page, 'pt-PT');
    const aborted: string[] = [];
    await page.route(START_HERE_PT_CHUNK, (route) => {
      if (aborted.length >= failing) return route.continue();
      aborted.push(route.request().url());
      return route.abort('internetdisconnected');
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // The aborted request's own line is the network's, not the app's.
      if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
    });
    await page.goto('/learn/start-here');
    await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('link', { name: ptLearn.module.back })).toBeVisible();
    return { aborted, errors };
  }

  test('a first import that fails and a retry that loads: the same mount shows the translation', async ({
    page,
  }, testInfo) => {
    // WebKit keeps a failed module import for the document's life and never asks for the chunk again, so there the
    // mount keeps English (case below) until a reload; Chromium asks again.
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on every project but desktop, not a disabled test
    test.skip(testInfo.project.name !== 'desktop', "WebKit never requests a failed module's chunk again");
    const { aborted, errors } = await openStartHere(page, 1);

    const title = page.getByRole('heading', { level: 1, name: startHerePt.title });
    await expect(title).toBeVisible();
    await expect(title).not.toHaveAttribute('lang', /./);
    await expect(page.getByRole('heading', { level: 2, name: startHerePt.heading })).toBeVisible();
    await expect(screenArea(page).locator('[lang]')).toHaveCount(0);
    expect(aborted).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('every import fails: English shows, its title, caveat and body marked lang="en", and nothing else', async ({
    page,
  }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip outside the two named projects, not a disabled test
    test.skip(!ON_TWO.includes(testInfo.project.name), 'desktop and iphone carry the language checks');
    const { aborted, errors } = await openStartHere(page, Number.POSITIVE_INFINITY);

    await expect(page.getByRole('heading', { level: 1, name: startHere.title })).toHaveAttribute('lang', 'en');
    await expect(page.getByText(startHere.caveat, { exact: true })).toHaveAttribute('lang', 'en');
    const body = screenArea(page).locator('[lang="en"]', {
      has: page.getByRole('heading', { level: 2, name: startHere.heading }),
    });
    await expect(body).toHaveCount(1);
    await expect(screenArea(page).locator('[lang]')).toHaveCount(3);
    await expect(page.getByRole('link', { name: ptLearn.module.back })).not.toHaveAttribute('lang', /./);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    expect(aborted.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
