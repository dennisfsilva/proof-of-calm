import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import ptPlan from '../../../packages/app/src/messages/pt-PT/plan.json' with { type: 'json' };
import ptSettings from '../../../packages/app/src/messages/pt-PT/settings.json' with { type: 'json' };
import ptShell from '../../../packages/app/src/messages/pt-PT/shell.json' with { type: 'json' };
import portugalPt from '../../../packages/content/i18n/pt-PT/jurisdictions/pt.json' with { type: 'json' };
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
