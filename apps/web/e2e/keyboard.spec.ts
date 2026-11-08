import { expect, type Locator, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { templateById } from '@proofofcalm/content';
import { seedPlan } from './seed';
import { test } from './support';

// Forms with the on-screen keyboard open (docs/ENGINEERING.md §3, ROADMAP M1 "Proven by"): on the two
// phones and the tablet, a field is focused, then the keyboard is emulated by reducing the viewport's
// height to KEYBOARD_OPEN of the project's, and the browser's own scroll of the focused field into view
// by `scrollIntoView({ block: 'nearest' })`. The field then lies inside the viewport and is hit-testable,
// with its focus ring, so neither the tab bar nor a toast covers it; Tab reaches the form's submit button,
// which scrolls into view and is clear the same way; the page never scrolls sideways. Record a purchase,
// Edit entry, onboarding's numbers step and Settings' Plan tab, and Edit entry and the Plan tab again with a
// toast up (asserted, with its `--toast-inset`); a control proves the check reports Save under the tab bar.

/** The share of the viewport's height left above the keyboard (docs/ENGINEERING.md §3: 45 %). */
const KEYBOARD_OPEN = 0.45;
const PROJECTS: readonly string[] = ['android-small', 'iphone', 'tablet'];

test.use({ serviceWorkers: 'block' });
test.beforeEach(({ page: _ }, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: the keyboard exists only on the touch projects, a runtime skip elsewhere
  test.skip(!PROJECTS.includes(testInfo.project.name), 'no on-screen keyboard on this project');
});

/**
 * What keeps `element` and its focus ring from being seen and pressed (docs/DESIGN.md §6: a focused element
 * stops with its whole ring clear of a sticky bar); empty when nothing does. The box is the element's, grown by
 * the ring's extent (`--focus-offset` plus `--focus-width`): it lies inside the viewport and inside the padding
 * box of every ancestor that clips its overflow (a sheet's scrolling popup), and neither the tab
 * bar nor a toast card is painted over any part of it; the element itself is hit at its centre and at its four
 * inner corners (inset past its radius). SLACK is the sub-pixel slack of fractional layout against whole
 * scroll offsets. A bar under a modal sheet's scrim is not over the sheet, so an overlap counts where a probe
 * in it hits the bar or the card. Runs in the page.
 */
function obstructions(element: Element): string[] {
  const SLACK = 1;
  // A length in px ("2px", or "8px 4px" for an elliptical corner, whose first radius is taken).
  const px = (value: string) => {
    const length = Number(/^\s*(-?[\d.]+)px/u.exec(value)?.[1]);
    if (!Number.isFinite(length)) throw new Error(`not a length in px: "${value}"`);
    return length;
  };
  const root = getComputedStyle(document.documentElement);
  const ring = px(root.getPropertyValue('--focus-offset')) + px(root.getPropertyValue('--focus-width'));
  const own = element.getBoundingClientRect();
  const box = { left: own.left - ring, top: own.top - ring, right: own.right + ring, bottom: own.bottom + ring };
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const at = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;
  const found: string[] = [];
  if (box.left < -SLACK || box.top < -SLACK || box.right > width + SLACK || box.bottom > height + SLACK) {
    found.push(`outside the ${width}x${height} viewport: ${at(box.left, box.top)} to ${at(box.right, box.bottom)}`);
  }
  // A scroller clips at its padding box, which the viewport check cannot see (a sheet's popup scrolls).
  // Both boxes come from the same fractional layout, so a clip of a fraction of a pixel counts: CLIP_SLACK
  // only absorbs float noise. The scroller's scroll padding absorbs its whole-pixel scroll offsets.
  for (let parent = element.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipsX = style.overflowX !== 'visible';
    const clipsY = style.overflowY !== 'visible';
    if (!(clipsX || clipsY)) continue;
    const outer = parent.getBoundingClientRect();
    const borderLeft = px(style.borderLeftWidth);
    const borderTop = px(style.borderTopWidth);
    const borderRight = px(style.borderRightWidth);
    const borderBottom = px(style.borderBottomWidth);
    // A classic scrollbar takes whole pixels at the right; the overlay scrollbars of the phones take none.
    const scrollbar = Math.max(0, Math.round(parent.offsetWidth - parent.clientWidth - borderLeft - borderRight));
    const clip = {
      left: outer.left + borderLeft,
      top: outer.top + borderTop,
      right: outer.right - borderRight - scrollbar,
      bottom: outer.bottom - borderBottom,
    };
    const CLIP_SLACK = 0.05;
    const cut = Math.max(
      clipsX ? Math.max(clip.left - box.left, box.right - clip.right) : 0,
      clipsY ? Math.max(clip.top - box.top, box.bottom - clip.bottom) : 0,
    );
    if (cut > CLIP_SLACK) {
      const name = parent.dataset.slot ?? parent.tagName.toLowerCase();
      found.push(
        `${name} clips ${Math.round(cut * 100) / 100} px of it, at ${at(box.left, box.top)} to ${at(box.right, box.bottom)}`,
      );
    }
  }
  const obstacles: [string, Element][] = [];
  for (const bar of document.querySelectorAll('[data-slot="tab-bar"] nav')) obstacles.push(['the tab bar', bar]);
  for (const card of document.querySelectorAll('[data-slot="toast"]:not([hidden])')) obstacles.push(['a toast', card]);
  for (const [name, obstacle] of obstacles) {
    const over = obstacle.getBoundingClientRect();
    const left = Math.max(box.left, over.left);
    const right = Math.min(box.right, over.right);
    const top = Math.max(box.top, over.top);
    const bottom = Math.min(box.bottom, over.bottom);
    if (right - left <= SLACK || bottom - top <= SLACK) continue;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    if (hit !== null && obstacle.contains(hit)) found.push(`${name} lies over ${Math.round(bottom - top)} px of it`);
  }
  const inset = px(getComputedStyle(element).borderTopLeftRadius) * 0.3 + SLACK;
  const points: [number, number][] = [
    [(own.left + own.right) / 2, (own.top + own.bottom) / 2],
    [own.left + inset, own.top + inset],
    [own.right - inset, own.top + inset],
    [own.left + inset, own.bottom - inset],
    [own.right - inset, own.bottom - inset],
  ];
  for (const [x, y] of points) {
    const hit = document.elementFromPoint(x, y);
    if (hit === null || !element.contains(hit)) found.push(`covered at ${at(x, y)} by ${hit?.outerHTML.slice(0, 80)}`);
  }
  return found;
}

async function reachable(page: Page, element: Locator, what: string) {
  await expect
    .poll(() => element.evaluate(obstructions), { message: `nothing hides ${what} or its focus ring` })
    .toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
}

/** Opens the keyboard: the viewport keeps KEYBOARD_OPEN of the project's height. */
async function openKeyboard(page: Page) {
  const size = page.viewportSize();
  if (size === null) throw new Error('the project sets a viewport');
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * KEYBOARD_OPEN) });
}

/**
 * Holds every toast open: a toast's timer waits while the window lacks focus (packages/ui toast.tsx), and only
 * the toast asks `document.hasFocus`, so under a loaded runner its UNDO_WINDOW_MS cannot run out mid-check.
 */
async function holdToasts(page: Page) {
  await page.addInitScript(() => {
    document.hasFocus = () => false;
  });
}

/** A toast is on screen and has set `--toast-inset` on `<html>` to a band above zero (docs/DESIGN.md §7). */
async function toastShown(page: Page) {
  await expect(page.locator('[data-slot="toast"]:not([hidden])'), 'a toast is on screen').toBeInViewport();
  const inset = await page.evaluate(() => document.documentElement.style.getPropertyValue('--toast-inset'));
  const band = Number(/([\d.]+)px/u.exec(inset)?.[1] ?? '0');
  expect(band, `--toast-inset (${inset}) holds the toast's band`).toBeGreaterThan(0);
}

/**
 * Focuses `field`, opens the keyboard, and checks the field and then `submit`, reached by Tab; with `toast`,
 * a toast stays on screen through both checks, so they cannot pass without one.
 */
async function withKeyboard(page: Page, field: Locator, submit: Locator, { toast = false } = {}) {
  await field.focus();
  await openKeyboard(page);
  await field.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
  await expect(field).toBeFocused();
  if (toast) await toastShown(page);
  await reachable(page, field, 'the focused field');

  const focused = () => submit.evaluate((element) => element === document.activeElement);
  for (let step = 0; step < 30 && !(await focused()); step += 1) await page.keyboard.press('Tab');
  await expect(submit, 'Tab reaches the submit button').toBeFocused();
  await reachable(page, submit, 'the submit button');
  if (toast) await toastShown(page);
}

async function seeded(page: Page, path: string) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto(path);
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
}

test.describe('with the keyboard open, the focused field and Save stay visible and reachable', () => {
  test('Record a purchase', async ({ page }) => {
    await seeded(page, '/log');
    await page.getByRole('button', { name: 'Record a purchase' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Log the monthly buy');
    await withKeyboard(page, sheet.getByLabel('BTC received (units)'), sheet.getByRole('button', { name: 'Save' }));
  });

  test('Edit entry', async ({ page }) => {
    await seeded(page, '/log');
    await page
      .getByRole('button', { name: /Monthly buy/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Edit entry' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Edit the entry');
    await withKeyboard(page, sheet.getByLabel('BTC paid (EUR)'), sheet.getByRole('button', { name: 'Save' }));
  });

  // A toast's own Edit closes it, so the toast that stays up is the one of the purchase just recorded on
  // Today, still showing (held) when Log's Edit entry opens. The sheet paints over the toast, so a
  // probe where they overlap hits the sheet; on the Plan tab below, the toast paints over the page.
  test('Edit entry with the toast of a purchase just recorded still up', async ({ page }) => {
    const nowMs = fixtureNowMs('buy');
    const prices = { BTC: { EUR: '60000.12' }, ETH: { EUR: '2500.5' } };
    await page.route('**/api/prices?*', (route) =>
      route.fulfill({ json: { at: new Date(nowMs - 30_000).toISOString(), prices } }),
    );
    await holdToasts(page);
    await seeded(page, '/today');
    await page.getByRole('button', { name: 'Bought as planned' }).click();
    await toastShown(page);
    await page.getByRole('link', { name: 'Log', exact: true }).click();
    await page
      .getByRole('button', { name: /Monthly buy/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Edit entry' }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit the entry' });
    await withKeyboard(page, sheet.getByLabel('BTC paid (EUR)'), sheet.getByRole('button', { name: 'Save' }), {
      toast: true,
    });
  });

  test("onboarding's numbers step", async ({ page }) => {
    await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
    await page.goto('/onboarding');
    await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: 'Continue with Portugal' }).click();
    await page.getByRole('radio', { name: templateById('two-coins')?.name ?? 'two-coins', exact: true }).click();
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Amounts and dates' })).toBeVisible();
    await withKeyboard(page, page.getByLabel(/^Monthly amount/), next);
  });

  test("Settings' Plan tab", async ({ page }) => {
    await seeded(page, '/settings');
    await page.getByRole('tab', { name: 'Plan' }).click();
    await withKeyboard(
      page,
      page.getByLabel('Monthly amount (EUR)'),
      page.getByRole('button', { name: 'Save changes' }),
    );
  });

  test("Settings' Plan tab with the toast of its last save still up", async ({ page }) => {
    await holdToasts(page);
    await seeded(page, '/settings');
    await page.getByRole('tab', { name: 'Plan' }).click();
    const amount = page.getByLabel('Monthly amount (EUR)');
    const save = page.getByRole('button', { name: 'Save changes' });
    await amount.fill('120');
    await save.click();
    await toastShown(page);
    await withKeyboard(page, amount, save, { toast: true });
  });
});

// The control: Save scrolled 20 px under the tab bar must be reported, or the checks above prove nothing.
test('the check reports Save scrolled 20 px under the tab bar', async ({ page }, testInfo) => {
  // biome-ignore lint/suspicious/noSkippedTests: one phone is enough to prove the check can fail
  test.skip(testInfo.project.name !== 'android-small', 'the control runs on one project');
  await seeded(page, '/settings');
  await page.getByRole('tab', { name: 'Plan' }).click();
  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeVisible();
  await openKeyboard(page);
  const under = await save.evaluate((element) => {
    const bar = document.querySelector('[data-slot="tab-bar"] nav');
    if (bar === null) throw new Error('the phone shows the tab bar');
    const barTop = () => bar.getBoundingClientRect().top;
    window.scrollBy(0, element.getBoundingClientRect().bottom - (barTop() + 20));
    return element.getBoundingClientRect().bottom - barTop();
  });
  expect(under, 'Save ends 20 px under the bar').toBeCloseTo(20, 0);
  expect(await save.evaluate(obstructions)).toContainEqual(expect.stringMatching(/^the tab bar lies over/u));
});
