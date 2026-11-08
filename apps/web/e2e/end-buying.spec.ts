import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { test } from './support';

// End buying on the viewport matrix (docs/DOMAIN.md §6 "End buying today"; CONTENT-STYLE §3 "End buying",
// "Today, the primary action"; docs/DESIGN.md §6 "Focus after an action"): the seeded fixture plan on
// 3 October 2026, September recorded and October's buy day on the 5th. `Keep the plan as it is` changes nothing
// and gives the focus back to End buying; End buying today makes today the last buy day, so Today has no buy day left,
// also after a reload, and the focus goes to Plan's ended line; the toast's Undo brings October's buy day back
// and the focus to End buying. The ended Plan fits the viewport, keeps 44 px targets and passes axe, as
// matrix.spec.ts checks every page. /api/prices is answered by the page's route, so nothing reaches
// CoinGecko. Light and dark, at 125 % text on zoom-125 (support.ts).

test.use({ serviceWorkers: 'block' });

const TODAY_MS = Date.parse('2026-10-03T10:00:00Z');
const TARGET = 44;
const PRICES = { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } };
const NEXT = /^Next buy day: 5\sOct\s2026$/u;
const ENDED = /^Buying ended on 3\sOct\s2026\.$/u;

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
const endButton = (page: Page) => page.getByRole('button', { name: 'End buying', exact: true });
/** Plan's line, not the toast that carries the same words. */
const endedLine = (page: Page) => page.locator('main#main').getByText(ENDED);

async function seeded(page: Page) {
  await page.clock.setFixedTime(new Date(TODAY_MS));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(TODAY_MS - 30_000).toISOString(), prices: PRICES } }),
  );
  await seedPlan(page, fixtureSnapshot());
}

async function open(page: Page, path: '/plan' | '/today') {
  await page.goto(path);
  await ready(page);
}

/** Opens the dialog from Plan; it opens on Keep the plan as it is. */
async function openDialog(page: Page) {
  await open(page, '/plan');
  await endButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'End buying' });
  await expect(dialog.getByRole('button', { name: 'Keep the plan as it is' })).toBeFocused();
  return dialog;
}

async function endOnPlan(page: Page) {
  const dialog = await openDialog(page);
  await dialog.getByRole('button', { name: 'End buying today' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(endedLine(page)).toBeFocused();
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

    test('Keep the plan as it is changes nothing and gives the focus back to End buying', async ({ page }) => {
      await seeded(page);
      const dialog = await openDialog(page);
      const keep = dialog.getByRole('button', { name: 'Keep the plan as it is' });
      // Tab follows the footer's order and wraps inside the dialog: past the last button it lands on Base UI's
      // focus guard, which moves it to the first on the next animation frame, so the auto-waiting check holds.
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'End buying today' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(keep).toBeFocused();
      await keep.click();
      await expect(dialog).toHaveCount(0);
      await expect(endButton(page)).toBeFocused();

      await open(page, '/today');
      await expect(page.getByRole('heading', { level: 2, name: NEXT })).toBeVisible();
    });

    test('End buying today: the focus on the ended line, and Today has no buy day left, also after a reload', async ({
      page,
    }) => {
      await seeded(page);
      await endOnPlan(page);
      await expect(endButton(page)).toHaveCount(0);
      await fitsAndPasses(page);

      await open(page, '/today');
      await expect(page.getByRole('heading', { level: 2, name: 'No buy days left' })).toBeVisible();
      await page.reload();
      await ready(page);
      await expect(page.getByRole('heading', { level: 2, name: 'No buy days left' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: NEXT })).toHaveCount(0);
    });

    test('Undo in the toast brings October back and the focus to End buying', async ({ page }) => {
      await seeded(page);
      await endOnPlan(page);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(endButton(page)).toBeFocused();
      await expect(endedLine(page)).toHaveCount(0);

      await open(page, '/today');
      await expect(page.getByRole('heading', { level: 2, name: NEXT })).toBeVisible();
    });
  });
}
