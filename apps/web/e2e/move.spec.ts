import { expect, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import log from '../../../packages/app/src/features/log/messages/en.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// Log coins you moved on the viewport matrix (docs/DOMAIN.md §3.9 and §6, docs/CONTENT-STYLE.md §3): the fixture's
// Portuguese plan, whose BTC buys have no venue, with an extra buy of 0.08 BTC at Kraken. A move of 0.05 BTC from
// Kraken to Ledger with 0.0498 received gets its own row with the route and the network fee, its units sent in the
// Amount cell, and Portfolio's BTC units drop by the fee, 0.0002. The same move again shows the duplicate line, and
// a move above the units held is refused. A delete is undone within the toast's 8 seconds. A second move from Kraken
// dated before the first saves, and Portfolio then names no sale without a purchase. One of 0.08 BTC dated before the
// first names it before Save (it then finds only the 0.02215 BTC with no venue outside Ledger), saves, and the first
// move's row says so (DOMAIN §3.7).
// The button is reached from "Add coins you already have" with bounded Tab presses, as WebKit's Tab order differs.
// The form's words come from the Log's messages: the destination's hint and "Fill in all units" (#87).

/** The fixture with an extra buy of 0.08 BTC for €4,000 at Kraken on 18 Jun 2026. */
function withKraken(): Snapshot {
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
  return { ...snapshot, entries: [...snapshot.entries, kraken] };
}

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

/** Portfolio's BTC units, from the open BTC row of the holdings. */
async function btcUnits(page: Page, units: RegExp) {
  await page.goto('/portfolio');
  await ready(page);
  const holdings = page.getByRole('table', { name: 'Holdings' });
  await holdings.getByRole('button', { name: 'BTC' }).click();
  await expect(holdings.getByText(units)).toBeVisible();
}

/** Fills the move form in `sheet`: BTC on `date`, from Kraken to Ledger, `sent` units with `received` arriving. */
async function fillMove(sheet: ReturnType<Page['getByRole']>, date: string, sent: string, received: string) {
  await sheet.getByRole('radio', { name: /^BTC/u }).check();
  await sheet.getByLabel(log.move.date).fill(date);
  await sheet.getByRole('radio', { name: /^Kraken/u }).check();
  await sheet.getByLabel(log.move.to).fill('Ledger');
  await sheet.getByLabel(log.move.sent).fill(sent);
  await sheet.getByLabel(log.move.received).fill(received);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test(`on ${FIXTURE_DATES.buy} a move from Kraken to Ledger gets its own row, and Portfolio's units drop by its fee`, async ({
      page,
    }) => {
      const nowMs = fixtureNowMs('buy');
      await page.clock.setFixedTime(new Date(nowMs));
      await routeFixturePrices(page, nowMs);
      await seedPlan(page, withKraken());
      // 0.02215 BTC with no venue and 0.08 BTC at Kraken.
      await btcUnits(page, /^0[.,]10215000\sBTC$/u);

      await page.goto('/log');
      await ready(page);
      const sheet = page.getByRole('dialog');
      const toast = page.locator('[data-slot="toast"]:not([hidden])');
      const button = page.getByRole('button', { name: log.recordMoved });
      await page.getByRole('button', { name: log.recordHeld }).focus();
      for (let presses = 0; presses < 3; presses += 1) {
        if (await button.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(button).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(sheet).toContainText(log.move.title.new);
      await expect(sheet.getByText(log.move.toHint)).toBeVisible();
      // "Fill in all units" types what the chosen source holds on the day; the move then sends part of it.
      await sheet.getByRole('radio', { name: /^BTC/u }).check();
      await sheet.getByLabel(log.move.date).fill('2026-10-14');
      await sheet.getByRole('radio', { name: /^Kraken/u }).check();
      await sheet.getByRole('button', { name: log.move.all }).click();
      await expect(sheet.getByLabel(log.move.sent)).toHaveValue(/^0[.,]08$/u);
      await fillMove(sheet, '2026-10-14', '0,05', '0,0498');
      await expect(sheet.getByText(/^Network fee 0[.,]0002\sBTC$/u)).toBeVisible();
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText(/Recorded: 0[.,]05\sBTC moved from Kraken to Ledger on 14\sOct\s2026\./u);
      await expect(button).toBeFocused();

      // The newest row is the move: its units sent in the Amount cell, its route and fee in its detail.
      const rows = page.locator('tbody [data-slot="table-row"]');
      const move = rows.filter({ hasText: 'Coins moved' });
      await expect(move).toHaveCount(1);
      const amount = move.locator('td').last();
      await expect(amount).toHaveText(/^0[.,]050*\sBTC$/u);
      await move.getByRole('button', { expanded: false }).click();
      await expect(
        page.getByText(`${await amount.textContent()} moved from Kraken to Ledger`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/^Network fee 0[.,]0002\d*\sBTC$/u)).toBeVisible();
      await btcUnits(page, /^0[.,]10195000\sBTC$/u);

      // The same move again shows the duplicate line; one above the units held is refused and saves nothing.
      await page.goto('/log');
      await ready(page);
      await button.click();
      await fillMove(sheet, '2026-10-14', '0,05', '0,0498');
      await expect(sheet.getByText(/^The Log already has this move on 14\sOct\s2026\./u)).toBeVisible();
      await sheet.getByLabel(log.move.sent).fill('1');
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet.getByText(/^This move sends 1[.,]?0*\sBTC, more than you hold/u)).toBeVisible();
      await sheet.getByRole('button', { name: log.form.close }).click();
      await expect(sheet).toBeHidden();
      await expect(rows.filter({ hasText: 'Coins moved' })).toHaveCount(1);
    });

    test(`on ${FIXTURE_DATES.buy} a deleted move comes back by Undo, and an earlier move from Kraken leaves no sale unmatched`, async ({
      page,
    }) => {
      const nowMs = fixtureNowMs('buy');
      await page.clock.setFixedTime(new Date(nowMs));
      await routeFixturePrices(page, nowMs);
      await seedPlan(page, withKraken());
      await page.goto('/log');
      await ready(page);
      const sheet = page.getByRole('dialog');
      const toast = page.locator('[data-slot="toast"]:not([hidden])');
      const button = page.getByRole('button', { name: log.recordMoved });
      const moves = page.locator('tbody [data-slot="table-row"]').filter({ hasText: 'Coins moved' });

      await button.click();
      await fillMove(sheet, '2026-10-14', '0,05', '0,0498');
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet).toBeHidden();
      await expect(moves).toHaveCount(1);

      // A delete, then Undo within the toast's 8 seconds.
      await moves.getByRole('button', { expanded: false }).click();
      await page.getByRole('button', { name: log.row.delete }).click();
      await expect(toast.filter({ hasText: 'Entry deleted.' })).toBeVisible();
      await expect(moves).toHaveCount(0);
      await toast.getByRole('button', { name: log.row.undo }).click();
      await expect(moves).toHaveCount(1);

      // A second move from Kraken to Ledger, dated before the first.
      await button.click();
      await fillMove(sheet, '2026-09-01', '0,02', '0,02');
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText(/Recorded: 0[.,]02\sBTC moved from Kraken to Ledger on 1\sSept?\s2026\./u);
      await expect(moves).toHaveCount(2);

      await btcUnits(page, /^0[.,]10195000\sBTC$/u);
      await expect(page.getByText(/sold without a purchase/u)).toHaveCount(0);
    });

    test(`on ${FIXTURE_DATES.buy} an earlier move that takes all of Kraken's BTC names the later move it leaves short`, async ({
      page,
    }) => {
      const nowMs = fixtureNowMs('buy');
      await page.clock.setFixedTime(new Date(nowMs));
      await routeFixturePrices(page, nowMs);
      await seedPlan(page, withKraken());
      await page.goto('/log');
      await ready(page);
      const sheet = page.getByRole('dialog');
      const button = page.getByRole('button', { name: log.recordMoved });
      const moves = page.locator('tbody [data-slot="table-row"]').filter({ hasText: 'Coins moved' });

      await button.click();
      await fillMove(sheet, '2026-10-14', '0,05', '0,0498');
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet).toBeHidden();

      // The line shows before Save and never blocks it.
      await button.click();
      await fillMove(sheet, '2026-09-01', '0,08', '0,08');
      await expect(
        sheet.getByText(/^After this move, your move to Ledger on 14\sOct\s2026 sends 0[.,]02785\sBTC more/u),
      ).toBeVisible();
      await sheet.getByRole('button', { name: log.move.save }).click();
      await expect(sheet).toBeHidden();
      await expect(moves).toHaveCount(2);

      for (const _ of [1, 2]) await moves.getByRole('button', { expanded: false }).first().click();
      await expect(
        page.getByText(/^The Log shows 0[.,]02215\sBTC outside Ledger on this day, 0[.,]02785\sBTC fewer/u),
      ).toBeVisible();
      await btcUnits(page, /^0[.,]10195000\sBTC$/u);
      await expect(page.getByText(/sold without a purchase/u)).toHaveCount(0);
    });
  });
}
