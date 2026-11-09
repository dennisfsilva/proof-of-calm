import { expect } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { seedPlan } from './seed';
import { applyTextZoom, cspViolations, recordCspViolations, test } from './support';

// Settings → Currency & data, the country change on the viewport matrix (docs/DOMAIN.md §6 "Change country",
// docs/CONTENT-STYLE.md "Change country"): Portugal to Germany lists the change and names Portugal's rule being
// replaced and the day the last buy passes each rule, waits for the tick, then changes the plan and focuses the
// line that says so; the Plan page and a reload show Germany's plan. Portugal to the United Kingdom with EUR
// amounts logged asks which currency they were paid in (ADR-0053), and "Keep EUR" leaves them in €, with the
// line that offers GBP afterwards. The select opens with no CSP violation.

test('the Country select opens with no CSP violation', async ({ page }) => {
  await page.addInitScript(recordCspViolations);
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await page.getByRole('combobox', { name: 'Country' }).click();
  await expect(page.getByRole('option', { name: 'Germany' })).toBeVisible();
  expect(await page.evaluate(cspViolations)).toEqual([]);
});

test('a change from Portugal to Germany lists the rule it replaces, then changes the plan', async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();

  const select = page.getByRole('combobox', { name: 'Country' });
  await expect(select).toHaveText(/Portugal/);
  await select.click();
  await page.getByRole('option', { name: 'Germany' }).click();
  await expect(page.getByText('Country: Portugal to Germany')).toBeVisible();
  await expect(
    page.getByText("Holding rule now: Portugal's rule. 365 days, then tax-free.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("After the change: Germany's rule. 1 year, then tax-free.")).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: /^Last buy tax-free from .* now, from .* after the change/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sources' })).toHaveCount(2);
  await expect(page.getByText('Amounts you already logged stay as typed; nothing is converted.')).toBeVisible();

  const change = page.getByRole('button', { name: 'Change country to Germany' });
  await change.click();
  const tick = page.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" });
  await expect(tick).toBeFocused();
  await expect(page.getByText('Tick the box to replace the holding rule.')).toBeVisible();
  await tick.click();
  await change.click();
  // The result line reports the change and takes the focus from the unmounted button (docs/DESIGN.md §6), in
  // view: the confirmation above it has gone, so the document shrank under the line.
  const status = page.getByRole('status').filter({ hasText: 'Country changed to Germany.' });
  await expect(status).toBeFocused();
  await expect(status).toBeInViewport();
  // Its scroll margin leaves a stack step above it (docs/DESIGN.md §6): flush with the top edge, the line read
  // without context (android-small and zoom-125, 2026-11-05).
  expect((await status.boundingBox())?.y, 'room above the focused result line').toBeGreaterThanOrEqual(16);
  await expect(select).toHaveText(/Germany/);

  await page.goto('/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveText(/Germany/);
});

test('a change from Portugal to the United Kingdom with EUR amounts asks, and Keep leaves them in €', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.getByRole('option', { name: 'United Kingdom' }).click();

  const keep = page.getByRole('radio', { name: /^Keep EUR/ });
  await expect(keep).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Change to GBP/ })).toBeVisible();
  await expect(page.getByText(/^Tax-year files follow your current country's rules/)).toBeVisible();
  for (const box of await page.getByRole('checkbox').all()) await box.click();
  const change = page.getByRole('button', { name: 'Change country to United Kingdom' });
  // Nothing is chosen for the person: a confirm without an answer is refused next to the question.
  await change.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose Keep EUR or Change to GBP.' })).toBeVisible();
  await keep.click();
  await change.click();
  await expect(page.getByRole('status').filter({ hasText: 'Country changed to United Kingdom.' })).toBeFocused();
  // The plan stays in EUR, so Currency & data offers the country's currency, and the amounts still read in €.
  await expect(page.getByText(/^Your plan is in EUR, and your country's currency is GBP\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change to GBP' })).toBeVisible();
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('tbody [data-slot="table-row"]').first()).toContainText('€');
  await expect(page.locator('main#main')).not.toContainText('£');
});

// A card more than twelve months past its nextReviewDue (docs/JURISDICTIONS.md §1): on 1 January 2029 Portugal's,
// due 2 November 2027, says so, with no Sources link and the rule by its name alone.
test('a card past its review reads Not reviewed since', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2029-01-01T10:00:00Z'));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Hold & sell' }).click();
  await expect(page.getByText(/^Not reviewed since /)).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Portugal's rule/ })).toBeVisible();
  await expect(page.getByText('365 days, then tax-free.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sources' })).toHaveCount(0);
});

// A refusal keeps the focus off `body` (docs/DESIGN.md §6 "Focus after an action"): a second tab moves the plan to
// Germany while this one waits to make it the general profile, so the write is refused and the line that says so
// takes the focus from the button, which stays focusable while the change is written.
test('a change refused because another tab moved the plan focuses the line that says so', async ({
  page,
  context,
}, testInfo) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  const open = async (tab: typeof page, name: string) => {
    await tab.goto('/settings');
    await expect(tab.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
    await tab.getByRole('tab', { name: 'Currency & data' }).click();
    await tab.getByRole('combobox', { name: 'Country' }).click();
    await tab.getByRole('option', { name }).click();
    await tab.getByRole('checkbox', { name: /^Replace Portugal's rule with/ }).click();
  };
  await open(page, 'Other country');

  // The second tab is opened here, not by `test`, so it takes the zoom-125 project's text zoom itself.
  const other = await context.newPage();
  await applyTextZoom(other, testInfo);
  await open(other, 'Germany');
  await other.getByRole('button', { name: 'Change country to Germany' }).click();
  const status = other.getByRole('status').filter({ hasText: 'Country changed to Germany.' });
  await expect(status).toBeFocused();
  await expect(status).toBeInViewport();
  expect((await status.boundingBox())?.y, 'room above the focused result line').toBeGreaterThanOrEqual(16);
  await other.close();

  await page.getByRole('button', { name: 'Change country to Other country' }).click();
  const line = page.getByRole('alert').filter({ hasText: 'Your plan changed in another browser tab' });
  await expect(line).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});
