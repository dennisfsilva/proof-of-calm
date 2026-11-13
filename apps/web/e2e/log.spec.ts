import { expect } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The Log on the viewport matrix (docs/DOMAIN.md §3.9 and §6): the fixture plan with five more buys,
// 13 transactions and July's skip, seen on the fixture's buying-phase date. The last 12 transactions
// show with the skip among them, then all of them; a row opens to its detail; a deletion leaves the toast, whose Undo brings the row back.
// Every flow runs in light and dark, at 125 % text on the zoom-125 project (support.ts).
// Record a purchase logs October's open monthly buy and gives the focus back; Edit entry changes it,
// and its button stays clear of the toast that follows. Its "Skip October
// 2026" swaps the sheet for the skip sheet, which holds the focus, and the skip's Undo puts it on the heading.
// What was typed in the form survives a reload for the session (ADR-0020's draft) and saves as typed.
// Its "Sale" choice records a sale with the holding warning, which does not block the save; the sale's Edit entry
// changes it and Delete entry removes it.
// Its "Extra buy" choice dated before the first buy day saves; the Plan's totals leave it out and say so in the line
// under them, while Portfolio's Invested counts it (docs/DOMAIN.md §3.10).
// Add coins you already have saves units with no cost dated before the first buy day: the Plan's totals and Today
// stay as they were, and the row says the cost is unknown.
// A plan with only July's skip shows the empty line with the skipped month under it.

/** The fixture with five more buys, so the Log has more than 12 transactions. */
function withMoreBuys(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const more = ['2026-04-20', '2026-05-25', '2026-07-20', '2026-08-20', '2026-10-12'].map(
    (date, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}` as Entry['id'],
      kind: 'extra',
      date: date as CalendarDate,
      amount: '50' as Entry['amount'],
      units: '0.0008' as Entry['units'],
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
}

/** Whether the element at the centre of `element`'s box is `element` or inside it, so nothing lies over it. */
function atOwnCentre(element: Element): boolean {
  const box = element.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return hit !== null && element.contains(hit);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test(`on ${FIXTURE_DATES.buy} the Log shows 12 transactions, then all 13; a row opens, and Undo restores a deletion`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, withMoreBuys());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      const rows = page.locator('tbody [data-slot="table-row"]');
      await expect(rows).toHaveCount(13);

      await page.getByRole('button', { name: 'Show all 13 entries' }).click();
      await expect(rows).toHaveCount(14);
      await expect(page.getByRole('button', { name: /^Show all/ })).toHaveCount(0);
      // The choice is the device preference: the Log opens with all rows after a reload.
      await page.reload();
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      await expect(rows).toHaveCount(14);

      const newest = page.getByRole('button', { name: /Extra buy/ }).first();
      await newest.click();
      await expect(newest).toHaveAttribute('aria-expanded', 'true');
      const remove = page.getByRole('button', { name: 'Delete entry' });
      await expect(remove).toBeVisible();
      await expect(page.getByText('Computed from your dates, not tax advice')).toBeVisible();

      await remove.click();
      await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('Entry deleted.');
      await expect(rows).toHaveCount(13);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(rows).toHaveCount(14);
    });

    test(`Portugal's counterparty sentence sits beside the first date`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, withMoreBuys());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

      await page
        .getByRole('button', { name: /Extra buy/ })
        .first()
        .click();
      await expect(page.getByText(/the counterparty is tax-resident/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show 3 more conditions' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sources' })).toBeVisible();
    });

    test(`on ${FIXTURE_DATES.buy} Record a purchase logs October's open monthly buy, and Edit entry changes it`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, fixtureSnapshot());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      const rows = page.locator('tbody [data-slot="table-row"]');
      await expect(rows.first()).toBeVisible();
      const before = await rows.count();
      const toast = page.locator('[data-slot="toast"]:not([hidden])');
      const sheet = page.getByRole('dialog');

      const record = page.getByRole('button', { name: 'Record a purchase' });
      await record.click();
      await expect(sheet).toContainText('Log the monthly buy');
      // A point reads as the decimal point in either locale (ADR-0034); the amounts come from the plan.
      await sheet.getByLabel('BTC received (units)').fill('0.0012');
      await sheet.getByLabel('ETH received (units)').fill('0.012');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText('Recorded:');
      await expect(rows).toHaveCount(before + 1);
      await expect(record).toBeFocused();

      const october = page.getByRole('button', { name: /Monthly buy/ }).first();
      await october.click();
      await page.getByRole('button', { name: 'Edit entry' }).click();
      await expect(sheet).toContainText('Edit the entry');
      await sheet.getByLabel('BTC cost before fees (EUR)').fill('80');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText('Entry saved.');
      await expect(rows).toHaveCount(before + 1);
      await expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toContainText('110');
      // Focus is back on Edit entry and the toast does not cover it: the element at its centre is the button
      // (docs/DESIGN.md §7, the toast's inset), which needs the page scrolled clear while the toast shows.
      const edit = page.getByRole('button', { name: 'Edit entry' });
      await expect(edit).toBeFocused();
      await expect(toast).toBeVisible();
      await expect.poll(() => edit.evaluate(atOwnCentre)).toBe(true);
    });

    // Session 12's evaluator (#114): the focus stayed on Record a purchase behind the skip sheet, and Tab reached the rows.
    test(`on ${FIXTURE_DATES.buy} Skip October 2026 from Record a purchase holds the focus, and Undo puts it on the heading`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, fixtureSnapshot());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      await page.getByRole('button', { name: 'Record a purchase' }).click();
      await expect(page.getByRole('dialog')).toContainText('Log the monthly buy');
      await page.getByRole('dialog').getByRole('button', { name: 'Skip October 2026' }).click();

      const sheet = page.getByRole('dialog', { name: 'Skip October 2026' });
      await expect(sheet).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      const inside = () => sheet.evaluate((element) => element.contains(document.activeElement));
      await expect.poll(inside).toBe(true);
      // The note, the button and the close button, and round again: Tab never leaves the sheet. At the wrap the focus
      // lands on Base UI's focus guard, which moves it back in on the next animation frame, so each step polls.
      for (let step = 0; step < 4; step += 1) {
        await page.keyboard.press('Tab');
        await expect.poll(inside).toBe(true);
      }

      await sheet.getByRole('button', { name: 'Skip October 2026' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('October 2026 skipped.');
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByRole('heading', { name: 'Log', level: 1 })).toBeFocused();
    });

    test(`on ${FIXTURE_DATES.buy} a reload mid-entry keeps what was typed in Record a purchase, and it saves`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, fixtureSnapshot());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      const sheet = page.getByRole('dialog');
      const record = page.getByRole('button', { name: 'Record a purchase' });
      const [btc, eth] = [sheet.getByLabel('BTC received (units)'), sheet.getByLabel('ETH received (units)')];
      // Both mounts wait for Portugal's rules: a draft typed in another number locale is dropped (ADR-0020), and the
      // blur that leaving BTC for ETH makes writes 0.0012 back in pt-PT (ADR-0034), so each field is compared as shown.
      const portugal = () => expect(page.getByRole('row', { name: /Monthly buy/ }).first()).toContainText(/100,00/u);

      await portugal();
      await record.click();
      await expect(sheet.getByLabel('BTC cost before fees (EUR)')).toHaveValue('70,00');
      await btc.fill('0.0012');
      await eth.fill('0.012');
      const shown = [await btc.inputValue(), await eth.inputValue()];
      await page.reload();
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      await portugal();
      await record.click();
      await expect(sheet.getByLabel('BTC cost before fees (EUR)')).toHaveValue('70,00');
      await expect(btc).toHaveValue(shown[0] ?? '');
      await expect(eth).toHaveValue(shown[1] ?? '');

      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('Recorded:');
    });

    test(`on ${FIXTURE_DATES.buy} Record a purchase's Sale records a sale despite its holding warning; Edit and Delete change it`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, fixtureSnapshot());
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      const rows = page.locator('tbody [data-slot="table-row"]');
      await expect(rows.first()).toBeVisible();
      const before = await rows.count();
      const toast = page.locator('[data-slot="toast"]:not([hidden])');
      const sheet = page.getByRole('dialog');

      await page.getByRole('button', { name: 'Record a purchase' }).click();
      await expect(sheet).toContainText('Log the monthly buy');
      await sheet.getByRole('button', { name: 'Sale' }).click();
      await expect(sheet).toContainText('Log a sale');
      await expect(sheet.getByLabel('BTC cost before fees (EUR)')).toHaveCount(0);
      // Every BTC in the fixture was bought within the last 365 days, so none of the sale is past the holding rule.
      await sheet.getByLabel('BTC sold (units)').fill('0.001');
      await sheet.getByLabel('BTC sold for, before fees (EUR)').fill('60');
      await expect(sheet.getByRole('status')).toContainText(
        'None of the 0,001 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.',
      );
      await expect(sheet).toContainText('Computed from your dates, not tax advice');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText('Recorded: sold');
      await expect(rows).toHaveCount(before + 1);

      const sale = page.getByRole('button', { name: /Sale/ }).first();
      await sale.click();
      await page.getByRole('button', { name: 'Edit entry' }).click();
      await expect(sheet).toContainText('Edit the entry');
      await expect(sheet.getByRole('group', { name: 'Type of transaction' })).toHaveCount(0);
      await sheet.getByLabel('BTC sold (units)').fill('0.002');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).toBeHidden();
      await expect(toast).toContainText('Entry saved.');
      await expect(rows).toHaveCount(before + 1);

      await page.getByRole('button', { name: 'Delete entry' }).click();
      await expect(toast).toContainText('Entry deleted.');
      await expect(rows).toHaveCount(before);
    });

    test.describe('with fixture prices', () => {
      // The service worker's own requests pass the page's routes by (support.ts), so it stays out.
      test.use({ serviceWorkers: 'block' });

      test(`on ${FIXTURE_DATES.buy} Record a purchase's Extra buy dated before the first buy day saves; the Plan's totals line stays, with a line under it`, async ({
        page,
      }) => {
        const nowMs = fixtureNowMs('buy');
        await page.clock.setFixedTime(new Date(nowMs));
        await routeFixturePrices(page, nowMs);
        // The fixture's first buy day is 5 Apr 2026 and October's monthly buy is open.
        await seedPlan(page, fixtureSnapshot());
        const ready = () => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
        const totalsLine = page.getByText(/ invested so far /u);
        const earlyLine = page.getByText(
          /^1 extra buy dated before the first buy day, 5\sApr\s2026, is not in the amount invested above\. Portfolio's Invested counts it\.$/u,
        );
        const invested = page
          .locator('dt')
          .filter({ hasText: /^Invested$/u })
          .first()
          .locator('xpath=following-sibling::dd[1]');
        /** The figure in cents: its digits, whatever the locale's grouping and decimal marks. */
        const cents = async () => Number((await invested.textContent())?.replace(/\D/gu, ''));

        await page.goto('/plan');
        await ready();
        await expect(totalsLine).toBeVisible();
        const totals = (await totalsLine.textContent()) ?? '';
        await expect(earlyLine).toHaveCount(0);
        await page.goto('/portfolio');
        await ready();
        await expect(invested).toHaveText(/\d/u);
        const investedBefore = await cents();

        await page.goto('/log');
        await ready();
        const sheet = page.getByRole('dialog');
        await page.getByRole('button', { name: 'Record a purchase' }).click();
        await expect(sheet).toContainText('Log the monthly buy');
        await sheet.getByRole('button', { name: 'Extra buy' }).click();
        await expect(sheet).toContainText('Log an extra buy');
        await sheet.getByLabel('Date').fill('2026-03-15');
        // The price the form filled as it opened does not apply to an earlier date: the field empties and a line says so.
        await expect(sheet.getByLabel('BTC price (EUR)')).toHaveValue('');
        await expect(
          sheet.getByRole('status').filter({
            hasText:
              /^The price the form filled in does not apply to an earlier date\. Type the cost before fees and the units received, as your exchange's confirmation shows them\.$/u,
          }),
        ).toBeVisible();
        await sheet.getByLabel('BTC cost before fees (EUR)').fill('100');
        await sheet.getByLabel('BTC received (units)').fill('0.002');
        await sheet.getByRole('button', { name: 'Save' }).click();
        await expect(sheet).toBeHidden();
        await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText('Recorded:');

        await page.goto('/plan');
        await ready();
        await expect(totalsLine).toHaveText(totals);
        await expect(earlyLine).toBeVisible();
        await page.goto('/portfolio');
        await ready();
        await expect.poll(cents).toBe(investedBefore + 10_000);
      });

      // Coins already held, dated before the first buy day with no cost (CONTENT-STYLE §3, Record on the Log): the
      // Plan's totals do not move, Today still asks for October, and the row says the cost is unknown, never €0.
      test(`on ${FIXTURE_DATES.buy} Add coins you already have saves units with no cost; the Plan and Today stay as they were`, async ({
        page,
      }) => {
        const nowMs = fixtureNowMs('buy');
        await page.clock.setFixedTime(new Date(nowMs));
        await routeFixturePrices(page, nowMs);
        await seedPlan(page, fixtureSnapshot());
        const ready = () => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
        const totalsLine = page.getByText(/ invested so far /u);

        await page.goto('/plan');
        await ready();
        await expect(totalsLine).toBeVisible();
        const totals = (await totalsLine.textContent()) ?? '';

        await page.goto('/log');
        await ready();
        const sheet = page.getByRole('dialog');
        const button = page.getByRole('button', { name: 'Add coins you already have' });
        // From Record a purchase the next stop is this button: bounded presses, as WebKit's Tab order differs.
        await page.getByRole('button', { name: 'Record a purchase' }).focus();
        for (let presses = 0; presses < 3; presses += 1) {
          if (await button.evaluate((element) => element === document.activeElement)) break;
          await page.keyboard.press('Tab');
        }
        await expect(button).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(sheet).toContainText('Log coins you already have');
        await expect(sheet.getByRole('button', { name: 'Sale' })).toHaveCount(0);
        await expect(sheet.getByLabel(/^Fee/u)).toHaveCount(0);
        await sheet.getByLabel('Date').fill('2026-03-15');
        await sheet.getByLabel('BTC received (units)').fill('0.01');
        await expect(sheet.getByLabel('BTC cost (EUR, if known)')).toHaveValue('');
        await sheet.getByRole('button', { name: 'Save' }).click();
        await expect(sheet).toBeHidden();
        await expect(page.locator('[data-slot="toast"]:not([hidden])')).toContainText(
          /Recorded: 0[.,]01\sBTC added on /u,
        );
        await expect(button).toBeFocused();
        await expect(page.locator('tbody').getByText('Cost unknown')).toBeVisible();

        await page.goto('/plan');
        await ready();
        await expect(totalsLine).toHaveText(totals);
        await page.goto('/today');
        await ready();
        await expect(page.getByRole('button', { name: 'Bought as planned' })).toBeVisible();
      });
    });

    test(`on ${FIXTURE_DATES.buy} a plan with a skip and no entries says so, with the skipped month under the line`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
      await seedPlan(page, { ...fixtureSnapshot(), entries: [] });
      await page.goto('/log');
      await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.getByText(/^No entries yet\. Your first buy day was /)).toBeVisible();
      await expect(page.locator('tbody [data-slot="table-row"]')).toHaveCount(1);
      await expect(page.getByRole('columnheader', { name: 'July 2026' })).toBeVisible();
      await expect(page.getByText('Skipped')).toBeVisible();
    });
  });
}
