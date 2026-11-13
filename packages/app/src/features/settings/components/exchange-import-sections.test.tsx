// @vitest-environment jsdom
import {
  type EntityId,
  type Entry,
  type ExchangeImportPlan,
  type Instant,
  type Plan,
  planExchangeImport,
  readExchangeFile,
} from '@proofofcalm/core';
import { anEntry, date, instant, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import {
  KRAKEN_LEFT_OUT,
  KRAKEN_OCTOBER,
  krakenLedger,
  ONE_TAP_OCTOBER,
} from '../../../lib/services/kraken.testing';
import { createTestServices } from '../../../lib/services/testing';
import settings from '../../../messages/en/settings.json';
import { exchangeContext } from '../model/import';
import { previewModel } from '../model/exchange-preview';
import { ExchangeSections, ExchangeSummary } from './exchange-import-sections';

// The exchange import's preview, worded (CONTENT-STYLE §3 "Import an exchange's file"): the summary, then one
// collapsed section per kind of entry with one sentence each, the rows left out with their reasons, and the counted
// lines, from plans that planExchangeImport makes of synthetic Kraken ledgers (ADR-0056).

afterEach(cleanup);

const CONTEXT = exchangeContext(date('2026-10-20'), '2026-10-20T10:00:00.000Z' as Instant, 'Europe/Lisbon');
const fixture = fixtureSnapshot();
const PLAN = fixture.plan as Plan;
const planOf = (csv: string, entries: readonly Entry[], plan = PLAN) => {
  const read = readExchangeFile(csv);
  if (!read.ok) throw new Error('the synthetic ledger reads');
  return planExchangeImport(read.value, { plan, entries }, { venue: 'Kraken', addHeld: false }, CONTEXT);
};
const BTC = 'BTC' as Entry['coin'];

async function mount(shown: ExchangeImportPlan, plan = PLAN) {
  const services = createTestServices({ snapshot: { ...fixture, plan } });
  await act(() => services.start());
  const model = previewModel(shown);
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings }}>
        <ExchangeSummary model={model} plan={plan} />
        <ExchangeSections model={model} plan={plan} />
      </I18nProvider>
    </ServicesProvider>,
  );
}

/** The text a person reads, with the formatters' no-break spaces as plain ones. */
const plain = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');
const texts = () => [...document.querySelectorAll('p')].map((line) => plain(line.textContent));
const sections = () => screen.queryAllByRole('button').map((button) => plain(button.textContent));
/** Opens the section named `heading` and reads its sentences. */
const lines = (heading: string) => {
  fireEvent.click(screen.getByRole('button', { name: heading }));
  const items = screen.getByRole('list', { name: heading });
  return [...items.querySelectorAll('li')].map((item) => plain(item.textContent));
};

describe('ExchangeSummary and ExchangeSections', () => {
  it('sum the kinds up and word each section, one sentence per entry, collapsed until opened', async () => {
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, ONE_TAP_OCTOBER]));
    expect(texts()).toEqual([
      'Adds 5 entries: 1 monthly buy, 2 extra buys, 1 sale, and 1 Coins added entry at no cost.',
      'Replaces 1 estimate from Bought as planned.',
    ]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(sections()).toEqual([
      'Estimates it replaces (1)',
      'Extra buys (2)',
      'Sales (1)',
      'Coins added at no cost (1)',
    ]);
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00, becomes 0.00120 BTC at Kraken ' +
        'for €70.00, fee €0.18, on 5 Oct 2026.',
    ]);
    expect(texts()).toContain(
      "To keep an estimate instead, type its units from your exchange's confirmation in the Log, then choose the " +
        'file again.',
    );
    expect(lines('Extra buys (2)')).toEqual([
      'Extra buy: 0.012 ETH for €30.00, fee €0.08, on 5 Oct 2026.',
      'Extra buy: 0.0008 BTC for €50.00, fee €0.13, on 12 Oct 2026.',
    ]);
    expect(lines('Sales (1)')).toEqual(['Sale: 0.01 ETH for €25.00, fee €0.07, on 15 Oct 2026.']);
    expect(lines('Coins added at no cost (1)')).toEqual(['Coins added: 0.00005 BTC at no cost, on 16 Oct 2026.']);
  });

  it('count the estimates replaced, not the months, with one sentence for each estimate', async () => {
    const second = { ...ONE_TAP_OCTOBER, id: 'aaaaaaaa-0000-4000-8000-000000000011' as EntityId, units: units('0.0011') };
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, ONE_TAP_OCTOBER, second]));
    expect(texts()).toContain('Replaces 2 estimates from Bought as planned.');
    expect(lines('Estimates it replaces (2)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00, becomes 0.00120 BTC at Kraken ' +
        'for €70.00, fee €0.18, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.0011 BTC (estimated) at Bitvavo for €70.00, becomes 0.0012 BTC at Kraken ' +
        'for €70.00, fee €0.18, on 5 Oct 2026.',
    ]);
  });

  it('word the months a file fills, with no estimate to replace', async () => {
    await mount(planOf(KRAKEN_OCTOBER, fixture.entries));
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    expect(lines('Monthly buys (2)')).toEqual([
      'Monthly buy for October 2026: 0.0012 BTC for €70.00, fee €0.18, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.012 ETH for €30.00, fee €0.08, on 5 Oct 2026.',
    ]);
  });

  it('word the purchases the Log records already, and how to import one instead', async () => {
    const typed = anEntry({
      id: 'aaaaaaaa-0000-4000-8000-000000000030' as EntityId,
      kind: 'dca',
      coin: BTC,
      date: date('2026-10-06'),
      slot: '2026-10' as Entry['slot'],
      amount: '70' as Entry['amount'],
      units: units('0.00121'),
      venue: 'Bitvavo',
      source: 'manual',
    });
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, typed]));
    expect(lines('Looks recorded already, not added (1)')).toEqual([
      '5 Oct 2026, 0.00120 BTC for €70.00, looks like your monthly buy for October 2026: 0.00121 BTC at Bitvavo for ' +
        '€70.00.',
    ]);
    expect(texts()).toContain(
      'To import one of these instead, delete the entry it matches in the Log, then choose the file again.',
    );
  });

  it('in the hold phase, words the purchases as extra buys', async () => {
    const hold = { ...PLAN, lastBuy: date('2026-09-05') };
    await mount(planOf(KRAKEN_OCTOBER, fixture.entries, hold), hold);
    expect(texts()[0]).toBe('Adds 5 entries: 3 extra buys, 1 sale, and 1 Coins added entry at no cost.');
    expect(sections()).toEqual(['Extra buys (3)', 'Sales (1)', 'Coins added at no cost (1)']);
  });

  it('over an empty Log, names each row left out with its reason, and nothing to add', async () => {
    await mount(planOf(KRAKEN_LEFT_OUT, []));
    expect(texts()).toEqual(['Nothing to add from this file.']);
    expect(sections()).toEqual(['Left out (11)']);
    expect(lines('Left out (11)')).toEqual([
      '1 purchase or sale in USD, not imported: amounts are never converted.',
      'This plan does not list XRP, so its 1 transaction was left out. To import it, add XRP in Coins & split, then ' +
        'choose the file again.',
      '1 purchase dated within 15 days of the first buy day, 5 Apr 2026: the file cannot tell the starting amount ' +
        'from the first monthly buy. Record it in the Log.',
      'Rewards paid in coins, not imported: 0.0001 ETH.',
      'Coins sent to Kraken from elsewhere, not imported: 0.01 BTC. Record a gift with Add coins you already have, ' +
        'and your own coins coming back with Log coins you moved.',
      'Coins sent out of Kraken with no matching move in the Log: 0.00502 BTC. Record each with Log coins you moved.',
      '1 exchange of one coin for another, not imported: the file gives no amount in EUR for it.',
      '1 row of money with no coin, such as a deposit or withdrawal, not imported.',
      '1 row within Kraken, such as a move between its wallets: it changes no entry.',
      'Lines 15, 16, and 17 could not be read or paired, so they were left out.',
      '1 row of another type, not imported.',
    ]);
  });

  it('names a withdrawal the Log has as a move, and cuts a long list of lines short', async () => {
    const move = anEntry({
      id: 'aaaaaaaa-0000-4000-8000-000000000040' as EntityId,
      kind: 'move',
      coin: BTC,
      date: date('2026-10-07'),
      amount: null,
      units: units('0.00502'),
      slot: null,
      venue: 'Kraken',
      to: 'Ledger',
      received: units('0.005'),
      source: 'manual',
    });
    const triple = (refid: string): [string, string, string, string, string, string][] =>
      ['EUR', 'BTC', 'ETH'].map((asset) => [refid, '2026-10-12 09:00:00', 'trade', asset, '1.0000', '0.0000']);
    const withdrawal = KRAKEN_LEFT_OUT.split('\n').find((line) => line.includes('withdrawal')) as string;
    const csv = `${krakenLedger([...triple('T1'), ...triple('T2'), ...triple('T3')])}\n${withdrawal}`;
    await mount(planOf(csv, [move]));
    expect(lines('Left out (2)')).toEqual([
      'Coins sent out of Kraken that match a move in the Log: 0.00502 BTC.',
      'Lines 2, 3, 4, 5, 6, and 4 more could not be read or paired, so they were left out.',
    ]);
  });

  it('with every section empty, says there is nothing to add and counts the rows imported or deleted earlier', async () => {
    const first = planOf(KRAKEN_OCTOBER, fixture.entries);
    const [one, ...rest] = first.entries as [Entry, ...Entry[]];
    const deleted = { ...one, deletedAt: instant('2026-10-20T11:00:00Z') };
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, deleted, ...rest]));
    expect(texts()).toEqual([
      'Nothing to add from this file.',
      'Imported earlier, not added: 4.',
      'Deleted earlier on this device, not added: 1.',
    ]);
    expect(sections()).toEqual([]);
  });

  it("names the file's currencies when none is the plan's, and still adds the coins received at no cost", async () => {
    const usd = KRAKEN_OCTOBER.replaceAll('"EUR"', '"USD"');
    await mount(planOf(usd, fixture.entries));
    expect(texts().slice(0, 2)).toEqual([
      'Adds 1 entry: 1 Coins added entry at no cost.',
      "No purchase or sale in this file is in EUR, this plan's currency: they are in USD. Amounts are never converted.",
    ]);
    expect(lines('Left out (1)')).toEqual(['4 purchases and sales in USD, not imported: amounts are never converted.']);
  });

  it('counts the units cut and the fees taken in the coin', async () => {
    const csv = krakenLedger([
      ['T1', '2026-10-05 09:00:00', 'trade', 'EUR', '-70.0000', '0.0000'],
      ['T1', '2026-10-05 09:00:00', 'trade', 'BTC', '0.00120000000001', '0.0000010000'],
    ]);
    await mount(planOf(csv, fixture.entries));
    expect(texts()).toEqual([
      'Adds 1 entry: 1 monthly buy.',
      'Units cut to 10 decimal places: 1 entry.',
      "Fees taken in the coin, valued at the trade's own price: 1 entry.",
    ]);
  });
});
