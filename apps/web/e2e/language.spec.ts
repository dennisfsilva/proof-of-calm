import { expect, type Page } from '@playwright/test';
import { test } from './support';

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
