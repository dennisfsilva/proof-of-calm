import { expect, test } from '@playwright/test';

// The export renders from plain files (ADR-0045 §10): Today at its hash route, Today after opening the
// bare document (the route table's redirect), and no deep path is served, because nothing falls back.

test('Today renders at /#/today', async ({ page }) => {
  await page.goto('/#/today');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
});

test('opening / reaches Today through the hash', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
  await expect(page).toHaveURL(/#\/today$/);
});

test('a deep path is a 404: the file server has no SPA fallback', async ({ request }) => {
  expect((await request.get('/today')).status()).toBe(404);
});
