import { expect } from '@playwright/test';
import { test } from './support';

// Installability as ADR-0033 checks it in Playwright (Lighthouse has no PWA category any more): the
// manifest is linked and served, its icons load, the pages carry a theme colour per theme, and the
// service worker controls the page after a reload with the shell and the offline page precached, so
// Today answers offline (ADR-0045 §5). M0's worker URL serves the kill switch until launch.

test('the worker and the kill switch are served for the whole origin', async ({ request }) => {
  for (const path of ['/sw.js', '/serwist/sw.js']) {
    const script = await request.get(path);
    expect(script.status(), path).toBe(200);
    expect(script.headers()['service-worker-allowed'], path).toBe('/');
    expect(script.headers()['content-type'], path).toContain('javascript');
  }
  expect(await (await request.get('/serwist/sw.js')).text()).toContain('unregister()');
});

test('the service worker controls Today after a reload, holds the shell and answers Today offline', async ({
  page,
  context,
}) => {
  await page.goto('/today');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/');
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const precached = await page.evaluate(async () => {
    const found: string[] = [];
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      for (const path of ['/app', '/~offline']) {
        if (keys.some((key) => new URL(key.url).pathname === path)) found.push(path);
      }
    }
    return [...new Set(found)].sort();
  });
  expect(precached).toEqual(['/app', '/~offline']);

  await context.setOffline(true);
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
  await context.setOffline(false);
});

test('the offline page says what still works', async ({ page }) => {
  const response = await page.goto('/~offline');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline');
});

test('the pages link the manifest, the icons and a theme colour for each theme', async ({ page }) => {
  await page.goto('/today');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  const themes = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((tags) => tags.map((tag) => [tag.getAttribute('media'), tag.getAttribute('content')]));
  expect(themes).toEqual([
    ['(prefers-color-scheme: light)', '#f7f4ef'],
    ['(prefers-color-scheme: dark)', '#151412'],
  ]);
});

test('the manifest is served and every icon it names loads as a PNG', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toEqual(
    expect.objectContaining({ name: 'Proof of Calm', start_url: '/today', display: 'standalone', scope: '/' }),
  );
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()['content-type'], icon.src).toBe('image/png');
  }
  for (const path of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
