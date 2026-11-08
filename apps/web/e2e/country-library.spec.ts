import { expect, type Page } from '@playwright/test';
import germany from '../../../packages/content/jurisdictions/de.json' with { type: 'json' };
import portugal from '../../../packages/content/jurisdictions/pt.json' with { type: 'json' };
import { test } from './support';

// The country library on the viewport matrix (docs/EDUCATION.md, docs/JURISDICTIONS.md §1 and §2): Learn's
// countries row opens the list, a row opens the country's card, and an unknown code lands on the list. Every
// profile text is read from the profile files, never written here, so a reworded profile keeps the spec.

test.use({ serviceWorkers: 'block' });

const RULES = ['rates', 'holdingRule', 'lotRule', 'losses', 'reporting'] as const;

/** The screen's own h1, and the screen area no longer busy (the profiles load behind the route table's fallback). */
async function ready(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator('main#main[aria-busy="true"]')).toHaveCount(0);
}

const sourceUrl = (key: string) => portugal.sources.find((source) => source.key === key)?.url;

test('the countries row on Learn opens the list, and a row opens the country', async ({ page }) => {
  await page.goto('/learn');
  await ready(page, 'Learn');
  await page.getByRole('link', { name: /^Countries/ }).click();
  await ready(page, 'Countries');
  await expect(page).toHaveURL(/\/learn\/countries$/);
  await page.getByRole('link', { name: portugal.name, exact: true }).click();
  await ready(page, portugal.name);
  await expect(page).toHaveURL(/\/learn\/countries\/pt$/);
});

test("Portugal's Sources links and listed sources are the profile's URLs, each opening outside the app", async ({
  page,
}) => {
  await page.goto('/learn/countries/pt');
  await ready(page, portugal.name);
  const card = page.getByRole('article');
  const hrefs = (links: ReturnType<Page['locator']>) =>
    links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));

  const rules = card.getByRole('link', { name: /^Sources for / });
  await expect(rules).toHaveCount(RULES.length);
  expect(await hrefs(rules)).toEqual(RULES.map((rule) => sourceUrl(portugal.ruleSources[rule])));

  // The list at the card's foot (docs/JURISDICTIONS.md §2, docs/LEGAL.md §4): every source of the file, in its
  // order.
  await expect(card.getByRole('heading', { level: 2, name: 'Sources for this card', exact: true })).toBeVisible();
  expect(portugal.sources.length).toBeGreaterThan(0);
  const listed = card.locator('li > a');
  await expect(listed).toHaveCount(portugal.sources.length);
  expect(await hrefs(listed)).toEqual(portugal.sources.map((source) => source.url));

  for (const link of await card.locator('a').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

test('a deep link to a country holds across a reload', async ({ page }) => {
  await page.goto('/learn/countries/pt');
  await ready(page, portugal.name);
  await page.reload();
  await ready(page, portugal.name);
  await expect(page).toHaveURL(/\/learn\/countries\/pt$/);
});

test('the generic profile is not a page of the library: /learn/countries/xx lands on the list', async ({ page }) => {
  await page.goto('/learn/countries/xx');
  await ready(page, 'Countries');
  await expect(page).toHaveURL(/\/learn\/countries$/);
});

test("Germany's card under review shows its title and the under-review line, no rule and no Sources", async ({
  page,
}) => {
  // Under review from the day after twelve months past nextReviewDue (docs/JURISDICTIONS.md §1): with 2027-01-01,
  // 2028-01-02.
  const [year, month, day] = germany.status.nextReviewDue.split('-').map(Number) as [number, number, number];
  await page.clock.setFixedTime(new Date(Date.UTC(year + 1, month - 1, day + 1, 12)));
  await page.goto('/learn/countries/de');
  await ready(page, germany.name);
  const card = page.getByRole('article');
  await expect(card.getByText(/^Not reviewed since .+ · general information, not advice$/)).toBeVisible();
  await expect(card.getByRole('link')).toHaveCount(0);
  await expect(card.getByRole('heading')).toHaveCount(1);
  await expect(page.getByText(germany.card.summary60)).toHaveCount(0);
  for (const line of germany.card.reporting) await expect(page.getByText(line)).toHaveCount(0);
});
