import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { Entry, Instant } from '@proofofcalm/core';
import { coinWords, readableStrings } from '../lib/pwa/coin-words';
import { seedPlan } from './seed';
import { test } from './support';

// The manifest's screenshots (apps/web/lib/pwa/manifest.ts; docs/DESIGN.md §9): the set of ADR-0009's Reading of
// 2026-11-23, which names no coin of the catalogue. On every run each screen of the set is opened as it would be
// captured and its text is searched for the catalogue's names and tickers: the test passes only at zero. With
// MANIFEST_CAPTURE=1 it also writes each viewport, at the project's device scale factor, into public/screenshots/:
// the shipped images come from snapshots.yml in the pinned Playwright container, never from a laptop.

const CAPTURE = process.env.MANIFEST_CAPTURE === '1';
const FOLDER = fileURLToPath(new URL('../public/screenshots/', import.meta.url));

/** The catalogue's names and tickers on the screen, each string the page reads matched on its own (lib/pwa). */
const coinsOn = async (page: Page) => coinWords(await page.locator('body').evaluate(readableStrings));

/**
 * The public page with Portugal's result for a purchase on 5 October 2026 (the island reads the fragment), scrolled
 * so that the purchase date and the result are in frame below the chosen country.
 */
async function holdingDate(page: Page) {
  await page.goto('/en/holding-date#country=pt&bought=2026-10-05');
  const result = page.locator('[aria-live="polite"] [data-country="pt"]');
  await expect(result).toBeVisible();
  await page.getByRole('radio', { name: 'Portugal' }).evaluate((radio) => radio.scrollIntoView({ block: 'start' }));
  await expect(result).toBeInViewport();
}

const at = (date: string) => `${date}T18:00:00+01:00` as Instant;

/**
 * Today on 20 October 2026 with October's buy recorded and no price answer: the fixture plan without its sell
 * window, its extra buy and its sale (ADR-0009's Reading: no sell window, no sale row), and no template's dates.
 */
async function today(page: Page) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await page.route('**/api/prices?*', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/history/**', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  const { plan, entries } = fixtureSnapshot();
  if (plan === null) throw new Error('the fixture has a plan');
  const october = entries
    .filter((entry) => entry.slot === '2026-09')
    .map(
      (entry, index): Entry => ({
        ...entry,
        id: `00000000-0000-4000-8000-0000000030${index}0` as Entry['id'],
        date: '2026-10-05' as Entry['date'],
        slot: '2026-10' as Entry['slot'],
        createdAt: at('2026-10-05'),
        updatedAt: at('2026-10-05'),
      }),
    );
  const kept = entries.filter((entry) => entry.kind === 'lump' || entry.kind === 'dca');
  await seedPlan(page, { ...fixtureSnapshot(), plan: { ...plan, sellWindow: null }, entries: [...kept, ...october] });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const goto = (path: string) => async (page: Page) => {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

/** In the manifest's order; android-small is the narrow form factor, desktop the wide one. */
const SET = [
  { name: 'holding-date-narrow', project: 'android-small', open: holdingDate },
  { name: 'country-pt-narrow', project: 'android-small', open: goto('/en/countries/pt') },
  { name: 'today-narrow', project: 'android-small', open: today },
  { name: 'learn-narrow', project: 'android-small', open: goto('/en/learn') },
  { name: 'holding-date-wide', project: 'desktop', open: holdingDate },
] as const;

for (const shot of SET) {
  test(`the ${shot.name} screenshot names no coin of the catalogue`, async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the projects that are not this form factor
    test.skip(testInfo.project.name !== shot.project, `the ${shot.name} image is taken on ${shot.project}`);
    await shot.open(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await coinsOn(page)).toEqual([]);
    if (!CAPTURE) return;
    mkdirSync(FOLDER, { recursive: true });
    await page.screenshot({ path: `${FOLDER}${shot.name}.png`, animations: 'disabled', caret: 'hide' });
  });
}
