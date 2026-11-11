import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// Where the focus goes after an Undo (docs/DESIGN.md §6 "Focus after an action"), on the viewport matrix: the
// toast's Undo, reached by a click, by F6 or by Tab, puts the focus on the control that ran the action it
// undoes, with its ring showing, never on the element Tab passed last (the Learn link) or on a heading with no
// ring. End buying's Undo lands on End buying, with the plan paused or not (Pause has no Undo of its own: Pause
// from today and Resume are one button); Delete everything's Undo lands on Delete everything. The seeded fixture
// plan on 3 October 2026; /api/prices is answered by the page's route. Light and dark, at 125 % text on zoom-125
// (support.ts).
// A Log row's Edit, saved with the row keeping its place, gives the focus back to Edit entry without passing the
// shell's skip link on the way (which shows only while it has the focus): a purchase row of the fixture, and a move
// row of the fixture with a buy at Kraken and a move from Kraken to Ledger. Every `focusin` from before Save until
// the focus is on Edit entry is recorded. On 2026-11-10 no project gave the link the focus (Save, the popup, then Edit
// entry once the exit ends); a screenshot during the sheet's exit once showed it without its focus.
// A Log row's Delete entry, far down a Log longer than the window, moves the focus to the toggle of the row now in its
// place, in view, with the page still scrolled down; its Undo, by a click or by F6, lands on the restored row's toggle,
// in view; a `scroll` listener's least `scrollY` from the delete to that focus stays above 0 (the page never jumps to
// its top).

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

/** The fixture with an extra buy of 0.08 BTC at Kraken and a move of 0.05 BTC from Kraken to Ledger. */
function withMove(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const kraken: Entry = {
    ...first,
    id: '00000000-0000-4000-8000-000000000400' as Entry['id'],
    kind: 'extra',
    slot: null,
    date: '2026-06-18' as CalendarDate,
    amount: '4000' as Entry['amount'],
    units: '0.08' as Entry['units'],
    venue: 'Kraken',
  };
  const move: Entry = {
    ...kraken,
    id: '00000000-0000-4000-8000-000000000401' as Entry['id'],
    kind: 'move',
    amount: null,
    date: '2026-10-14' as CalendarDate,
    units: '0.05' as Entry['units'],
    to: 'Ledger',
    received: '0.0498' as Entry['units'],
  };
  return { ...snapshot, entries: [...snapshot.entries, kraken, move] };
}

/** Starts recording every focus target, the skip link named as such, from this moment. */
async function recordFocus(page: Page) {
  await page.evaluate(() => {
    const targets: string[] = [];
    Object.assign(window, { focusTargets: targets });
    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target as HTMLElement;
        const skip = target.matches('a[href="#main"]');
        targets.push(skip ? 'skip link' : `${target.tagName} ${target.textContent?.slice(0, 40) ?? ''}`);
      },
      true,
    );
  });
}

const focusTargets = (page: Page) =>
  page.evaluate(() => (window as unknown as { focusTargets: string[] }).focusTargets);

/** Opens `row`, its Edit by a click with the focus on it, as a keyboard or a pointer leaves it, and returns Edit. */
async function openEdit(page: Page, row: Locator) {
  await row.getByRole('button', { expanded: false }).click();
  const edit = page.getByRole('button', { name: 'Edit entry' });
  await edit.focus();
  await edit.click();
  return edit;
}

async function saveAndLandOnEdit(page: Page, sheet: Locator, edit: Locator) {
  await recordFocus(page);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('Entry saved.');
  await expect(edit).toBeFocused();
  const targets = await focusTargets(page);
  expect(targets, `the focus went ${targets.join(' → ')}`).not.toContain('skip link');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme}, a Log row's Edit`, () => {
    test.use({ colorScheme });

    const openLog = async (page: Page, snapshot: Snapshot) => {
      const nowMs = fixtureNowMs('buy');
      await page.clock.setFixedTime(new Date(nowMs));
      await routeFixturePrices(page, nowMs);
      await seedPlan(page, snapshot);
      await page.goto('/log');
      await ready(page);
    };
    const rows = (page: Page) => page.locator('tbody [data-slot="table-row"]');

    test("after an Edit's save on a purchase row the focus returns to Edit entry and never reaches the skip link", async ({
      page,
    }) => {
      await openLog(page, fixtureSnapshot());
      const edit = await openEdit(page, rows(page).filter({ hasText: /^5\sSept?\s2026/u }));
      const sheet = page.getByRole('dialog', { name: 'Edit the entry' });
      await sheet.getByLabel('BTC paid (EUR)').fill('75');
      await saveAndLandOnEdit(page, sheet, edit);
    });

    test("after an Edit's save on a move row the focus returns to Edit entry and never reaches the skip link", async ({
      page,
    }) => {
      await openLog(page, withMove());
      const edit = await openEdit(page, rows(page).filter({ hasText: 'Coins moved' }));
      const sheet = page.getByRole('dialog', { name: 'Edit the move' });
      await sheet.getByLabel('Units received').fill('0.0499');
      await saveAndLandOnEdit(page, sheet, edit);
    });
  });
}

/** The fixture with an extra buy on each day from 6 to 30 April 2026: a Log longer than any project's window. */
function withLongLog(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const april = Array.from(
    { length: 25 },
    (_, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-0000000005${String(index).padStart(2, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      date: `2026-04-${String(index + 6).padStart(2, '0')}` as CalendarDate,
      amount: '50' as Entry['amount'],
      units: '0.0008' as Entry['units'],
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...april] };
}

/** Starts keeping the least `scrollY` from this moment, so a jump to the page's top shows. */
async function recordLeastScroll(page: Page) {
  await page.evaluate(() => {
    const least = { y: window.scrollY };
    Object.assign(window, { leastScroll: least });
    window.addEventListener('scroll', () => {
      least.y = Math.min(least.y, window.scrollY);
    });
  });
}

const leastScroll = (page: Page) =>
  page.evaluate(() => (window as unknown as { leastScroll: { y: number } }).leastScroll.y);

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme}, a Log row's delete far down a long Log`, () => {
    test.use({ colorScheme });

    const toggle = (page: Page, day: RegExp) => page.locator('tbody button[aria-expanded]').filter({ hasText: day });
    const DELETED = /^12\sApr\s2026/u;
    const NEXT = /^11\sApr\s2026/u;

    for (const reach of ['click', 'F6'] as const) {
      test(`the focus stays in the deleted row's place, and Undo by ${reach} lands on the restored row`, async ({
        page,
      }) => {
        const nowMs = fixtureNowMs('buy');
        await page.clock.setFixedTime(new Date(nowMs));
        await routeFixturePrices(page, nowMs);
        await seedPlan(page, withLongLog());
        await page.goto('/log');
        await ready(page);
        await page.getByRole('button', { name: /^Show all \d+ entries$/u }).click();
        await expect(toggle(page, DELETED)).toHaveCount(1);

        await toggle(page, DELETED).click();
        const remove = page.getByRole('button', { name: 'Delete entry' });
        await remove.scrollIntoViewIfNeeded();
        await recordLeastScroll(page);
        await remove.click();
        await expect(toggle(page, DELETED)).toHaveCount(0);
        const next = toggle(page, NEXT);
        await expect(next).toBeFocused();
        await expect(next).toBeInViewport();
        expect(await page.evaluate(() => window.scrollY), 'the page stays scrolled down').toBeGreaterThan(0);

        await undo(page, reach);
        const restored = toggle(page, DELETED);
        // By keyboard, the ring shows on the restored row (docs/DESIGN.md §6 "Focus"); after a pointer's click a
        // script's focus shows none, by the browsers' focus-visible rule.
        if (reach === 'F6') await focusedWithRing(restored);
        else await expect(restored).toBeFocused();
        await expect(restored).toBeInViewport();
        expect(await leastScroll(page), 'from the delete to the restored row, never the page top').toBeGreaterThan(0);
      });
    }
  });
}
