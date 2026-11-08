import { createHash } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { THEME_BEFORE_PAINT } from '@proofofcalm/app/lib/theme';
import { seedPlan } from './seed';
import { cspViolations, recordCspViolations, SECURITY_HEADERS, test } from './support';

// The CSP assertion that exists from the first commit (docs/BUILD-PROMPT.md), as ADR-0045 §4 states it
// for a static host: the policy is hashed, not nonced. The app shell carries exactly two inline scripts
// (the theme before paint, the boot script), the policy names exactly their SHA-256 hashes with
// 'strict-dynamic', the site pages carry no script at all but the offline page, which carries the theme
// script alone (ADR-0045, the deviation of 2026-10-19), and loading any page violates nothing, the
// not-found page that a path that does not exist answers with status 404 included. Opening a
// popup violates nothing either: Base UI's Select would insert an inline <style> that the policy refuses,
// so the ui Select turns Base UI's style elements off (docs/SECURITY.md §4).

const APP_PAGES = ['/today', '/app'];
const SITE_PAGES = ['/', '/terms', '/privacy', '/risk', '/cookies', '/contact'];
const OFFLINE_PAGE = '/~offline';
const NOT_FOUND_PAGE = '/no-such-page';

const sha256 = (text: string) => `sha256-${createHash('sha256').update(text).digest('base64')}`;
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attributes]) => !/\bsrc=/.test(attributes ?? ''))
    .map(([, , body]) => body ?? '');
const scriptSources = (csp: string) => /(?:^|;\s*)script-src ([^;]+)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? [];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(recordCspViolations);
});

test('the app shell names the hashes of its two inline scripts, and nothing else inline', async ({ request }) => {
  const response = await request.get('/today');
  expect(response.status()).toBe(200);
  const csp = response.headers()['content-security-policy'] ?? '';
  const scripts = inlineScripts(await response.text());
  expect(scripts, 'the theme script and the boot script').toHaveLength(2);

  const sources = scriptSources(csp);
  expect(sources).toContain("'self'");
  expect(sources).toContain("'strict-dynamic'");
  const hashes = sources.filter((source) => source.startsWith("'sha256-")).map((source) => source.slice(1, -1));
  expect(hashes.sort()).toEqual(scripts.map(sha256).sort());
  expect(csp).not.toMatch(/nonce-|unsafe-inline|unsafe-eval/);
});

for (const path of [...APP_PAGES, ...SITE_PAGES, OFFLINE_PAGE, NOT_FOUND_PAGE]) {
  test(`${path} is served with the hashed CSP and loads without violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(path === NOT_FOUND_PAGE ? 404 : 200);
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toMatch(/nonce-|unsafe-inline|unsafe-eval/);
    if (SITE_PAGES.includes(path) || path === NOT_FOUND_PAGE) await expect(page.locator('script')).toHaveCount(0);
    if (path === OFFLINE_PAGE) {
      await expect(page.locator('script')).toHaveCount(1);
      expect(await page.locator('script').evaluate((e) => e.textContent)).toBe(THEME_BEFORE_PAINT);
    }
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(cspViolations)).toEqual([]);
  });
}

/** Waits for the popup and its opening animations, then reads the violations the page recorded. */
async function violationsWith(page: Page, popup: Locator): Promise<string[]> {
  await expect(popup).toBeVisible();
  await popup.evaluate((element) => Promise.all(element.getAnimations().map((each) => each.finished)));
  return page.evaluate(cspViolations);
}

async function openSettingsTab(page: Page, tab: 'Plan' | 'Hold & sell' | 'Currency & data') {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: tab }).click();
}

async function deletePlan(page: Page): Promise<Locator> {
  await openSettingsTab(page, 'Currency & data');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  return page.getByRole('dialog', { name: /^Delete this plan and its \d+ entries\?$/ });
}

test.describe('opening a popup violates nothing', () => {
  test('the onboarding Country select, opened by keyboard', async ({ page }) => {
    await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
    await page.goto('/onboarding');
    await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('combobox', { name: 'Country' }).focus();
    await page.keyboard.press('Enter');
    expect(await violationsWith(page, page.getByRole('option', { name: 'Germany', exact: true }))).toEqual([]);
  });

  test('the Buy day select on the Plan tab of Settings', async ({ page }) => {
    await openSettingsTab(page, 'Plan');
    await page.getByRole('combobox', { name: 'Buy day' }).click();
    expect(await violationsWith(page, page.getByRole('option', { name: '6', exact: true }))).toEqual([]);
  });

  test('the Rule select of an own rule on the Hold & sell tab of Settings', async ({ page }) => {
    await openSettingsTab(page, 'Hold & sell');
    await page.getByRole('radio', { name: 'Your own rule' }).click();
    await page.getByRole('combobox', { name: 'Rule' }).click();
    expect(await violationsWith(page, page.getByRole('option', { name: 'A number of years' }))).toEqual([]);
  });

  test('the delete-plan dialog', async ({ page }) => {
    expect(await violationsWith(page, await deletePlan(page))).toEqual([]);
  });

  test('the log entry sheet', async ({ page }) => {
    await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
    await seedPlan(page, fixtureSnapshot());
    await page.goto('/log');
    await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: 'Record a purchase' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Log the monthly buy');
    expect(await violationsWith(page, sheet)).toEqual([]);
  });

  test('the undo toast', async ({ page }) => {
    const dialog = await deletePlan(page);
    await dialog.getByRole('button', { name: 'Delete everything' }).click();
    await expect(dialog).toBeHidden();
    const toast = page.locator('[data-slot="toast"]:not([hidden])');
    await expect(toast).toContainText('Plan deleted.');
    expect(await violationsWith(page, toast.getByRole('button', { name: 'Undo' }))).toEqual([]);
  });
});

test('the app shell and its assets carry the static security headers', async ({ request }) => {
  const shell = await request.get('/today');
  expect(shell.headers()).toMatchObject(SECURITY_HEADERS);
  expect(shell.headers()['x-powered-by']).toBeUndefined();

  const entry = /\bdata-entry="(\/assets\/[^"]+)"/.exec(await shell.text())?.[1];
  expect(entry, 'the boot script names the entry module').toBeTruthy();
  const asset = await request.get(entry ?? '');
  expect(asset.status()).toBe(200);
  expect(asset.headers()).toMatchObject(SECURITY_HEADERS);
  expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(asset.headers()['content-security-policy']).toBeUndefined();
});

test('the holding page asks not to be indexed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('proof of calm');
});
