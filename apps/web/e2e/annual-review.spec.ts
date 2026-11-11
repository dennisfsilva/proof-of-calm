import { expect, type Page, type TestInfo } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { Instant, Prefs } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The annual review at Today's foot on the viewport matrix (docs/DOMAIN.md §3.11, §3.12; docs/DESIGN.md §6, §8;
// docs/CONTENT-STYLE.md §3): the fixture plan, set up on 5 April 2026, on 20 April 2027 in its hold phase, over a
// year of rising closes, so no red day holds the review back. It holds BTC and ETH and was never exported, so the
// backup banner waits behind the review. /api/prices and /api/history are answered by the page's routes, with the
// worker blocked, so nothing reaches CoinGecko. On the iphone project the page's errors are attached to the
// report: Review the plan leaves Today while its history requests may still be on their way.

test.use({ serviceWorkers: 'block' });

const DUE_MS = Date.parse('2027-04-20T10:00:00Z');
const QUESTION = 'Is it still right? Have the rules changed?';
const SET_UP = new RegExp(`^You set up this plan on 5\\sApr\\s2026\\. ${QUESTION.replaceAll('?', '\\?')}$`, 'u');
const BACKUP = /^Your data lives only on this device\./u;

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

/** The page's uncaught errors, attached to the report on the iphone project. */
function watchErrors(page: Page, testInfo: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return async () => {
    if (testInfo.project.name !== 'iphone') return;
    await testInfo.attach('page errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
  };
}

async function onToday(page: Page, nowMs = DUE_MS, prefs?: Partial<Prefs>) {
  await page.clock.setFixedTime(new Date(nowMs));
  await routeFixturePrices(page, nowMs);
  await seedPlan(page, fixtureSnapshot(), prefs);
  await ready(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('a year after the plan was set up, the review takes the foot; Later brings the backup banner', async ({
      page,
    }) => {
      await onToday(page);
      await expect(page.getByText(SET_UP)).toBeVisible();
      await expect(page.getByText(BACKUP)).toHaveCount(0);
      await page.getByRole('button', { name: 'Later' }).click();
      await expect(page.getByText(BACKUP)).toBeVisible();
      await expect(page.getByText(SET_UP)).toHaveCount(0);
      await expect(page.locator('#today-action')).toBeFocused();
      await expect(page.locator('#today-action')).toBeInViewport();
      await page.reload();
      await ready(page);
      await expect(page.getByText(BACKUP)).toBeVisible();
      await expect(page.getByText(SET_UP)).toHaveCount(0);
    });

    test('Review the plan opens the page with the focus on its h1; once reviewed, Today asks no more', async ({
      page,
    }, testInfo) => {
      const attach = watchErrors(page, testInfo);
      await onToday(page);
      await page.getByRole('link', { name: 'Review the plan' }).click();
      await expect(page).toHaveURL(/\/plan\/review$/u);
      await expect(page.getByRole('heading', { level: 1, name: 'Review the plan' })).toBeFocused();
      await ready(page);
      await page.getByRole('button', { name: 'Mark as reviewed' }).click();
      await expect(page.getByText(/^You reviewed this plan on 20\sApr\s2027\./u)).toBeFocused();
      await page.goto('/today');
      await ready(page);
      await expect(page.getByText(BACKUP)).toBeVisible();
      await expect(page.getByText(QUESTION, { exact: false })).toHaveCount(0);
      await attach();
    });

    test('after a review, the banner names the day of the last one', async ({ page }) => {
      const nowMs = Date.parse('2028-11-20T10:00:00Z');
      await onToday(page, nowMs, { reviewedAt: '2027-11-11T10:00:00Z' as Instant });
      await expect(page.getByText(`You last reviewed this plan on 11 Nov 2027. ${QUESTION}`)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Review the plan' })).toHaveAttribute('href', '/plan/review');
    });
  });
}
