// @vitest-environment jsdom
import {
  type EntityId,
  type Entry,
  type ExchangeId,
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
import { KRAKEN_LEFT_OUT, KRAKEN_OCTOBER, krakenLedger, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { createTestServices } from '../../../lib/services/testing';
import { TRADE_REPUBLIC_OCTOBER } from '../../../lib/services/trade-republic.testing';
import settings from '../../../messages/en/settings.json';
import { previewModel } from '../model/exchange-preview';
import { exchangeContext } from '../model/import';
import { ExchangeSections, ExchangeSummary } from './exchange-import-sections';

// The exchange import's preview, worded (CONTENT-STYLE §3 "Import an exchange's file"): the summary, then one
// collapsed section per kind of entry with one sentence each, the rows left out with their reasons, and the counted
// lines, from plans that planExchangeImport makes of synthetic Kraken ledgers (ADR-0056).

afterEach(cleanup);

const CONTEXT = exchangeContext(date('2026-10-20'), '2026-10-20T10:00:00.000Z' as Instant, 'Europe/Lisbon');
const fixture = fixtureSnapshot();
const PLAN = fixture.plan as Plan;
const planOf = (csv: string, entries: readonly Entry[], plan = PLAN, venue = 'Kraken') => {
  const read = readExchangeFile(csv);
  if (!read.ok) throw new Error('the synthetic ledger reads');
  return planExchangeImport(read.value, { plan, entries }, { venue, addHeld: false }, CONTEXT);
};
const BTC = 'BTC' as Entry['coin'];
/** October's monthly BTC buy typed by hand for €120.00 and 0.002 BTC, dated `on`. */
const typed120 = (on: string) =>
  anEntry({
    id: 'aaaaaaaa-0000-4000-8000-000000000031' as EntityId,
    kind: 'dca',
    coin: BTC,
    date: date(on),
    slot: '2026-10' as Entry['slot'],
    amount: '120' as Entry['amount'],
    units: units('0.002'),
    venue: 'Bitvavo',
    source: 'manual',
  });
/** A Kraken ledger of BTC purchases, each `[refid, time, euros, units, fee]`. */
const btcBuys = (buys: readonly (readonly [string, string, string, string, string])[]) =>
  krakenLedger(
    buys.flatMap(([refid, time, euros, bought, fee]) => [
      [refid, time, 'trade', 'EUR', `-${euros}`, fee] as const,
      [refid, time, 'trade', 'BTC', bought, '0.0000000000'] as const,
    ]),
  );

async function mount(shown: ExchangeImportPlan, plan = PLAN, exchange: ExchangeId = 'kraken') {
  const services = createTestServices({ snapshot: { ...fixture, plan } });
  await act(() => services.start());
  const model = previewModel(shown);
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings }}>
        <ExchangeSummary model={model} plan={plan} />
        <ExchangeSections model={model} plan={plan} exchange={exchange} />
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
      'Adds 5 entries: 3 monthly buys, 1 sale, and 1 Coins added entry at no cost.',
      'Replaces 1 estimate from Bought as planned.',
    ]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(sections()).toEqual([
      'Monthly buys (1)',
      'Estimates it replaces (1)',
      'Sales (1)',
      'Coins added at no cost (1)',
    ]);
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 2 purchases at Kraken, ' +
        '0.00200 BTC for €120.00 in all, fees €0.31, on 5 Oct 2026 and 12 Oct 2026.',
    ]);
    expect(texts()).toContain(
      "To keep an estimate instead, type its units from your exchange's confirmation in the Log, then choose the " +
        'file again.',
    );
    expect(lines('Monthly buys (1)')).toEqual([
      'Monthly buy for October 2026: 0.012 ETH for €30.00, fee €0.08, on 5 Oct 2026.',
    ]);
    expect(lines('Sales (1)')).toEqual(['Sale: 0.01 ETH for €25.00, fee €0.07, on 15 Oct 2026.']);
    expect(lines('Coins added at no cost (1)')).toEqual(['Coins added: 0.00005 BTC at no cost, on 16 Oct 2026.']);
  });

  it('count the estimates replaced, not the months, with one sentence for each estimate', async () => {
    const second = {
      ...ONE_TAP_OCTOBER,
      id: 'aaaaaaaa-0000-4000-8000-000000000011' as EntityId,
      units: units('0.0011'),
    };
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, ONE_TAP_OCTOBER, second]));
    expect(texts()).toContain('Replaces 2 estimates from Bought as planned.');
    expect(lines('Estimates it replaces (2)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 2 purchases at Kraken, ' +
        '0.00200 BTC for €120.00 in all, fees €0.31, on 5 Oct 2026 and 12 Oct 2026.',
      'Monthly buy for October 2026: 0.0011 BTC (estimated) at Bitvavo for €70.00 becomes 2 purchases at Kraken, ' +
        '0.0020 BTC for €120.00 in all, fees €0.31, on 5 Oct 2026 and 12 Oct 2026.',
    ]);
  });

  it('word one purchase that replaces an estimate as the piece it adds', async () => {
    const csv = btcBuys([['T1', '2026-10-05 09:00:00', '70.0000', '0.0012000000', '0.1800']]);
    await mount(planOf(csv, [...fixture.entries, ONE_TAP_OCTOBER]));
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 0.00120 BTC at Kraken ' +
        'for €70.00, fee €0.18, on 5 Oct 2026.',
    ]);
  });

  it('sum three purchases that replace an estimate, one fee as "fee", the dates with the serial comma', async () => {
    const csv = btcBuys([
      ['T1', '2026-10-05 09:00:00', '40.0000', '0.0007000000', '0.1000'],
      ['T2', '2026-10-12 09:00:00', '40.0000', '0.0006000000', '0.0000'],
      ['T3', '2026-10-19 09:00:00', '40.0000', '0.0007000000', '0.0000'],
    ]);
    await mount(planOf(csv, [...fixture.entries, ONE_TAP_OCTOBER]));
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 3 purchases at Kraken, ' +
        '0.00200 BTC for €120.00 in all, fee €0.10, on 5 Oct 2026, 12 Oct 2026, and 19 Oct 2026.',
    ]);
  });

  it('leave the fees out of the sum when no purchase that replaces an estimate has one', async () => {
    const csv = btcBuys([
      ['T1', '2026-10-05 09:00:00', '70.0000', '0.0012000000', '0.0000'],
      ['T2', '2026-10-12 12:00:00', '50.0000', '0.0008000000', '0.0000'],
    ]);
    await mount(planOf(csv, [...fixture.entries, ONE_TAP_OCTOBER]));
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 2 purchases at Kraken, ' +
        '0.00200 BTC for €120.00 in all, on 5 Oct 2026 and 12 Oct 2026.',
    ]);
  });

  it('word the months a file fills, every purchase date of the month its monthly buy', async () => {
    await mount(planOf(KRAKEN_OCTOBER, fixture.entries));
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    expect(lines('Monthly buys (3)')).toEqual([
      'Monthly buy for October 2026: 0.0012 BTC for €70.00, fee €0.18, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.012 ETH for €30.00, fee €0.08, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.0008 BTC for €50.00, fee €0.13, on 12 Oct 2026.',
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
    expect(lines('Matching entries in the Log, not added (1)')).toEqual([
      "The file's 0.00120 BTC for €70.00 on 5 Oct 2026 looks like your monthly buy for October 2026: 0.00121 BTC " +
        'at Bitvavo for €70.00.',
    ]);
    expect(texts()).toContain(
      'To import one of these instead, delete the entry it matches in the Log, then choose the file again.',
    );
  });

  it('word a monthly buy typed by hand that records two of the file’s dates, with what they add up to', async () => {
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, typed120('2026-10-06')]));
    expect(lines('Matching entries in the Log, not added (1)')).toEqual([
      "The file's purchases of 0.002 BTC for €120.00 in all, on 5 Oct 2026 and 12 Oct 2026, look like your monthly " +
        'buy for October 2026: 0.002 BTC at Bitvavo for €120.00.',
    ]);
  });

  // DOMAIN §3.13 step 2: a date's amount is all the file's purchases of the coin on it, so the dates claimed are not
  // the purchases: three purchases on two dates are never "2 purchases".
  it('word three purchases on two dates claimed by one hand monthly buy without counting the dates as purchases', async () => {
    const csv = btcBuys([
      ['T1', '2026-10-05 09:00:00', '40.0000', '0.0007000000', '0.1000'],
      ['T2', '2026-10-05 10:00:00', '30.0000', '0.0005000000', '0.0800'],
      ['T3', '2026-10-12 12:00:00', '50.0000', '0.0008000000', '0.1300'],
    ]);
    await mount(planOf(csv, [...fixture.entries, typed120('2026-10-06')]));
    expect(lines('Matching entries in the Log, not added (1)')).toEqual([
      "The file's purchases of 0.002 BTC for €120.00 in all, on 5 Oct 2026 and 12 Oct 2026, look like your monthly " +
        'buy for October 2026: 0.002 BTC at Bitvavo for €120.00.',
    ]);
  });

  it('word three dates claimed by one hand monthly buy with the serial comma inside the date list', async () => {
    const csv = btcBuys([
      ['T1', '2026-10-05 09:00:00', '40.0000', '0.0007000000', '0.0000'],
      ['T2', '2026-10-12 09:00:00', '40.0000', '0.0006000000', '0.0000'],
      ['T3', '2026-10-19 09:00:00', '40.0000', '0.0007000000', '0.0000'],
    ]);
    await mount(planOf(csv, [...fixture.entries, typed120('2026-10-12')]));
    expect(lines('Matching entries in the Log, not added (1)')).toEqual([
      "The file's purchases of 0.002 BTC for €120.00 in all, on 5 Oct 2026, 12 Oct 2026, and 19 Oct 2026, look like " +
        'your monthly buy for October 2026: 0.002 BTC at Bitvavo for €120.00.',
    ]);
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
      'This plan does not list XRP, so 1 XRP transaction was left out. If you want it in this plan, you can add XRP ' +
        'in Coins & split, then choose the file again.',
      '1 purchase dated on or before 20 Apr 2026, not imported: the file cannot tell it from your starting amount ' +
        'of 5 Apr 2026. Record it in the Log with the day you bought it, then choose the file again.',
      'Rewards paid in coins, not imported: 0.0001 ETH.',
      'Coins sent to Kraken from elsewhere, not imported: 0.01 BTC. Record a gift with Add coins you already have, ' +
        'and your own coins coming back with Log coins you moved.',
      'Coins sent out of Kraken with no matching move in the Log: 0.00502 BTC. Record each with Log coins you moved.',
      '1 exchange of one coin for another, not imported: the file gives no amount in EUR for it.',
      '1 row of money with no coin, such as a deposit or withdrawal, not imported.',
      '1 row within Kraken, such as a move between its wallets: it changes no entry.',
      'Lines 15, 16, and 17 could not be read or matched to the other rows of their trades, so they were left out.',
      '1 row of another type, not imported.',
    ]);
  });

  it('names the purchases left out for the starting amount, however long before the first buy, with the date they reach', async () => {
    const csv = btcBuys([
      ['T1', '2026-01-10 09:00:00', '40.0000', '0.0006000000', '0.1000'],
      ['T2', '2026-04-20 09:00:00', '40.0000', '0.0006000000', '0.1000'],
      ['T3', '2026-04-21 09:00:00', '40.0000', '0.0006000000', '0.1000'],
    ]);
    await mount(planOf(csv, []));
    expect(lines('Left out (1)')).toEqual([
      '2 purchases dated on or before 20 Apr 2026, not imported: the file cannot tell them from your starting ' +
        'amount of 5 Apr 2026. Record each in the Log with the day you bought it, then choose the file again.',
    ]);
  });

  it('word a purchase with a fee of 0 without a fee, and one with a fee with it', async () => {
    await mount(planOf(TRADE_REPUBLIC_OCTOBER, fixture.entries, PLAN, 'Trade Republic'), PLAN, 'trade-republic');
    expect(lines('Monthly buys (3)')).toEqual([
      'Monthly buy for October 2026: 0.0012 BTC for €70.00, fee €1.00, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.012 ETH for €30.00, fee €1.00, on 5 Oct 2026.',
      'Monthly buy for October 2026: 0.00005 BTC for €4.50, on 7 Oct 2026.',
    ]);
  });

  it('word one purchase with a fee of 0 that replaces an estimate without a fee', async () => {
    const csv = btcBuys([['T1', '2026-10-05 09:00:00', '70.0000', '0.0012000000', '0.0000']]);
    await mount(planOf(csv, [...fixture.entries, ONE_TAP_OCTOBER]));
    expect(lines('Estimates it replaces (1)')).toEqual([
      'Monthly buy for October 2026: 0.00119 BTC (estimated) at Bitvavo for €70.00 becomes 0.00120 BTC at Kraken ' +
        'for €70.00, on 5 Oct 2026.',
    ]);
  });

  it('names a buy imported earlier that the file now shows as cancelled, and says to delete it', async () => {
    const rows = TRADE_REPUBLIC_OCTOBER.split('\n');
    const before = rows.filter((row) => !row.includes('BUY_CANCELLED')).join('\n');
    const first = planOf(before, fixture.entries, PLAN, 'Trade Republic');
    await mount(planOf(TRADE_REPUBLIC_OCTOBER, [...fixture.entries, ...first.entries], PLAN, 'Trade Republic'));
    expect(texts()).toContain(
      'Your Log has 1 entry imported earlier that this file shows as cancelled: 0.005 ETH for €15.00 on ' +
        '13 Oct 2026. Delete it in the Log.',
    );
  });

  /** The plan of the whole October file over a Log that imported it before its two cancellations. */
  const twoCancelled = () => {
    const rows = TRADE_REPUBLIC_OCTOBER.split('\n');
    const cancel = rows.find((row) => row.includes('BUY_CANCELLED')) as string;
    const second = cancel
      .replace('2026-10-13T10:05', '2026-10-07T06:05')
      .replace('"ETH"', '"BTC"')
      .replace('"-0.005"', '"-0.00005"')
      .replace('"15.00"', '"4.50"')
      .replace(/000000000012"/, '000000000099"');
    const before = rows.filter((row) => !row.includes('BUY_CANCELLED')).join('\n');
    const first = planOf(before, fixture.entries, PLAN, 'Trade Republic');
    const whole = [...rows, second].join('\n');
    return planOf(whole, [...fixture.entries, ...first.entries], PLAN, 'Trade Republic');
  };

  it('names two buys imported earlier that the file now shows as cancelled, and says to delete them', async () => {
    await mount(twoCancelled());
    expect(texts()).toContain(
      'Your Log has 2 entries imported earlier that this file shows as cancelled: 0.00005 BTC for €4.50 on ' +
        '7 Oct 2026 and 0.005 ETH for €15.00 on 13 Oct 2026. Delete them in the Log.',
    );
  });

  // Review: "A Trade Republic export that ends before the cancellation is imported first: it stores buy B1 as May's
  // monthly buy and tombstones the estimate. ... Result: May has no live entry at all."
  it('says deleting a named monthly buy leaves its month without the estimate it replaced', async () => {
    const shown = twoCancelled();
    const tap = { ...ONE_TAP_OCTOBER, deletedAt: CONTEXT.now };
    const [one, two] = shown.cancelled as [
      ExchangeImportPlan['cancelled'][number],
      ExchangeImportPlan['cancelled'][number],
    ];
    await mount({ ...shown, cancelled: [{ ...one, estimates: [tap] }, two] });
    expect(texts()).toContain(
      'Your Log has 2 entries imported earlier that this file shows as cancelled: 0.00005 BTC for €4.50 on ' +
        '7 Oct 2026 and 0.005 ETH for €15.00 on 13 Oct 2026. Delete them in the Log. Deleting them leaves BTC for ' +
        'October 2026 without its estimate, which this import cannot bring back. Record that month again in the Log ' +
        'if you bought in it.',
    );
  });

  it('names each coin and month left without an estimate, and an entry with no amount by its units', async () => {
    const shown = twoCancelled();
    const [one] = shown.cancelled as [ExchangeImportPlan['cancelled'][number]];
    const tap = (coin: string, slot: string) =>
      anEntry({ coin: coin as Entry['coin'], slot: slot as Entry['slot'], source: 'one-tap', deletedAt: CONTEXT.now });
    const bare = { ...one.entry, id: 'aaaaaaaa-0000-4000-8000-000000000041' as EntityId, amount: null };
    const estimates = [tap('ETH', '2026-10'), tap('BTC', '2026-10'), tap('BTC', '2026-09')];
    await mount({
      ...shown,
      cancelled: [
        { entry: one.entry, estimates },
        { entry: bare, estimates: [] },
      ],
    });
    expect(texts()).toContain(
      'Your Log has 2 entries imported earlier that this file shows as cancelled: 0.00005 BTC for €4.50 on ' +
        '7 Oct 2026 and 0.00005 BTC on 7 Oct 2026. Delete them in the Log. Deleting them leaves BTC for ' +
        'September 2026, BTC for October 2026, and ETH for October 2026 without their estimates, which this import ' +
        'cannot bring back. Record those months again in the Log if you bought in them.',
    );
  });

  // Brand: "formats each cancelled item's units alone, so one sentence shows one coin at different places".
  it('shows two cancelled entries of one coin at the places the most precise of them needs', async () => {
    const shown = twoCancelled();
    const [one] = shown.cancelled as [ExchangeImportPlan['cancelled'][number]];
    const wider = { ...one.entry, id: 'aaaaaaaa-0000-4000-8000-000000000042' as EntityId, units: units('0.001') };
    await mount({ ...shown, cancelled: [one, { entry: wider, estimates: [] }] });
    expect(texts()).toContain(
      'Your Log has 2 entries imported earlier that this file shows as cancelled: 0.00005 BTC for €4.50 on ' +
        '7 Oct 2026 and 0.00100 BTC for €4.50 on 7 Oct 2026. Delete them in the Log.',
    );
  });

  it('names a receipt imported earlier with fewer units in the Log than in the file, with both figures', async () => {
    const first = planOf(KRAKEN_OCTOBER, fixture.entries);
    const log = first.entries.map((entry) => (entry.kind === 'held' ? { ...entry, units: units('0.00003') } : entry));
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, ...log]));
    expect(texts()).toContain(
      'A Coins added entry of 16 Oct 2026 imported earlier holds 0.00003 BTC in the Log and 0.00005 BTC in this ' +
        "file. Change its units in the Log to the file's.",
    );
  });

  // Review: "A suffix export holding only the 3 Dec row is imported first; the whole file folds both rows at 1 Dec,
  // and the short line names only the units."
  it('names the date the file gives a receipt imported earlier when the Log holds another', async () => {
    const first = planOf(KRAKEN_OCTOBER, fixture.entries);
    const log = first.entries.map((entry) =>
      entry.kind === 'held' ? { ...entry, units: units('0.00003'), date: date('2026-10-18') } : entry,
    );
    await mount(planOf(KRAKEN_OCTOBER, [...fixture.entries, ...log]));
    expect(texts()).toContain(
      'A Coins added entry of 18 Oct 2026 imported earlier holds 0.00003 BTC in the Log and 0.00005 BTC in this ' +
        "file. The file dates it 16 Oct 2026. Change its units, and its date, in the Log to the file's.",
    );
  });

  // "Each line left out names Trade Republic for its export: coins received without a purchase with their count,
  // coins sent out, rows within it, the benefit credits apart from other money, and a cancelled trade by line."
  it("names each row of a Trade Republic export left out in Trade Republic's words", async () => {
    await mount(planOf(TRADE_REPUBLIC_OCTOBER, [], PLAN, 'Trade Republic'), PLAN, 'trade-republic');
    expect(lines('Left out (9)')).toEqual([
      'Staking rewards and coins sent in to Trade Republic, not imported: 0.00012 ETH in 1 row. Record rewards ' +
        'with Add coins you already have, and your own coins coming back with Log coins you moved.',
      'Coins sent out of Trade Republic that match no move of the same units in the Log: 0.0001 BTC. If you have ' +
        'not recorded them, record each with Log coins you moved.',
      '1 exchange of one coin for another, not imported: the file gives no amount in EUR for it.',
      '1 row of money with no coin, such as a card payment, interest, or a transfer, not imported.',
      '1 Saveback cash credit, not imported; any purchase made with it is read like your other purchases.',
      '2 rows within Trade Republic, part of migrations that cancel out at one moment: they change no entry.',
      'Lines 12 and 13 are a trade and its cancellation, so they were left out.',
      'Line 16 could not be read, so it was left out.',
      '1 row of another type, such as a share or a fund, not imported.',
    ]);
  });

  // "One cause per sentence, each naming its lines: a trade and the cancellation that pairs with it, a cancellation
  // with no earlier trade of the same coin, units and amount left to pair, and a row that could not be read." The pairs
  // are counted as a figure and shown whole: past the cap of 5 lines the list shows 6, so the rest are whole pairs too.
  // The reader's groups, set by hand.
  it.each<[string, ExchangeImportPlan['leftOut'], string[]]>([
    [
      'one of each cause',
      [
        { reason: 'cancelled', count: 1, lines: [6, 7], by: [] },
        { reason: 'unpaired', count: 1, lines: [9], by: [] },
        { reason: 'unreadable', count: 1, lines: [11], by: [] },
      ],
      [
        'Lines 6 and 7 are a trade and its cancellation, so they were left out.',
        'Line 9 is a cancellation, so it was left out. This file has no earlier trade of the same coin, units, and ' +
          'amount left to pair with it.',
        'Line 11 could not be read, so it was left out.',
      ],
    ],
    [
      'several of each cause',
      [
        { reason: 'cancelled', count: 3, lines: [2, 3, 4, 5, 6, 7], by: [] },
        { reason: 'unpaired', count: 2, lines: [9, 10], by: [] },
        { reason: 'unreadable', count: 2, lines: [11, 12], by: [] },
      ],
      [
        'Lines 2, 3, 4, 5, 6, and 7 are 3 trades and their cancellations, so they were left out.',
        'Lines 9 and 10 are cancellations, so they were left out. This file has no earlier trades of the same coin, ' +
          'units, and amount left to pair with them.',
        'Lines 11 and 12 could not be read, so they were left out.',
      ],
    ],
    [
      'pairs and lone cancellations past the cap',
      [
        { reason: 'cancelled', count: 4, lines: [2, 3, 4, 5, 6, 7, 8, 9], by: [] },
        { reason: 'unpaired', count: 7, lines: [20, 21, 22, 23, 24, 25, 26], by: [] },
      ],
      [
        'Lines 2, 3, 4, 5, 6, 7, and 2 more are 4 trades and their cancellations, so they were left out.',
        'Lines 20, 21, 22, 23, 24, and 2 more are cancellations, so they were left out. This file has no earlier ' +
          'trades of the same coin, units, and amount left to pair with them.',
      ],
    ],
  ])('names the lines of a Trade Republic export left out by cause: %s', async (_, leftOut, expected) => {
    const read = planOf(TRADE_REPUBLIC_OCTOBER, [], PLAN, 'Trade Republic');
    const shown = { ...read, leftOut, withdrawals: { logged: [], notLogged: [] } };
    await mount(shown, PLAN, 'trade-republic');
    expect(lines(`Left out (${expected.length})`)).toEqual(expected);
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
      'Lines 2, 3, 4, 5, 6, and 4 more could not be read or matched to the other rows of their trades, so they were left out.',
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
