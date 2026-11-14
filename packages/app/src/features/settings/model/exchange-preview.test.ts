import { type EntityId, type Entry, type Instant, planExchangeImport, readExchangeFile } from '@proofofcalm/core';
import { anEntry, date, instant, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_OCTOBER, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { defaultVenue, previewModel } from './exchange-preview';
import { exchangeContext } from './import';

// The preview's data (docs/DOMAIN.md §3.13): the summary, the held line, one item per section entry and the counted
// lines, which feat/app-exchange-import words.

const NOW = '2026-10-20T10:00:00.000Z' as Instant;
const CONTEXT = exchangeContext(date('2026-10-20'), NOW, 'Europe/Lisbon');
const read = readExchangeFile(KRAKEN_OCTOBER);
if (!read.ok) throw new Error('the synthetic ledger reads');
const { plan } = fixtureSnapshot();
if (plan === null) throw new Error('the fixture has a plan');
const planOn = (entries: readonly Entry[], addHeld: boolean) =>
  planExchangeImport(read.value, { plan, entries }, { venue: 'Kraken', addHeld }, CONTEXT);
const HELD = anEntry({
  id: 'aaaaaaaa-0000-4000-8000-000000000020' as EntityId,
  kind: 'held',
  coin: 'BTC' as Entry['coin'],
  date: date('2026-10-13'),
  amount: null,
  units: units('0.002'),
  slot: null,
  venue: 'Ledger',
  source: 'manual',
});

describe('previewModel', () => {
  it('counts each kind, the estimates replaced, and gives each section its entries', () => {
    const shown = planOn([...fixtureSnapshot().entries, ONE_TAP_OCTOBER], false);
    const model = previewModel(shown);
    expect(model.summary).toEqual({ entries: 5, monthly: 3, extra: 0, sales: 1, added: 1, replaced: 1 });
    const btc = shown.entries.filter((entry) => entry.kind === 'dca' && entry.coin === 'BTC');
    expect(btc.map((entry) => entry.date)).toEqual(['2026-10-05', '2026-10-12']);
    expect(model.fills.map((entry) => [entry.coin, entry.date])).toEqual([['ETH', '2026-10-05']]);
    expect(model.replaces).toEqual([{ estimate: ONE_TAP_OCTOBER, by: btc, otherVenue: true }]);
    expect(model.extra).toEqual([]);
    expect(model.sales.map((entry) => [entry.coin, entry.units])).toEqual([['ETH', '0.01']]);
    expect(model.added.map((entry) => [entry.coin, entry.amount])).toEqual([['BTC', '0']]);
    expect([model.held, model.noneInCurrency, model.recorded, model.startingAmount]).toEqual([null, null, [], null]);
    expect(model.counted).toEqual({ imported: 0, deleted: 0, unitsCut: 0, feesInCoin: 0 });
    expect(model.leftOut).toBe(shown.leftOut);
    expect(model.withdrawals).toBe(shown.withdrawals);
  });

  it('counts, on the held line, the estimates ticking would replace: the ticked plan’s less the shown one’s', () => {
    const entries = [...fixtureSnapshot().entries, ONE_TAP_OCTOBER, HELD];
    const shown = planOn(entries, false);
    const model = previewModel(shown, planOn(entries, true));
    expect(model.held).toMatchObject({ added: false, replaces: 1 });
    expect(model.held?.coins.map(({ coin, purchases, through }) => [coin, purchases, through])).toEqual([
      ['BTC', 2, '2026-10-13'],
    ]);
    expect([model.summary.replaced, model.replaces]).toEqual([0, []]);
    expect(previewModel(planOn(entries, true)).held).toMatchObject({ added: true, replaces: 0 });
  });

  it('marks the Matching entries whose item says to delete the entry, and none without remedies', () => {
    const typed = (id: string, coin: string) =>
      anEntry({ id: id as EntityId, coin: coin as Entry['coin'], date: date('2026-10-06'), source: 'manual' });
    const [btc, eth] = [
      typed('aaaaaaaa-0000-4000-8000-000000000041', 'BTC'),
      typed('aaaaaaaa-0000-4000-8000-000000000042', 'ETH'),
    ];
    const shown = planOn([...fixtureSnapshot().entries, btc, eth], false);
    const marked = previewModel(shown, shown, { recorded: new Set([btc.id]) }).recorded;
    expect(marked.map((item) => [item.entry.id, item.remedy])).toEqual([
      [btc.id, true],
      [eth.id, false],
    ]);
    expect(previewModel(shown).recorded.map((item) => item.remedy)).toEqual([false, false]);
  });

  it('counts the rows imported or deleted earlier', () => {
    const first = planOn(fixtureSnapshot().entries, false);
    const [one, ...rest] = first.entries as [Entry, ...Entry[]];
    const deleted = { ...one, deletedAt: instant('2026-10-20T11:00:00Z') };
    const again = previewModel(planOn([...fixtureSnapshot().entries, deleted, ...rest], false));
    expect([again.summary.entries, again.counted.imported, again.counted.deleted]).toEqual([0, 4, 1]);
  });
});

describe('defaultVenue', () => {
  const at = (venue: string | null, day: string, deletedAt: Instant | null = null) =>
    anEntry({ venue, date: date(day), deletedAt });

  it('takes the spelling of the latest live entry whose venue is the name, ignoring case and outer spaces', () => {
    const entries = [at(' KRAKEN ', '2026-05-05'), at('kraken', '2026-06-05'), at('Bitvavo', '2026-07-05')];
    expect(defaultVenue(entries, 'Kraken')).toBe('kraken');
    expect(defaultVenue([...entries, at('KraKen', '2026-08-05', NOW)], 'Kraken')).toBe('kraken');
  });

  it('is the name itself when no live entry carries it', () => {
    expect(defaultVenue([at('Bitvavo', '2026-05-05'), at(null, '2026-06-05')], 'Kraken')).toBe('Kraken');
  });
});
