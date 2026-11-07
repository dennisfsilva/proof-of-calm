import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { Plan } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { test } from './support';

// The tax-year export under Settings → Currency & data → Your data on the viewport matrix (docs/DOMAIN.md §3.13):
// the fixture plan under Portugal (FIFO per venue, the 365-day rule) downloads the running year's per-lot file,
// and under the United Kingdom (a pooled lot rule) the running 2026 to 2027 year's raw listing, each byte for
// byte the file in ./fixtures. The local run sends no UK geolocation, so ADR-0029's 451 route does not apply.

test.use({ serviceWorkers: 'block' });

const fixture = fixtureSnapshot();
const plan = fixture.plan as Plan;

async function openData(page: Page, patch: Partial<Plan>) {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, { ...fixture, plan: { ...plan, ...patch } });
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

/** Picks `year` in the select, exports it and returns the file's suggested name and its text. */
async function exportYear(page: Page, year: string) {
  await page.getByLabel('Tax year').selectOption(year);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export tax-year CSV' }).click();
  const file = await event;
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

const expected = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('the PT fixture downloads the expected CSV', async ({ page }) => {
  await openData(page, {});
  await expect(page.getByLabel('Tax year')).toHaveValue('2026');
  const file = await exportYear(page, '2026');
  expect(file.name).toBe(`proof-of-calm-tax-year-2026-PT-${FIXTURE_DATES.buy}.csv`);
  expect(file.text).toBe(await expected('tax-year-2026-PT.csv'));
});

test('the GB fixture downloads the expected CSV', async ({ page }) => {
  await openData(page, {
    country: 'GB' as Plan['country'],
    payCurrency: 'GBP',
    displayCurrency: 'GBP',
    holdingRule: { kind: 'none' },
  });
  await expect(page.getByRole('option')).toHaveText(['2026 to 2027 (still running)', '2025 to 2026']);
  const file = await exportYear(page, '2027');
  expect(file.name).toBe(`proof-of-calm-tax-year-2026-27-GB-${FIXTURE_DATES.buy}.csv`);
  expect(file.text).toBe(await expected('tax-year-2026-27-GB.csv'));
});
