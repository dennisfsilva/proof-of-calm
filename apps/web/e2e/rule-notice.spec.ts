import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { createFormatters } from '@proofofcalm/app/lib/format';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate } from '@proofofcalm/core';
import portugal from '../../../packages/content/jurisdictions/pt.json' with { type: 'json' };
import { seedPlan } from './seed';
import { test } from './support';

// The rule-change notice on the viewport matrix (docs/DOMAIN.md §3.11, §3.12; docs/JURISDICTIONS.md §6): a
// plan that has seen no version of Portugal's rules gets the profile's `changeNotice`, or the generic sentence
// when it has none, dated by the profile's `changedOn`, at Today's foot; Dismiss stores the version, so the
// notice does not come back on a reload.
// /api/prices is answered by the page's route, so nothing reaches CoinGecko.

test.use({ serviceWorkers: 'block' });

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

/** The fixture plan on 20 October 2026, seeded as one that has seen no version of its country's rules. */
async function unseen(page: Page) {
  const nowMs = fixtureNowMs('buy');
  await page.clock.setFixedTime(new Date(nowMs));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(nowMs - 30_000).toISOString(), prices: {} } }),
  );
  const snapshot = fixtureSnapshot();
  await seedPlan(page, { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, countryRuleVersion: 0 } });
  await ready(page);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('the dated notice, axe clean, then Dismiss holds across a reload', async ({ page }) => {
      await unseen(page);
      const date = createFormatters('pt-PT', 'en-GB').date(portugal.status.changedOn as CalendarDate);
      const changeNotice: string | null = portugal.status.changeNotice;
      const notice = `${date}: ${changeNotice ?? 'the rules for Portugal changed. Review your plan.'}`;
      await expect(page.getByText(notice)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/plan');
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(page.getByText(notice)).toHaveCount(0);
      await expect(page.locator('#today-action')).toBeFocused();
      await page.reload();
      await ready(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await expect(page.getByText(notice)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
    });

    test('Dismiss by keyboard, read at the foot, brings the focused heading into view', async ({ page }) => {
      await unseen(page);
      const dismiss = page.getByRole('button', { name: 'Dismiss' });
      await expect(dismiss).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await dismiss.focus();
      await page.keyboard.press('Enter');
      await expect(dismiss).toHaveCount(0);
      await expect(page.locator('#today-action')).toBeFocused();
      await expect(page.locator('#today-action')).toBeInViewport();
    });
  });
}
