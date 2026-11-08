import { expect } from '@playwright/test';
import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import { bypassHeaders, cspViolations, recordCspViolations, SECURITY_HEADERS, test } from './support';

// ADR-0029's GB scenario, with Vercel's geolocation header injected: vercel.json's route answers 451
// with the explanatory page for everything but the legal pages, security.txt and the static files
// (ADR-0045 §4), the headers still set, nothing cached.

const BLOCKED = [...APP_ROUTES.map((route) => `/${route}`), '/app', '/manifest.webmanifest', '/TERMS'];
const LEGAL = ['/terms', '/privacy', '/risk', '/cookies', '/contact', '/.well-known/security.txt'];

test.describe('a visitor from the United Kingdom', () => {
  test.use({ extraHTTPHeaders: { ...bypassHeaders(), 'x-vercel-ip-country': 'GB' } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(recordCspViolations);
  });

  test('/ answers 451 with the explanatory page, the headers and no app shell', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(451);
    expect(await page.evaluate(cspViolations), 'the hashed style applies').toEqual([]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not available in the United Kingdom');
    await expect(page.getByRole('main')).toHaveText(
      /Not available in the United Kingdom\s+Proof of Calm is not available in the United Kingdom yet\./,
    );
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('form, input, button')).toHaveCount(0);

    const headers = response?.headers() ?? {};
    expect(headers).toMatchObject(SECURITY_HEADERS);
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['cache-control']).toBe('no-store');
  });

  for (const path of BLOCKED) {
    test(`${path} answers 451`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(451);
      expect(response.headers()).toMatchObject(SECURITY_HEADERS);
      expect(response.headers()['cache-control']).toBe('no-store');
    });
  }

  test('the legal pages and security.txt stay reachable', async ({ request }) => {
    for (const path of LEGAL) expect((await request.get(path)).status(), path).toBe(200);
  });

  test('the home link of a legal page leads to the explanatory page', async ({ page }) => {
    await page.goto('/risk');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Risk disclosure');
    const home = page.waitForResponse((response) => new URL(response.url()).pathname === '/');
    await page.getByRole('link', { name: 'Home' }).click();
    expect((await home).status()).toBe(451);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not available in the United Kingdom');
  });
});

test('a visitor from elsewhere gets the page', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-vercel-ip-country': 'PT' });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('proof of calm');
});
