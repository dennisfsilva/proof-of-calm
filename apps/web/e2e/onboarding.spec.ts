import { readFile } from 'node:fs/promises';
import { type Download, expect, type Page } from '@playwright/test';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { templateById } from '@proofofcalm/content';
import { seedPlan } from './seed';
import { test } from './support';

// Onboarding (ROADMAP M1): the projects run in en-GB and Europe/Lisbon, so the device suggests Portugal;
// one tap confirms it, a template and two numbers lead on through the sentence and the reminder, whose
// "Add to calendar" saves a monthly calendar file with no amount in it, to the summary, whose Start writes
// the plan; the Plan screen then shows the template's coins. The custom path starts a plan of the user's
// own coins and split, each step's heading taking the focus, and "Later" saves no file; its start row wraps
// inside the summary at 125 % text. The Cycle plan in Germany goes on only once its early sell window is
// accepted (docs/DOMAIN.md §5), and a stored plan is never written over. Every step can be left and reopened
// in the same tab: the draft and its step are kept in session storage until Start (ADR-0020 Readings).

const START = 'Accept and start the plan';
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true });

async function openOnboarding(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+01:00'));
  await page.goto('/onboarding');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Set up a plan' })).toBeVisible();
}

async function pickTemplate(page: Page, id: string) {
  await page.getByRole('radio', { name: templateById(id)?.name ?? id, exact: true }).click();
  await continueButton(page).click();
}

/** From the amounts and dates through the sentence to the reminder step. */
async function toReminder(page: Page, why = '') {
  await continueButton(page).click();
  const heading = 'In one sentence, why are you doing this?';
  await expect(page.getByRole('heading', { level: 2, name: heading })).toBeFocused();
  if (why !== '') await page.getByRole('textbox', { name: heading }).fill(why);
  await continueButton(page).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Where should the monthly reminder go?' })).toBeFocused();
}

test('the template path saves the calendar file and starts a plan with the template coins', async ({ page }) => {
  await openOnboarding(page);
  await page.getByRole('button', { name: 'Continue with Portugal' }).click();
  await pickTemplate(page, 'two-coins');
  await page.getByLabel(/^Monthly amount/).fill('100');
  await page.getByLabel(/^Last buy/).fill('2036-10-01');
  await expect(page.getByRole('button', { name: START })).toHaveCount(0);
  await toReminder(page, 'I buy on the 20th and I do not check the price on other days.');

  const saved: Promise<Download> = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe('proof-of-calm-reminder.ics');
  const file = await readFile(await download.path(), 'utf8');
  expect(file).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=20;');
  expect(file).toContain('SUMMARY:Your buy day');
  expect(file).not.toMatch(/\b100\b|EUR|€|BTC|ETH/);

  await expect(page.getByRole('heading', { level: 2, name: 'Check your plan' })).toBeFocused();
  await expect(page.getByText('Calendar file saved')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Risk disclosure' })).toHaveAttribute('href', '/risk');
  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto('/plan');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/BTC 70\s?%, ETH 30\s?%/)).toBeVisible();
});

test('the custom path starts a plan of your own coins, Later saves no file, and the start row stays inside', async ({
  page,
}) => {
  const downloads: Download[] = [];
  page.on('download', (download) => void downloads.push(download));
  await openOnboarding(page);
  await page.getByRole('button', { name: 'Continue with Portugal' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Choose a starting point' })).toBeFocused();
  await page.getByRole('radio', { name: 'Your own coins' }).click();
  await continueButton(page).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Choose your coins and their split' })).toBeFocused();
  await page.getByRole('button', { name: 'Add Bitcoin' }).click();
  await page.getByRole('button', { name: 'Add Ethereum' }).click();
  await page.getByLabel(/^Bitcoin share/).fill('60');
  await page.getByLabel(/^Ethereum share/).fill('40');
  await continueButton(page).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Choose the amounts and dates' })).toBeFocused();
  await page.getByLabel(/^Monthly amount/).fill('100');
  await page.getByLabel(/^Last buy/).fill('2036-10-01');
  await toReminder(page);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  const heading = page.getByRole('heading', { level: 2, name: 'Check your plan' });
  await expect(heading).toBeFocused();
  expect(downloads).toHaveLength(0);

  // At 125 % text the row wraps: every button ends inside the step, none runs off its right edge.
  const step = await page.locator('section').filter({ has: heading }).last().boundingBox();
  for (const name of ['Back', START]) {
    const button = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(button !== null && step !== null && button.x + button.width <= step.x + step.width + 0.5).toBe(true);
  }

  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/plan');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText(/BTC 60\s?%, ETH 40\s?%/)).toBeVisible();
});

test('the Cycle plan in Germany goes on only once its early sell window is accepted', async ({ page }) => {
  await openOnboarding(page);
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.getByRole('option', { name: 'Germany', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Germany' }).click();
  await pickTemplate(page, 'cycle-plan');
  await page.getByLabel(/^Monthly amount/).fill('100');
  await expect(page.getByText(/^The sell window opens on .+ The template's last buy is tax-free from/)).toBeVisible();
  const accept = page.getByRole('checkbox', { name: /^Open the sell window on/ });
  await expect(accept).not.toBeChecked();

  await continueButton(page).click();
  await expect(accept).toHaveAttribute('aria-invalid', 'true');
  await expect(accept).toBeFocused();

  await accept.click();
  await toReminder(page);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('a step left for another page or reloaded opens again with what was typed, until Start', async ({ page }) => {
  await openOnboarding(page);
  await page.getByRole('button', { name: 'Continue with Portugal' }).click();
  await page.getByRole('radio', { name: 'Your own coins' }).click();
  await continueButton(page).click();
  await page.getByRole('button', { name: 'Add Bitcoin' }).click();
  await page.getByLabel(/^Bitcoin share/).fill('100');
  await continueButton(page).click();
  await page.getByLabel(/^Monthly amount/).fill('100');
  await page.getByLabel(/^Last buy/).fill('2036-10-01');

  await page.goto('/plan');
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { level: 2, name: 'Choose the amounts and dates' })).toBeVisible();
  await expect(page.getByLabel(/^Monthly amount/)).toHaveValue('100');
  await expect(page.getByLabel(/^Last buy/)).toHaveValue('2036-10-01');

  const why = 'I buy once a month and leave it.';
  await toReminder(page, why);
  await page.reload();
  const reminder = page.getByRole('heading', { level: 2, name: 'Where should the monthly reminder go?' });
  await expect(reminder).toBeVisible();
  await expect(reminder).not.toBeFocused();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'In one sentence, why are you doing this?' })).toHaveValue(why);
  await continueButton(page).click();

  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByRole('button', { name: START }).click();
  await expect(page).toHaveURL(/\/today$/);
  const drafts = await page.evaluate(() =>
    Object.keys(sessionStorage).filter((key) => key.includes(':draft:onboarding:')),
  );
  expect(drafts).toEqual([]);
});

test('a return to onboarding with a plan stored says so and links to it', async ({ page }) => {
  await seedPlan(page, fixtureSnapshot());
  await openOnboarding(page);
  await expect(page.getByText('A plan is already set up on this device.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the plan' })).toHaveAttribute('href', '/plan');
  await expect(page.getByRole('button', { name: START })).toHaveCount(0);
});
