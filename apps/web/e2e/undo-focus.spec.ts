import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { test } from './support';

// Where the focus goes after an Undo (docs/DESIGN.md §6 "Focus after an action"), on the viewport matrix: the
// toast's Undo, reached by a click, by F6 or by Tab, puts the focus on the control that ran the action it
// undoes, with its ring showing, never on the element Tab passed last (the Learn link) or on a heading with no
// ring. End buying's Undo lands on End buying, with the plan paused or not (Pause has no Undo of its own: Pause
// from today and Resume are one button); Delete everything's Undo lands on Delete everything. The seeded fixture
// plan on 3 October 2026; /api/prices is answered by the page's route. Light and dark, at 125 % text on zoom-125
// (support.ts).

test.use({ serviceWorkers: 'block' });

const TODAY_MS = Date.parse('2026-10-03T10:00:00Z');
const PRICES = { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } };
const ENDED = /^Buying ended on 3\sOct\s2026\.$/u;
const fixture = fixtureSnapshot();
const live = fixture.entries.filter((entry) => entry.deletedAt === null).length;

type Reach = 'click' | 'F6' | 'Tab';
const REACHES: readonly Reach[] = ['click', 'F6', 'Tab'];

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
const undoButton = (page: Page) =>
  page.locator('[data-slot="toast"]:not([hidden])').getByRole('button', { name: 'Undo' });

/** Runs the toast's Undo the way the person reaches it. */
async function undo(page: Page, reach: Reach) {
  const button = undoButton(page);
  await expect(button).toBeVisible();
  if (reach === 'click') {
    await button.click();
    return;
  }
  if (reach === 'F6') {
    await page.keyboard.press('F6');
  } else {
    const focused = () => button.evaluate((element) => element === document.activeElement);
    for (let step = 0; step < 40 && !(await focused()); step += 1) await page.keyboard.press('Tab');
  }
  await expect(button, `${reach} reaches Undo`).toBeFocused();
  await page.keyboard.press('Enter');
}

/** The focus is on `control`, and its ring shows (docs/DESIGN.md §6 "Focus"). */
async function focusedWithRing(control: Locator) {
  await expect(control).toBeFocused();
  expect(await control.evaluate((element) => element.matches(':focus-visible')), 'the focus ring shows').toBe(true);
  await expect(control).toHaveCSS('outline-style', 'solid');
}

async function seededPlan(page: Page) {
  await page.clock.setFixedTime(new Date(TODAY_MS));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(TODAY_MS - 30_000).toISOString(), prices: PRICES } }),
  );
  await seedPlan(page, fixture);
  await page.goto('/plan');
  await ready(page);
}

const endButton = (page: Page) => page.getByRole('button', { name: 'End buying', exact: true });

async function endBuying(page: Page) {
  await endButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'End buying' });
  await expect(dialog.getByRole('button', { name: 'Keep the plan as it is' })).toBeFocused();
  await dialog.getByRole('button', { name: 'End buying today' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('main#main').getByText(ENDED)).toBeFocused();
}

async function openData(page: Page) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixture);
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

async function deleteEverything(page: Page) {
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete this plan and its ${live} entries?` });
  await expect(dialog.getByRole('button', { name: 'Keep this plan' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeFocused();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const reach of REACHES) {
      test(`End buying's Undo by ${reach} lands on End buying`, async ({ page }) => {
        await seededPlan(page);
        await endBuying(page);
        await undo(page, reach);
        await expect(page.locator('main#main').getByText(ENDED)).toHaveCount(0);
        await focusedWithRing(endButton(page));
      });

      test(`End buying's Undo on a paused plan by ${reach} lands on End buying, with Resume back`, async ({ page }) => {
        await seededPlan(page);
        await page.getByRole('button', { name: 'Pause from today' }).click();
        await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
        await endBuying(page);
        await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
        await undo(page, reach);
        await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
        await focusedWithRing(endButton(page));
      });

      test(`Delete everything's Undo by ${reach} lands on Delete everything`, async ({ page }) => {
        await openData(page);
        await deleteEverything(page);
        await undo(page, reach);
        await focusedWithRing(page.getByRole('button', { name: 'Delete everything' }));
      });
    }
  });
}
