import { expect } from '@playwright/test';
import { test } from './support';

// The site pages before launch (docs/LEGAL.md §4 and §5): every one carries the one-line disclaimer
// with a link to the Risk page, and security.txt is served as RFC 9116 asks.

const legalPages = ['/terms', '/privacy', '/risk', '/cookies', '/contact'];

for (const path of ['/', ...legalPages]) {
  test(`${path} carries the disclaimer line and the legal links`, async ({ page }) => {
    await page.goto(path);
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Data and tools, not advice. Crypto-assets can lose all their value.');
    await expect(footer.getByRole('link', { name: 'Read the risk disclosure' })).toHaveAttribute('href', '/risk');
    const legal = page.getByRole('navigation', { name: 'Legal information' });
    for (const link of legalPages) await expect(legal.locator(`a[href="${link}"]`)).toHaveCount(1);
  });
}

test('the Risk page states the warning in full', async ({ page }) => {
  await page.goto('/risk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Risk disclosure');
  await expect(page.getByRole('main')).toContainText('you could lose all the money you put in');
});

test('the Contact page holds the disclosure policy that security.txt names', async ({ page }) => {
  await page.goto('/contact');
  const policy = page.locator('#security');
  await expect(policy).toContainText('within 72 hours');
  await expect(policy.getByRole('link', { name: 'security.txt' })).toHaveAttribute('href', '/.well-known/security.txt');
});

test('security.txt is plain text with a contact and an expiry', async ({ request }) => {
  const response = await request.get('/.well-known/security.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
  const body = await response.text();
  expect(body).toMatch(/^Contact: mailto:security@proofofcalm\.com$/m);
  expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
  expect(body).toMatch(/^Policy: https:\/\/proofofcalm\.com\/contact#security$/m);
});
