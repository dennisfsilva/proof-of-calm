// Shared by the specs: the headers every response carries (docs/SECURITY.md §4, written into vercel.json
// by lib/vercel-config.ts), the deployment-protection bypass for a run against a deployment
// (docs/OWNER-SETUP.md §3), the zoom-125 project's text zoom (docs/ENGINEERING.md §3) and the fixture
// answers of /api/prices and /api/history/:coin.
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

/**
 * The history fixture's shape, each over 365 points whose last is the live price dated `nowMs`'s UTC day (the
 * red-day model drops it, docs/DOMAIN.md §3.11): 'rise' gains about 0.1 % a day; 'week-fall' is flat, then falls
 * 11 % in the last week, Red from two closes before `nowMs`'s date; 'high-fall' is flat, then falls 0.9 % of the
 * high a day for 36 days, 30 % below its 90-day high from two closes before (packages/app's red-day test shapes).
 */
type HistoryShape = 'rise' | 'week-fall' | 'high-fall';

const FALLS: Readonly<Record<Exclude<HistoryShape, 'rise'>, readonly number[]>> = {
  'week-fall': [97, 95, 93, 91, 89, 88, 87],
  'high-fall': Array.from({ length: 36 }, (_, n) => (1000 - 9 * (n + 1)) / 10),
};

/** The closes relative to the live price, oldest first. */
function shapeFactors(shape: HistoryShape): number[] {
  if (shape === 'rise') return Array.from({ length: 365 }, (_, index) => 0.999 ** (364 - index));
  const fall = FALLS[shape];
  const values = [...Array.from({ length: 365 - fall.length }, () => 100), ...fall];
  return values.map((value) => value / (fall.at(-1) ?? 100));
}

/**
 * Answers /api/prices and /api/history/:coin from fixtures, never CoinGecko: the fixture prices fetched
 * 30 s before `nowMs`, and a year of daily closes of `shape` ending on `nowMs`'s date with the fixture price.
 * A request the service worker makes itself passes the page's routes by, so the caller blocks the worker.
 */
export async function routeFixturePrices(page: Page, nowMs: number, shape: HistoryShape = 'rise'): Promise<void> {
  const factors = shapeFactors(shape);
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({
      json: {
        at: new Date(nowMs - 30_000).toISOString(),
        prices: { BTC: { EUR: '60000.12', USD: '70000' }, ETH: { EUR: '2500.5', USD: '2900' } },
      },
    }),
  );
  await page.route('**/api/history/*', (route) => {
    const url = new URL(route.request().url());
    const coin = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const currency = url.searchParams.get('currency') ?? 'EUR';
    const last = coin === 'ETH' ? 2500.5 : 60000.12;
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
