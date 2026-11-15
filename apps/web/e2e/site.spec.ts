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

// The public pages (ADR-0045, Deviations of 2026-11-15): the Learn index and modules, the country list, one
// page per listed country and the holding-date page; static, no script, kept out of search by the header and
// the meta until PUBLIC_INDEXABLE turns true, inside the site layout with the same line.
const COUNTRIES = ['de', 'es', 'fr', 'gb', 'ie', 'it', 'nl', 'pt', 'us'];
const countryPages = COUNTRIES.map((code) => `/en/countries/${code}`);
const publicPages = [
  '/en/learn',
  ...['start-here', 'noise', 'cycles', 'when-the-market-drops', 'risk-honestly', 'taxes-where-you-live'].map(
    (slug) => `/en/learn/${slug}`,
  ),
  '/en/countries',
  ...countryPages,
  '/en/holding-date',
];

for (const path of publicPages) {
  test(`${path} is a script-free page out of search with the disclaimer line`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('main#main h1')).toHaveCount(1);
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Data and tools, not advice. Crypto-assets can lose all their value.');
    await expect(footer.getByRole('link', { name: 'Read the risk disclosure' })).toHaveAttribute('href', '/risk');
  });
}

// Every Sources link (docs/JURISDICTIONS.md §1) leaves the site for an https source in a new tab, without the
// opener; a page with none is a country under review, and Portugal's page has some.
for (const path of [...countryPages, '/en/holding-date']) {
  test(`${path} links its sources out over https`, async ({ page }) => {
    await page.goto(path);
    const sources = page.getByRole('link', { name: /^Sources/ });
    if (path.endsWith('/pt') || path === '/en/holding-date') expect(await sources.count()).toBeGreaterThan(0);
    for (const link of await sources.all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\/[^/]+\.[^/]+/);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
    }
  });
}

test('the country list links every listed country', async ({ page }) => {
  await page.goto('/en/countries');
  const hrefs = await page
    .locator('main a[href^="/en/countries/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs.sort()).toEqual(countryPages);
});

test('Taxes ends with every country row, each a working link', async ({ page }) => {
  await page.goto('/en/learn/taxes-where-you-live');
  const rows = page.locator('main section').last();
  await expect(rows.getByRole('heading', { level: 2 })).toHaveText('Countries');
  for (const path of countryPages) await expect(rows.locator(`a[href="${path}"]`)).toHaveCount(1);
  await rows.locator('a[href="/en/countries/pt"]').click();
  await expect(page).toHaveURL(/\/en\/countries\/pt$/);
  await expect(page.locator('main#main h1')).toContainText('Portugal');
});

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
