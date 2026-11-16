import { expect, type Page } from '@playwright/test';
import { TEMPLATES } from '@proofofcalm/content';
import ptOnboarding from '../../../packages/app/src/messages/pt-PT/onboarding.json' with { type: 'json' };
import ptAccumulate from '../../../packages/content/i18n/pt-PT/templates/accumulate.json' with { type: 'json' };
import ptBtcOnly from '../../../packages/content/i18n/pt-PT/templates/btc-only-hold.json' with { type: 'json' };
import ptCycle from '../../../packages/content/i18n/pt-PT/templates/cycle-plan.json' with { type: 'json' };
import ptTwoCoins from '../../../packages/content/i18n/pt-PT/templates/two-coins.json' with { type: 'json' };
import { test } from './support';

// The template step in the UI language (ADR-0057): a pt-PT boot lists the four templates under their pt-PT names,
// sorted by those names, once their overlays load (from assets/messages/pt-PT/, outside the precache), and with
// those chunks unreachable it lists the English names, and choosing one still completes onboarding (#285).

/** `LANGUAGE_STORAGE_KEY` of `packages/app/src/lib/i18n/language.ts`, whose index Node cannot import (JSON). */
const LANGUAGE_STORAGE_KEY = 'poc.language';
const PORTUGUESE = [ptAccumulate, ptBtcOnly, ptCycle, ptTwoCoins].map(({ name }) => name);
const ENGLISH = TEMPLATES.map(({ name }) => name);
/** The four overlays' chunks: Vite names each after its file (packages/config/vite/host-config.ts). */
const TEMPLATE_CHUNK = /\/assets\/messages\/pt-PT\/(?:accumulate|btc-only-hold|cycle-plan|two-coins)-[^/]+\.js$/;

async function openInPortuguese(page: Page) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: LANGUAGE_STORAGE_KEY,
    value: 'pt-PT',
  });
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+01:00'));
  await page.goto('/onboarding');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
  await page.getByRole('button', { name: 'Continuar com Portugal' }).click();
  await expect(page.getByRole('heading', { level: 2, name: ptOnboarding.template.heading })).toBeVisible();
}

/** The template cards' titles in the order shown, without the own-coins card, the last. */
const cardNames = async (page: Page) =>
  (await page.locator('[data-slot="radio-card"] [id$="-title"]').allTextContents()).slice(0, -1);

test('a pt-PT boot lists the templates under their pt-PT names, sorted by them', async ({ page }) => {
  const loaded: string[] = [];
  page.on('response', (response) => {
    if (TEMPLATE_CHUNK.test(new URL(response.url()).pathname)) loaded.push(response.url());
  });
  await openInPortuguese(page);
  await expect.poll(() => cardNames(page)).toEqual([...PORTUGUESE].sort(new Intl.Collator('pt-PT').compare));
  expect(loaded).toHaveLength(4);
  for (const name of ENGLISH) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test.describe('when the template chunks cannot load (offline before they were ever fetched)', () => {
  // The worker's fetches pass Playwright's routes by; blocked, the page's own requests meet the abort.
  test.use({ serviceWorkers: 'block' });

  test('English names show, and choosing one completes onboarding', async ({ page }) => {
    const aborted: string[] = [];
    await page.route('**/assets/messages/pt-PT/**', (route) => {
      if (!TEMPLATE_CHUNK.test(new URL(route.request().url()).pathname)) return route.fallback();
      aborted.push(route.request().url());
      return route.abort();
    });
    await openInPortuguese(page);
    await expect.poll(() => cardNames(page)).toEqual([...ENGLISH].sort(new Intl.Collator('pt-PT').compare));
    expect(aborted.length).toBeGreaterThan(0);
    const twoCoins = TEMPLATES.find(({ id }) => id === 'two-coins')?.name ?? 'two-coins';
    await page.getByRole('radio', { name: twoCoins }).click();
    const next = page.getByRole('button', { name: ptOnboarding.next, exact: true });
    await next.click();
    await page.getByLabel(/^Montante mensal/).fill('100');
    await page.getByLabel(/^Última compra/).fill('2036-10-01');
    await next.click();
    await next.click();
    await page.getByRole('button', { name: ptOnboarding.reminder.later }).click();
    await page.getByRole('button', { name: ptOnboarding.start }).click();
    await expect(page).toHaveURL(/\/today$/);
  });
});
