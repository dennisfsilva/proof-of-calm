import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { test } from './support';

// Pause and resume on the viewport matrix (docs/DOMAIN.md §3.5, §6 "Pause", "Resume"; CONTENT-STYLE §3
// "Pause", "Today, the month handled"): the seeded fixture plan on its October buy day, 5 October 2026,
// with October due. Plan's "Pause from today" pauses from today, so October is paused: Today shows
// "Paused since 5 Oct 2026" and Resume instead of the one tap, and the state survives a reload. Resume on
// Today removes the pause, which began today, and October's buy is back; Resume on Plan does the same
// there. The paused Plan and Today fit the viewport, keep 44 px targets and pass axe, as matrix.spec.ts
// checks every page. /api/prices is answered by the page's route, so nothing reaches CoinGecko. Light and
// dark, at 125 % text on zoom-125 (support.ts).

test.use({ serviceWorkers: 'block' });

const BUY_DAY_MS = Date.parse('2026-10-05T10:00:00Z');
const TARGET = 44;
const PRICES = { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } };

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
const section = (page: Page) => page.getByRole('region', { name: 'Pause the plan' });

async function buyDay(page: Page) {
  await page.clock.setFixedTime(new Date(BUY_DAY_MS));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(BUY_DAY_MS - 30_000).toISOString(), prices: PRICES } }),
  );
  await seedPlan(page, fixtureSnapshot());
}

async function open(page: Page, path: '/plan' | '/today') {
  await page.goto(path);
  await ready(page);
}

/**
 * Pauses on Plan from the keyboard and waits for the status line: the focus stays on the button, now Resume.
 * The press moves no focus, and a click in Safari does not focus a button, so the iphone project presses keys.
 */
async function pauseOnPlan(page: Page) {
  await open(page, '/plan');
  await section(page).getByRole('button', { name: 'Pause from today' }).press('Enter');
  await expect(section(page).getByRole('status')).toHaveText(/^Paused since 5\sOct\s2026$/u);
  await expect(section(page).getByRole('button', { name: 'Resume' })).toBeFocused();
}

/** The checks matrix.spec.ts runs on every page: no horizontal scroll, 44 px targets, no axe violation. */
async function fitsAndPasses(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
  const small = await page.evaluate((size) => {
    const selector = 'a[href], button, input, select, textarea, summary, [role="button"], [tabindex="0"]';
    const mirror = (element: HTMLElement) => element.getAttribute('aria-hidden') === 'true' && element.tabIndex < 0;
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => !element.closest('p, li, td') && !mirror(element))
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { element: element.outerHTML.slice(0, 80), width: box.width, height: box.height };
      })
      .filter((box) => box.width > 0 && box.height > 0 && (box.width < size || box.height < size));
  }, TARGET);
  expect(small, 'touch targets of at least 44 × 44 px').toEqual([]);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('Pause on Plan: Today shows the pause and Resume, also after a reload, and Resume brings the buy back', async ({
      page,
    }) => {
      await buyDay(page);
      await open(page, '/today');
      await expect(page.getByRole('button', { name: 'Bought as planned' })).toBeVisible();

      await pauseOnPlan(page);
      await fitsAndPasses(page);
      await page.reload();
      await ready(page);
      await expect(section(page).getByRole('status')).toHaveText(/^Paused since 5\sOct\s2026$/u);

      await open(page, '/today');
      await expect(page.getByRole('heading', { level: 2, name: /^Paused since 5\sOct\s2026$/u })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bought as planned' })).toHaveCount(0);
      await fitsAndPasses(page);
      await page.reload();
      await ready(page);
      await expect(page.getByRole('heading', { level: 2, name: /^Paused since 5\sOct\s2026$/u })).toBeVisible();

      await page.getByRole('button', { name: 'Resume' }).click();
      const due = page.getByRole('heading', { level: 2, name: 'Today is the October 2026 buy day' });
      await expect(due).toBeFocused();
      await expect(page.getByRole('button', { name: 'Bought as planned' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
    });

    test('Resume on Plan ends the pause there, and the focus returns to Pause', async ({ page }) => {
      await buyDay(page);
      await pauseOnPlan(page);
      await section(page).getByRole('button', { name: 'Resume' }).press('Enter');
      await expect(section(page).getByRole('button', { name: 'Pause from today' })).toBeFocused();
      await expect(section(page).getByRole('status')).toHaveText('');

      await open(page, '/today');
      await expect(page.getByRole('button', { name: 'Bought as planned' })).toBeVisible();
    });
  });
}
