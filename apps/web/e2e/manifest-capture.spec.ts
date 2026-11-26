import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { Entry, Instant } from '@proofofcalm/core';
import { coinWords, readableStrings } from '../lib/pwa/coin-words';
import { seedPlan } from './seed';
import { test } from './support';

// The manifest's screenshots (apps/web/lib/pwa/manifest.ts; docs/DESIGN.md §9): the set of ADR-0009's Reading of
// 2026-11-23, which names no coin of the catalogue. On every run each screen of the set is opened in its frame as it
// would be captured: its text is searched for the catalogue's names and tickers (the test passes only at zero), no
// line of text or control crosses the frame's top or bottom edge, and what the frame must show is wholly inside it.
// With MANIFEST_CAPTURE=1 it also writes each frame, at the project's device scale factor, into public/screenshots/:
// the shipped images come from snapshots.yml in the pinned Playwright container, never from a laptop.

const CAPTURE = process.env.MANIFEST_CAPTURE === '1';
const FOLDER = fileURLToPath(new URL('../public/screenshots/', import.meta.url));

// Chromium draws a native date field in the order of its own interface language, which the context's locale does not
// reach: the browser is started in en-GB (the flag, and the variables Chromium on Linux reads), so the field reads
// 05/10/2026 like the result's "5 Oct 2026" in the container. On Windows an English interface language takes the
// system's date format instead, so a laptop's capture can still read 10/05/2026. launchOptions is a worker option, so
// this file gets its own workers.
test.use({
  locale: 'en-GB',
  launchOptions: { args: ['--lang=en-GB'], env: { ...process.env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB:en' } },
});

/** The catalogue's names and tickers on the screen, each string the page reads matched on its own (lib/pwa). */
const coinsOn = async (page: Page) => coinWords(await page.locator('body').evaluate(readableStrings));

/** Each line of text, field, button or image the frame's top edge (0) or bottom edge (`height`) cuts through. */
function cutLines(height: number): string[] {
  const crosses = (rect: DOMRect) =>
    rect.width > 1 && rect.height > 1 && rect.top < height && rect.bottom > 0 && (rect.top < 0 || rect.bottom > height);
  const cut: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (!text) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    if ([...range.getClientRects()].some(crosses)) cut.push(text);
  }
  for (const element of document.querySelectorAll('input, button, select, textarea, svg, img')) {
    if (crosses(element.getBoundingClientRect())) cut.push(`<${element.localName}>`);
  }
  return cut;
}

/** Scrolls the page so that `anchor`'s top sits `gap` CSS pixels below the frame's top edge. */
const scrollTo = (anchor: Locator, gap: number) =>
  anchor.evaluate((element, gap) => {
    window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - gap);
  }, gap);

/**
 * The public page with Portugal's result for a purchase on 5 October 2026 (the island reads the fragment), scrolled
 * so that the purchase date and the result are in frame below the chosen country.
 */
async function holdingDate(page: Page) {
  await page.goto('/en/holding-date#country=pt&bought=2026-10-05');
  const result = page.locator('[aria-live="polite"] [data-country="pt"]');
  await expect(result).toBeVisible();
  await scrollTo(page.getByRole('radio', { name: 'Portugal' }), 0);
  await expect(result).toBeInViewport();
}

/**
 * Portugal's country page from its second reporting rule (Anexo G Quadro 18B) to the date line: whole rules, the
 * section's Sources link and "Reviewed on … · general information, not advice" in one frame (docs/LEGAL.md §4 and
 * §6 Q13). The Reporting heading to the date line is taller than 2.3 widths, so the frame starts in the gap between
 * two rows of the list, and no row is cut off from its condition.
 */
async function countryPt(page: Page) {
  await page.goto('/en/countries/pt');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await scrollTo(quadro18B(page), 2);
}

/** The row "Anexo G Quadro 18B: disposals with a counterparty outside the EU or the EEA." (spaces are no-break). */
const quadro18B = (page: Page) => page.getByRole('listitem').filter({ hasText: /^Anexo\sG\sQuadro\s18B:/ });

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

async function learn(page: Page) {
  await page.goto('/en/learn');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const portugalResult = (page: Page) => [
  page.getByLabel('Purchase date'),
  page.locator('[aria-live="polite"] [data-country="pt"]'),
];

/**
 * In the manifest's order; android-small (360 px wide at 3) is the narrow form factor, desktop (1280 px at 1) the
 * wide one. `height` is the frame's height in CSS pixels, chosen so that both edges fall in a gap between blocks and
 * kept within Chrome's aspect-ratio limit of 2.3 : 1; manifest.ts names the resulting sizes.
 */
const SET = [
  { name: 'holding-date-narrow', project: 'android-small', height: 780, open: holdingDate, shows: portugalResult },
  {
    name: 'country-pt-narrow',
    project: 'android-small',
    height: 823,
    open: countryPt,
    shows: (page: Page) => [
      quadro18B(page),
      page.getByRole('link', { name: 'Sources for reporting' }),
      page.getByText(/^Reviewed on .+ · general information, not advice$/),
    ],
  },
  { name: 'today-narrow', project: 'android-small', height: 780, open: today, shows: () => [] },
  {
    name: 'learn-narrow',
    project: 'android-small',
    height: 816,
    open: learn,
    shows: (page: Page) => [page.getByRole('link', { name: 'Countries' })],
  },
  {
    name: 'holding-date-wide',
    project: 'desktop',
    height: 720,
    open: holdingDate,
    shows: (page: Page) => [...portugalResult(page), page.getByText(/^Proof of Calm's Log shows the day/)],
  },
] as const;

for (const shot of SET) {
  test(`the ${shot.name} screenshot names no coin of the catalogue and cuts no line`, async ({ page }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the projects that are not this form factor
    test.skip(testInfo.project.name !== shot.project, `the ${shot.name} image is taken on ${shot.project}`);
    const width = page.viewportSize()?.width ?? 0;
    await page.setViewportSize({ width, height: shot.height });
    await shot.open(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await coinsOn(page)).toEqual([]);
    for (const shown of shot.shows(page)) await expect(shown).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(cutLines, shot.height)).toEqual([]);
    if (!CAPTURE) return;
    mkdirSync(FOLDER, { recursive: true });
    await page.screenshot({ path: `${FOLDER}${shot.name}.png`, animations: 'disabled', caret: 'hide' });
  });
}
