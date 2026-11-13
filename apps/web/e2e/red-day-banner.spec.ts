import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { createFormatters } from '@proofofcalm/app/lib/format';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The red-day banner on the viewport matrix (docs/DOMAIN.md §3.11; docs/DESIGN.md §8; docs/CONTENT-STYLE.md §3):
// the fixture plan (BTC and ETH) on 20 October 2026, over a year of closes that ends in core's WEEKLY_FALL or
// SLOW_FALL, or rises. The banner is recorded as it shows, so a reload shows the next banner, here the backup one;
// a rise shows none. /api/prices and /api/history are answered by the page's routes, so nothing reaches CoinGecko.

test.use({ serviceWorkers: 'block' });

const NOW_MS = fixtureNowMs('buy');
/** The last complete close, the day before `NOW_MS`'s UTC day: the date the sentence names. */
const LAST_CLOSE = new Date(NOW_MS - 86_400_000).toISOString().slice(0, 10) as CalendarDate;
const DATE = createFormatters('pt-PT', 'en-GB').date(LAST_CLOSE);
const COINS = 'Bitcoin and Ethereum, in the amounts you hold,';
const WEEK = new RegExp(`^${COINS} fell \\d+% in the seven days to ${DATE}\\.$`, 'u');
const HIGH = new RegExp(`^On ${DATE} ${COINS} were \\d+% below their combined 90\u2011day high\\.$`, 'u');
/** The foot settled on something other than the red-day banner: the backup banner or the durability line. */
const NEXT = /^Your data lives only/u;

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

async function onToday(page: Page, shape: 'rise' | 'week-fall' | 'high-fall') {
  await page.clock.setFixedTime(new Date(NOW_MS));
  await routeFixturePrices(page, NOW_MS, shape);
  await seedPlan(page, fixtureSnapshot());
  await ready(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('a week-long fall: the banner, axe clean, recorded so a reload shows the next banner', async ({ page }) => {
      await onToday(page, 'week-fall');
      await expect(page.getByText(WEEK)).toBeVisible();
      await expect(page.getByText(NEXT)).toHaveCount(0);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

      await page.reload();
      await ready(page);
      await expect(page.getByText(NEXT)).toBeVisible();
      await expect(page.getByText(WEEK)).toHaveCount(0);
    });

    test('a fall from the 90-day high: Dismiss hides it and focuses the action; none on a reload', async ({ page }) => {
      await onToday(page, 'high-fall');
      await expect(page.getByText(HIGH)).toBeVisible();
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(page.getByText(HIGH)).toHaveCount(0);
      await expect(page.locator('#today-action')).toBeFocused();
      await page.reload();
      await ready(page);
      await expect(page.getByText(NEXT)).toBeVisible();
      await expect(page.getByText(HIGH)).toHaveCount(0);
    });

    test('the link opens the page about the fall under way', async ({ page }) => {
      await onToday(page, 'week-fall');
      await page.getByRole('link', { name: 'See the fall under way' }).click();
      await expect(page).toHaveURL(/\/learn\/fall-under-way$/u);
    });

    test('a rise: no banner, the foot settles on the next one', async ({ page }) => {
      await onToday(page, 'rise');
      await expect(page.getByText(NEXT)).toBeVisible();
      await expect(page.getByText(/in the seven days to|below (its|their combined) 90\u2011day high/u)).toHaveCount(0);
    });
  });
}
