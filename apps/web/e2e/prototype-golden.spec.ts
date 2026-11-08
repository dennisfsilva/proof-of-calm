import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { createFormatters } from '@proofofcalm/app/lib/format';
import { type CurrencyCode, type Decimal, fromFloat } from '@proofofcalm/core';
import { test } from './support';

// The four synthetic exports of the DCA plan page (tools/golden/states.ts), pasted into Settings → Currency &
// data on a device with no plan, then read on Today and Portfolio as the prototype read them
// (docs/DOMAIN.md §3.3, §7). Issue #168 decision 4: the golden comparison runs on the desktop project only,
// since the figures do not depend on the viewport; the paste flow itself runs on the whole matrix. Each
// state is pasted at its own `today`, with /api/prices answered from its `prices`; the expected figures come
// from the fixture files in packages/core/test/golden, read here as data. The owner's own export never
// enters git, so this check covers the synthetic states only.

test.use({ serviceWorkers: 'block' });

type Fixture = {
  readonly name: string;
  readonly today: string;
  readonly prices: Readonly<Record<string, string>>;
  readonly state: { readonly purchases: readonly unknown[] };
  readonly prototype: {
    readonly phase: string;
    readonly actions: readonly { type: string; slot: string; due: string; late: boolean; done: boolean }[];
    readonly portfolio: { readonly invested: number; readonly value: number };
  };
};

const NAMES = ['two-coins', 'cycle-plan', 'sell-window', 'late-in-sell'] as const;
const load = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`../../../packages/core/test/golden/${name}.json`, import.meta.url), 'utf8'));

// The imported plan is Portugal's and pays in the export's EUR, so the app writes amounts in pt-PT.
const format = createFormatters('pt-PT', 'en-GB');
const EUR = 'EUR' as CurrencyCode;
/** The prototype's float at 2 dp as the app writes money: rid of float noise first, at the units' 8 places. */
const money = (amount: number) => format.money(fromFloat<Decimal>(amount, 8), EUR);
/** The whole text, with any run of spaces optional, so a grouping space may differ between browsers. */
const exactly = (text: string) =>
  new RegExp(
    `^${text
      .replace(/\s/g, '')
      .split('')
      .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*')}$`,
  );
/** A month key (`2026-03`) as Today's headings write it in English. */
const month = (slot: string) =>
  new Date(`${slot}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** The month as a pattern with either space between its parts, since the app joins them with U+00A0. */
const monthPattern = (slot: string) =>
  month(slot)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s');

/** No plan on the device, the clock at the state's day, its prices on the route; Settings opens on its data tab. */
async function openAt(page: Page, fixture: Fixture) {
  const nowMs = Date.parse(`${fixture.today}T12:00:00Z`);
  await page.clock.setFixedTime(new Date(nowMs));
  const prices = Object.fromEntries(Object.entries(fixture.prices).map(([coin, price]) => [coin, { EUR: price }]));
  await page.route('**/api/prices?*', (route) =>
    route.fulfill({ json: { at: new Date(nowMs - 30_000).toISOString(), prices } }),
  );
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

async function pasteExport(page: Page, fixture: Fixture) {
  const box = page.getByRole('textbox', { name: 'Paste a backup or an export from the DCA plan page' });
  await box.fill(JSON.stringify(fixture.state));
  await page.getByRole('button', { name: 'Read the pasted text' }).click();
  const count = fixture.state.purchases.length;
  await expect(
    page.getByText(`Pasted text, exported from the DCA plan page. Purchases in this text: ${count}.`),
  ).toBeVisible();
  await expect(box).toHaveValue('');
}

async function importAsPortugal(page: Page, fixture: Fixture) {
  await page.getByRole('button', { name: 'Continue with Portugal' }).click();
  await expect(page.getByText(`Plan imported. Entries now: ${fixture.state.purchases.length}.`)).toBeVisible();
}

test('a pasted export from the DCA plan page asks for the country, with the focus on it, then imports', async ({
  page,
}) => {
  const fixture = load('two-coins');
  await openAt(page, fixture);
  await pasteExport(page, fixture);
  // The country step takes the focus when it appears, which also scrolls it into view (docs/DESIGN.md §6).
  await expect(page.getByText(/^Files from the DCA plan page have no country\./u)).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Where do you live?' })).toBeVisible();
  await importAsPortugal(page, fixture);
});

for (const name of NAMES) {
  test(`golden: the ${name} export leads Today and values Portfolio as the DCA plan page does`, async ({
    page,
  }, testInfo) => {
    // biome-ignore lint/suspicious/noSkippedTests: a runtime skip on the other projects (#168 decision 4), not a disabled test
    test.skip(testInfo.project.name !== 'desktop', 'the golden comparison does not depend on the viewport');
    const fixture = load(name);
    const expected = fixture.prototype;
    await openAt(page, fixture);
    await pasteExport(page, fixture);
    await importAsPortugal(page, fixture);

    // Today's lead, as heroMain picks it: the first action not done before and during the buying phase,
    // the phase itself after it (§3.3).
    await page.goto('/today');
    await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
    const buying = expected.phase === 'before' || expected.phase === 'buy';
    const lead = buying ? expected.actions.find((action) => !action.done) : undefined;
    if (lead !== undefined) {
      if (lead.type !== 'dca' || !lead.late) throw new Error(`${name}: a lead this spec does not word yet`);
      await expect(page.getByRole('heading', { name: `${month(lead.slot)} is still open` })).toBeVisible();
    } else {
      if (expected.phase !== 'sell') throw new Error(`${name}: a phase this spec does not word yet`);
      await expect(page.getByRole('heading', { level: 2, name: 'In the sell window' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /is still open$/u })).toHaveCount(0);
      const open = expected.actions.filter((action) => !action.done);
      const list = page.getByRole('list', { name: 'Also open' });
      if (open.length === 0) await expect(list).toHaveCount(0);
      else
        await expect(list.getByRole('listitem')).toHaveText(
          open.map((action) => new RegExp(`^${monthPattern(action.slot)}: `, 'u')),
        );
    }

    // Portfolio's invested amount and value, at the 2 dp the screen writes.
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
    const figure = (term: string) =>
      page
        .locator('dt')
        .filter({ hasText: new RegExp(`^${term}$`, 'u') })
        .first()
        .locator('xpath=following-sibling::dd[1]');
    await expect(figure('Value')).toHaveText(exactly(money(expected.portfolio.value)));
    await expect(figure('Invested')).toHaveText(exactly(money(expected.portfolio.invested)));
  });
}
