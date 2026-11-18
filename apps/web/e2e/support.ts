// Shared by the specs: the headers every response carries (docs/SECURITY.md §4, written into vercel.json
// by lib/vercel-config.ts), the deployment-protection bypass for a run against a deployment
// (docs/OWNER-SETUP.md §3), the zoom-125 project's text zoom (docs/ENGINEERING.md §3) and the fixture
// answers of /api/prices and /api/history/:coin (the latter alone for a spec with its own prices).
import { test as base, type Page, type TestInfo } from '@playwright/test';

/**
 * 125 % text zoom on the zoom-125 project, nothing elsewhere: a 20 px root, through the CSSOM so the CSP allows it.
 * `test`'s page applies it; it stays exported for a page a spec opens itself.
 * @public
 */
export async function applyTextZoom(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name !== 'zoom-125') return;
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '20px';
    });
  });
}

/** Every spec's `test`: its `page` carries the zoom-125 project's 125 % text, so every flow runs zoomed there. */
export const test = base.extend({
  page: async ({ page }, provide, testInfo) => {
    await applyTextZoom(page, testInfo);
    await provide(page);
  },
});

/** The country step's words, English unless a spec boots in another language. */
type CountryWords = { readonly label?: string; readonly country?: string; readonly confirm?: string };

/**
 * Chooses a country on the onboarding country step (also Settings' prototype import) and continues
 * (docs/JURISDICTIONS.md §3). The default context, en-GB in Europe/Lisbon, names Portugal with low confidence:
 * named and first in the list, chosen there before Continue appears. `keyboard` opens the list, moves to the
 * country, selects it and presses Continue by keys alone, with bounded presses.
 */
export async function chooseCountry(page: Page, words: CountryWords = {}, { keyboard = false } = {}): Promise<void> {
  const { label = 'Country', country = 'Portugal', confirm = `Continue with ${country}` } = words;
  const select = page.getByRole('combobox', { name: label });
  const option = page.getByRole('option', { name: country, exact: true });
  const button = page.getByRole('button', { name: confirm });
  if (!keyboard) {
    await select.click();
    await option.click();
    await button.click();
    return;
  }
  await select.focus();
  await page.keyboard.press('Enter');
  await option.waitFor();
  const highlighted = () => option.evaluate((element) => element.hasAttribute('data-highlighted'));
  for (let step = 0; step < 15 && !(await highlighted()); step += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await option.waitFor({ state: 'hidden' });
  const focused = () => button.evaluate((element) => element === document.activeElement);
  for (let step = 0; step < 10 && !(await focused()); step += 1) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
}

/**
 * The history fixture's shape, each over 365 points whose last is the live price dated `nowMs`'s UTC day (the
 * red-day model drops it, docs/DOMAIN.md §3.11): 'rise' gains about 0.1 % a day; 'week-fall' and 'high-fall' are
 * packages/core's WEEKLY_FALL and SLOW_FALL (src/market/red-day.test.ts) after a flat year at 100, Red on the last
 * two complete closes, from two days before `nowMs`'s date. The crossing close sits a margin past the threshold
 * (89, not 90: 11 % in a week; 69.5, not 70: 30.5 % below the 90-day high) and the close before it one short as in
 * core (8 %, 29 %): the closes are rounded to cents of the fixture prices and the core truncates a percent toward
 * zero, so a close exactly on the threshold could read 9.9999 % and start no episode.
 */
type HistoryShape = 'rise' | 'week-fall' | 'high-fall';

const FALLS: Readonly<Record<Exclude<HistoryShape, 'rise'>, readonly number[]>> = {
  'week-fall': [98, 96, 94, 92, 89, 89, 89],
  'high-fall': [...Array.from({ length: 29 }, (_, n) => 99 - n), 69.5, 69.5, 69.5],
};

/** The closes relative to the live price, oldest first. */
function shapeFactors(shape: HistoryShape): number[] {
  if (shape === 'rise') return Array.from({ length: 365 }, (_, index) => 0.999 ** (364 - index));
  const fall = FALLS[shape];
  const values = [...Array.from({ length: 365 - fall.length }, () => 100), ...fall];
  return values.map((value) => value / (fall.at(-1) ?? 100));
}

/** The fixture's EUR prices, the last close of each coin's history; a coin not listed closes at BTC's. */
const FIXTURE_EUR = { BTC: '60000.12', ETH: '2500.5' } as const;

/**
 * Answers /api/prices and /api/history/:coin from fixtures, never CoinGecko: the fixture prices fetched
 * 30 s before `nowMs`, and a year of daily closes of `shape` ending on `nowMs`'s date with the fixture price.
 * A request the service worker makes itself passes the page's routes by, so the caller blocks the worker.
 */
export async function routeFixturePrices(page: Page, nowMs: number, shape: HistoryShape = 'rise'): Promise<void> {
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: FIXTURE_EUR.BTC, USD: '70000' }, ETH: { EUR: FIXTURE_EUR.ETH, USD: '2900' } },
      },
    }),
  );
  await routeFixtureHistory(page, nowMs, shape);
}

/**
 * Answers /api/history/:coin from fixtures, never CoinGecko: a year of daily closes of `shape` ending on
 * `nowMs`'s date with the coin's price in `prices` (the spec's own /api/prices answer, so no figure moves).
 */
export async function routeFixtureHistory(
  page: Page,
  nowMs: number,
  shape: HistoryShape = 'rise',
  prices: Readonly<Record<string, string>> = FIXTURE_EUR,
): Promise<void> {
  const factors = shapeFactors(shape);
  await page.route('**/api/history/*', (route) => {
    const url = new URL(route.request().url());
    const coin = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const currency = url.searchParams.get('currency') ?? 'EUR';
    const last = Number(prices[coin] ?? FIXTURE_EUR.BTC);
    const closes = factors.map((factor, index) => {
      const back = 364 - index;
      const close = Math.round(last * factor * 100) / 100;
      return [new Date(nowMs - back * 86_400_000).toISOString().slice(0, 10), String(close)];
    });
    return route.fulfill({ json: { coin, currency, closes, fetchedAt: new Date(nowMs - 60_000).toISOString() } });
  });
}

/** The static security headers of every response, the app shell and the assets included. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
};

/**
 * Vercel's protection-bypass header when the run targets a deployment, with the one that keeps
 * Vercel's toolbar out of the page (its script would violate the CSP; the same two headers
 * lighthouse-vercel.yml sends); nothing locally.
 */
export function bypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret && process.env.BASE_URL ? { 'x-vercel-protection-bypass': secret, 'x-vercel-skip-toolbar': '1' } : {};
}

/** The page's record of CSP violations, installed by `page.addInitScript(recordCspViolations)`. */
export function recordCspViolations(): void {
  const violations: string[] = [];
  Object.defineProperty(window, '__cspViolations', { value: violations });
  document.addEventListener('securitypolicyviolation', (event) => {
    violations.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
}

/** Reads the record back in the page. */
export function cspViolations(): string[] {
  return (window as unknown as { __cspViolations: string[] }).__cspViolations;
}
