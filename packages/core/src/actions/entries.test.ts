import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, money, month, units } from '../../test/builders';
import { ENTRY_NOTE_MAX_LENGTH, VENUE_MAX_LENGTH } from '../constants';
import { compareInstants, stampAfter } from '../dates/calendar';
import { matchLots } from '../portfolio/lots';
import type { Entry } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import {
  deleteEntries,
  feeShares,
  heldUnits,
  restoreEntries,
  type SaveContext,
  saveTransaction,
  slotsAtDelete,
  type TransactionDraft,
  uncoveredSale,
} from './entries';
import { movesLeftShort } from './moves';
import { rowEntries } from './rows';

const plan = aPlan();
const now = instant('2026-03-02T10:00:00Z');
const ids = [id(), id(), id()];
const SOL = 'SOL' as CoinId;
const draft = (overrides: Partial<TransactionDraft> = {}): TransactionDraft => ({
  kind: 'dca',
  date: date('2026-03-01'),
  slot: month('2026-03'),
  fee: money('1'),
  note: 'monthly',
  venue: 'Kraken',
  rows: [
    { coin: BTC.id, amount: money('70'), units: units('0.001') },
    { coin: ETH.id, amount: money('30'), units: units('0.01') },
  ],
  ...overrides,
});
const context = (overrides: Partial<SaveContext> = {}): SaveContext => ({
  plan,
  entries: [],
  editing: [],
  ids,
  now,
  source: 'manual',
  ...overrides,
});
const buy = (coin: CoinId, quantity: string) =>
  anEntry({ kind: 'extra', slot: null, coin, units: units(quantity), amount: money('100') });
const sell = (coin: CoinId, quantity: string) =>
  anEntry({ kind: 'sell', slot: null, coin, units: units(quantity), amount: money('100') });
const failure = (result: ReturnType<typeof saveTransaction>) => (result.ok ? null : result.error);

describe('saveTransaction (docs/DOMAIN.md §6)', () => {
  it('records one entry per coin, splitting the fee by amount', () => {
    const result = saveTransaction(draft(), context());
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: ids[0],
          kind: 'dca',
          date: '2026-03-01',
          coin: 'BTC',
          amount: '70',
          units: '0.001',
          fee: '0.7',
          note: 'monthly',
          slot: '2026-03',
          venue: 'Kraken',
          source: 'manual',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        expect.objectContaining({ id: ids[1], coin: 'ETH', amount: '30', units: '0.01', fee: '0.3' }),
      ],
    });
  });

  it('skips empty rows, records no fee without one, and wants both the amount and the units', () => {
    const rows = [
      { coin: BTC.id, amount: null, units: null },
      { coin: ETH.id, amount: money('30'), units: units('0.01') },
    ];
    const result = saveTransaction(draft({ rows, fee: null }), context());
    expect(result.ok && result.value.map((entry) => [entry.coin, entry.fee])).toEqual([['ETH', null]]);
    const half = [{ coin: BTC.id, amount: money('70'), units: null }];
    expect(failure(saveTransaction(draft({ rows: half }), context()))).toEqual({
      code: 'amount-and-units',
      coin: 'BTC',
    });
    const zero = [{ coin: BTC.id, amount: money('0'), units: units('0.001') }];
    expect(failure(saveTransaction(draft({ rows: zero }), context()))).toEqual({
      code: 'amount-and-units',
      coin: 'BTC',
    });
    const nothing = [{ coin: BTC.id, amount: money('0'), units: units('0') }];
    expect(failure(saveTransaction(draft({ rows: nothing }), context()))).toEqual({ code: 'no-coins' });
  });

  it('never sells more than is held, leaving out the entries being edited', () => {
    const entries = [buy(BTC.id, '0.002'), sell(BTC.id, '0.0005')];
    const sale = draft({
      kind: 'sell',
      slot: null,
      rows: [{ coin: BTC.id, amount: money('90'), units: units('0.002') }],
    });
    expect(failure(saveTransaction(sale, context({ entries })))).toEqual({
      code: 'sell-exceeds-held',
      coin: 'BTC',
      held: '0.0015',
      sold: '0.002',
    });
    const editing = [entries[1] as (typeof entries)[1]];
    const edited = saveTransaction(sale, context({ entries, editing }));
    expect(edited.ok && edited.value.map((entry) => [entry.id, entry.units])).toEqual([[editing[0]?.id, '0.002']]);
  });

  it('asks for a slot on a monthly buy and refuses one elsewhere, or a slot the plan does not have', () => {
    expect(failure(saveTransaction(draft({ slot: null }), context()))).toEqual({ code: 'slot-required' });
    expect(failure(saveTransaction(draft({ kind: 'extra' }), context()))).toEqual({ code: 'slot-not-allowed' });
    expect(failure(saveTransaction(draft({ slot: month('2027-05') }), context()))).toEqual({
      code: 'unknown-slot',
      slot: '2027-05',
    });
    const orphan = anEntry({ slot: month('2025-12') });
    const kept = saveTransaction(draft({ slot: month('2025-12') }), context({ entries: [orphan], editing: [orphan] }));
    expect(kept.ok).toBe(true);
  });

  it('refuses a new monthly buy for a month already recorded or skipped', () => {
    const march = anEntry({ slot: month('2026-03') });
    expect(failure(saveTransaction(draft(), context({ entries: [march] })))).toEqual({
      code: 'slot-done',
      slot: '2026-03',
    });
    const skipped = aPlan({ skips: [{ id: id(), slot: month('2026-03'), note: '', createdAt: now }] });
    expect(failure(saveTransaction(draft(), context({ plan: skipped })))).toEqual({
      code: 'slot-skipped',
      slot: '2026-03',
    });
    // A deleted monthly buy or another kind of entry leaves the month open.
    const deleted = { ...march, deletedAt: now };
    expect(saveTransaction(draft(), context({ entries: [deleted, buy(BTC.id, '1')] })).ok).toBe(true);
  });

  it('lets an edit keep its month, and refuses moving it onto a month recorded by another buy', () => {
    const march = anEntry({ slot: month('2026-03') });
    const april = anEntry({ slot: month('2026-04') });
    const entries = [march, april];
    expect(saveTransaction(draft(), context({ entries, editing: [march] })).ok).toBe(true);
    expect(failure(saveTransaction(draft({ slot: month('2026-04') }), context({ entries, editing: [march] })))).toEqual(
      { code: 'slot-done', slot: '2026-04' },
    );
    const skipped = aPlan({ skips: [{ id: id(), slot: month('2026-03'), note: '', createdAt: now }] });
    expect(saveTransaction(draft(), context({ plan: skipped, entries, editing: [march] })).ok).toBe(true);
  });

  it('takes the coins of the plan and coins that already have entries', () => {
    const sol = [{ coin: SOL, amount: money('10'), units: units('0.1') }];
    const extra = draft({ kind: 'extra', slot: null, rows: sol });
    expect(failure(saveTransaction(extra, context()))).toEqual({ code: 'unknown-coin', coin: 'SOL' });
    expect(saveTransaction(extra, context({ entries: [buy(SOL, '1')] })).ok).toBe(true);
  });

  it('refuses more than ten decimals of units and a negative fee', () => {
    const fine = [{ coin: BTC.id, amount: money('70'), units: units('0.00000000001') }];
    expect(failure(saveTransaction(draft({ rows: fine }), context()))).toEqual({
      code: 'units-precision',
      coin: 'BTC',
    });
    expect(failure(saveTransaction(draft({ fee: money('-1') }), context()))).toEqual({ code: 'fee-negative' });
  });

  it('refuses a note or a venue longer than the entry can store, and takes one that long', () => {
    const note = 'x'.repeat(ENTRY_NOTE_MAX_LENGTH);
    const venue = 'x'.repeat(VENUE_MAX_LENGTH);
    expect(failure(saveTransaction(draft({ note: `${note}x` }), context()))).toEqual({
      code: 'note-too-long',
      max: 500,
    });
    expect(failure(saveTransaction(draft({ venue: `${venue}x` }), context()))).toEqual({
      code: 'venue-too-long',
      max: 40,
    });
    expect(saveTransaction(draft({ note, venue }), context()).ok).toBe(true);
  });

  it('updates the edited entries in place, removes a coin left empty and adds a new one', () => {
    const btc = anEntry({ slot: month('2026-03'), source: 'one-tap', createdAt: instant('2026-03-01T08:00:00Z') });
    const eth = anEntry({ slot: month('2026-03'), coin: ETH.id });
    const rows = [
      { coin: BTC.id, amount: money('60'), units: units('0.0009') },
      { coin: ETH.id, amount: null, units: null },
      { coin: SOL, amount: money('40'), units: units('0.2') },
    ];
    const entries = [btc, eth, buy(SOL, '1')];
    const result = saveTransaction(draft({ rows, fee: null }), context({ entries, editing: [btc, eth] }));
    expect(result.ok && result.value).toEqual([
      expect.objectContaining({
        id: btc.id,
        amount: '60',
        // Its units changed (0.001 to 0.0009), so the one-tap estimate is labelled no more.
        source: 'manual',
        createdAt: '2026-03-01T08:00:00Z',
        updatedAt: now,
      }),
      expect.objectContaining({ id: ids[0], coin: 'SOL', source: 'manual', createdAt: now }),
      { ...eth, deletedAt: now, updatedAt: now },
    ]);
  });

  it('needs a fresh id for every new entry', () => {
    expect(() => saveTransaction(draft(), context({ ids: [] }))).toThrow('Missing a fresh id');
  });
});

describe('an edit gives each row its own entry (docs/DOMAIN.md §6, Edit a transaction)', () => {
  const day = date('2026-02-10');
  const bought = anEntry({
    kind: 'extra',
    slot: null,
    date: date('2026-01-05'),
    units: units('1'),
    amount: money('500'),
  });
  const logged = (at: string, amount: string, quantity: string) =>
    anEntry({
      kind: 'sell',
      slot: null,
      date: day,
      amount: money(amount),
      units: units(quantity),
      createdAt: instant(`2026-02-10T${at}:00Z`),
      updatedAt: instant(`2026-02-10T${at}:00Z`),
    });
  // The Log lists a grouped row's items by amount, largest first, not by when each was logged.
  const a = logged('10:00', '300', '0.3');
  const b = logged('09:00', '200', '0.2');
  const c = logged('11:00', '100', '0.1');
  const row = (sale: Entry, cleared = false, coin = sale.coin) => ({
    coin,
    entry: sale.id,
    amount: cleared ? null : sale.amount,
    units: cleared ? null : sale.units,
  });
  const added = { coin: BTC.id, amount: money('50'), units: units('0.05') };
  const save = (rows: TransactionDraft['rows'], editing: readonly Entry[]) => {
    const result = saveTransaction(
      draft({ kind: 'sell', slot: null, date: day, fee: null, rows }),
      context({ entries: [bought, ...editing], editing }),
    );
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  };
  const kept = (entry: Entry) => ({ id: entry.id, createdAt: entry.createdAt, units: entry.units, deletedAt: null });

  it('keeps the other rows under their own entries and deletes the cleared one', () => {
    const saved = save([row(a), row(b, true), row(c)], [a, b, c]);
    expect(saved).toEqual([
      expect.objectContaining(kept(a)),
      expect.objectContaining(kept(c)),
      expect.objectContaining({ id: b.id, units: b.units, deletedAt: now }),
    ]);
  });

  it('deletes the first row cleared of two sales, whose second keeps its own entry', () => {
    const saved = save([row(a, true), row(b)], [a, b]);
    expect(saved).toEqual([expect.objectContaining(kept(b)), expect.objectContaining({ id: a.id, deletedAt: now })]);
  });

  it('keeps every entry when every row stays filled', () => {
    const saved = save([row(a), row(b), row(c)], [c, b, a]);
    expect(saved).toEqual([a, b, c].map((sale) => expect.objectContaining(kept(sale))));
  });

  it('gives a row added in the edit, or one whose coin changed, an entry of its coin no row kept', () => {
    const eth = { ...logged('08:00', '40', '0.02'), coin: ETH.id };
    const ethBought = { ...bought, id: id(), coin: ETH.id };
    const result = saveTransaction(
      draft({ kind: 'sell', slot: null, date: day, fee: null, rows: [added, row(eth, false, BTC.id), row(b)] }),
      context({ entries: [bought, ethBought, a, b, eth], editing: [a, b, eth] }),
    );
    // The added row takes a, the first BTC entry left; the row whose coin changed from ETH has none left, so a fresh id.
    expect(result.ok && result.value).toEqual([
      expect.objectContaining({ id: a.id, createdAt: a.createdAt, units: '0.05' }),
      expect.objectContaining({ id: ids[0], coin: BTC.id, createdAt: now }),
      expect.objectContaining(kept(b)),
      expect.objectContaining({ id: eth.id, deletedAt: now }),
    ]);
  });

  it('gives an entry two rows name to the first of them only; the second takes the next of its coin', () => {
    expect(rowEntries([row(a), row(a)], [a, b])).toEqual({ taken: [a, b], removed: [] });
    expect(rowEntries([row(a), row(a)], [a])).toEqual({ taken: [a, null], removed: [] });
  });

  it('assigns as before for rows that name no entry, as a draft from before rows carried one', () => {
    const rows = [row(a), row(b, true), row(c)].map(({ coin, amount, units: sold }) => ({ coin, amount, units: sold }));
    expect(save(rows, [a, b, c]).map((entry) => [entry.id, entry.deletedAt])).toEqual([
      [a.id, null],
      [b.id, null],
      [c.id, now],
    ]);
  });
});

describe('a one-tap estimate is labelled until its units change (ADR-0003; docs/DOMAIN.md §2.2, §6)', () => {
  const tapped = (coin: CoinId, amount: string, quantity: string) =>
    anEntry({
      coin,
      date: date('2026-03-01'),
      slot: month('2026-03'),
      amount: money(amount),
      units: units(quantity),
      fee: money('0.5'),
      note: 'monthly',
      venue: 'Kraken',
      source: 'one-tap',
    });
  const btc = tapped(BTC.id, '70', '0.001');
  const eth = tapped(ETH.id, '30', '0.01');
  const sol = tapped(SOL, '20', '0.1');
  const row = (entry: Entry, change: { amount?: string; units?: string; cleared?: boolean } = {}) => ({
    coin: entry.coin,
    entry: entry.id,
    amount: change.cleared ? null : change.amount === undefined ? entry.amount : money(change.amount),
    units: change.cleared ? null : change.units === undefined ? entry.units : units(change.units),
  });
  const save = (rows: TransactionDraft['rows'], editing: readonly Entry[], changes: Partial<TransactionDraft> = {}) => {
    const result = saveTransaction(draft({ rows, ...changes }), context({ entries: editing, editing }));
    if (!result.ok) throw new Error(result.error.code);
    return result.value.map((entry) => [entry.id, entry.source, entry.deletedAt]);
  };

  it("an edit that changes a one-tap entry's units saves it as manual", () => {
    expect(save([row(btc, { units: '0.00098' })], [btc])).toEqual([[btc.id, 'manual', null]]);
  });

  it('an edit of only the amount keeps one-tap', () => {
    expect(save([row(btc, { amount: '72' })], [btc])).toEqual([[btc.id, 'one-tap', null]]);
  });

  it('an edit of only the fee keeps one-tap', () => {
    expect(save([row(btc)], [btc], { fee: money('2') })).toEqual([[btc.id, 'one-tap', null]]);
  });

  it('an edit of only the note keeps one-tap', () => {
    expect(save([row(btc)], [btc], { note: 'from the app' })).toEqual([[btc.id, 'one-tap', null]]);
  });

  it('retyping the same units keeps one-tap', () => {
    expect(save([row(btc, { units: '0.00100' })], [btc])).toEqual([[btc.id, 'one-tap', null]]);
  });

  it("a one-tap month of two coins, one row's units changed: that row's own entry turns manual, the other keeps one-tap", () => {
    expect(save([row(btc), row(eth, { units: '0.011' })], [btc, eth])).toEqual([
      [btc.id, 'one-tap', null],
      [eth.id, 'manual', null],
    ]);
  });

  it("three coins, one changed and one cleared: the changed row's own entry turns manual, the cleared row's entry is soft-deleted, the third keeps one-tap", () => {
    const rows = [row(btc, { cleared: true }), row(eth), row(sol, { units: '0.12' })];
    expect(save(rows, [btc, eth, sol])).toEqual([
      [eth.id, 'one-tap', null],
      [sol.id, 'manual', null],
      [btc.id, 'one-tap', now],
    ]);
  });
});

describe('coins held before the plan or received (docs/DOMAIN.md §2.2, §6)', () => {
  const heldDraft = (rows: TransactionDraft['rows'], overrides: Partial<TransactionDraft> = {}) =>
    draft({ kind: 'held', slot: null, fee: null, venue: null, rows, ...overrides });
  const coin = (amount: string | null, quantity: string | null, entry?: EntityId) => ({
    coin: BTC.id,
    amount: amount === null ? null : money(amount),
    units: quantity === null ? null : units(quantity),
    ...(entry === undefined ? {} : { entry }),
  });

  it('saves a row with units and no cost, or a cost of 0, with no fee', () => {
    const saved = saveTransaction(heldDraft([coin(null, '0.5'), { ...coin('0', '2'), coin: ETH.id }]), context());
    expect(saved).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ id: ids[0], kind: 'held', coin: 'BTC', amount: null, units: '0.5', fee: null }),
        expect.objectContaining({ id: ids[1], kind: 'held', coin: 'ETH', amount: '0', units: '2', fee: null }),
      ],
    });
  });

  it('wants positive units beside a typed cost, and takes no fee', () => {
    expect(failure(saveTransaction(heldDraft([coin('100', null)]), context()))).toEqual({
      code: 'amount-and-units',
      coin: BTC.id,
    });
    expect(failure(saveTransaction(heldDraft([coin('0', null)]), context()))).toEqual({
      code: 'amount-and-units',
      coin: BTC.id,
    });
    expect(failure(saveTransaction(heldDraft([coin(null, '0')]), context()))).toEqual({ code: 'no-coins' });
    expect(failure(saveTransaction(heldDraft([coin('-1', '1')]), context()))).toEqual({
      code: 'amount-and-units',
      coin: BTC.id,
    });
    expect(failure(saveTransaction(heldDraft([coin(null, '1')], { fee: money('0') }), context()))).toEqual({
      code: 'fee-not-allowed',
    });
  });

  it('still refuses units alone, and a typed 0, on every other kind', () => {
    for (const kind of ['lump', 'extra', 'sell'] as const) {
      const entries = kind === 'sell' ? [buy(BTC.id, '1')] : [];
      const save = (row: ReturnType<typeof coin>) =>
        failure(saveTransaction(draft({ kind, slot: null, fee: null, rows: [row] }), context({ entries })));
      expect(save(coin(null, '0.5'))).toEqual({ code: 'amount-and-units', coin: BTC.id });
      expect(save(coin('0', '0.5'))).toEqual({ code: 'amount-and-units', coin: BTC.id });
    }
    expect(failure(saveTransaction(draft({ rows: [coin(null, '0.5')] }), context()))).toEqual({
      code: 'amount-and-units',
      coin: BTC.id,
    });
  });

  it.each([2, 3])(
    'a grouped edit of %i rows of one coin, one cleared, keeps each kept row under its own entry',
    (n) => {
      const day = date('2025-06-01');
      const editing = Array.from({ length: n }, (_, at) =>
        anEntry({
          kind: 'held',
          slot: null,
          date: day,
          amount: at === 0 ? null : money(String(at * 10)),
          units: units(String(at + 1)),
          createdAt: instant(`2026-02-10T0${at}:00:00Z`),
          updatedAt: instant(`2026-02-10T0${at}:00:00Z`),
        }),
      );
      // The Log lists the item with no cost last, so the form's rows come in another order than the entries.
      const rows = [...editing]
        .reverse()
        .map((entry, at) => coin(at === 0 ? null : entry.amount, at === 0 ? null : entry.units, entry.id));
      const cleared = editing.at(-1) as Entry;
      const result = saveTransaction(heldDraft(rows, { date: day }), context({ entries: editing, editing }));
      const kept = editing.slice(0, -1).reverse();
      expect(result.ok && result.value).toEqual([
        ...kept.map((entry) =>
          expect.objectContaining({
            id: entry.id,
            createdAt: entry.createdAt,
            amount: entry.amount,
            units: entry.units,
          }),
        ),
        expect.objectContaining({ id: cleared.id, units: cleared.units, deletedAt: now }),
      ]);
    },
  );
});

describe('feeShares', () => {
  it('splits a fee by amount so that the shares sum to it exactly, at its own decimals when finer', () => {
    expect(feeShares(money('0.01'), [money('70'), money('30')], 'EUR')).toEqual(['0.01', '0']);
    expect(feeShares(money('0.101'), [money('70'), money('30')], 'EUR')).toEqual(['0.071', '0.03']);
    expect(feeShares(money('2.5'), [money('100')], 'EUR')).toEqual(['2.5']);
  });
});

describe('heldUnits', () => {
  it('sums purchases less sales of a coin, never below zero, without deleted or excluded entries', () => {
    const sale = sell(BTC.id, '0.3');
    const entries = [buy(BTC.id, '0.5'), sale, buy(ETH.id, '2'), { ...buy(BTC.id, '9'), deletedAt: now }];
    expect(heldUnits(entries, BTC.id)).toBe('0.2');
    expect(heldUnits(entries, BTC.id, new Set([sale.id]))).toBe('0.5');
    expect(heldUnits([sell(BTC.id, '1')], BTC.id)).toBe('0');
  });
});

describe('deleteEntries and restoreEntries (docs/DOMAIN.md §6)', () => {
  const first = anEntry();
  const second = anEntry({ kind: 'extra', slot: null, coin: ETH.id });
  const later = instant('2026-03-02T10:00:05Z');
  const skipOf = (slot: string) => ({ id: id(), slot: month(slot), note: '', createdAt: later });
  /** What a delete at `now` of `ids` notes when no month of a monthly buy is among them. */
  const noted = (ids: readonly EntityId[]) => ({ at: now, ids, slots: [], currency: plan.payCurrency });

  it('soft-deletes the entries named, and the undo restores exactly those', () => {
    const before = slotsAtDelete(plan, [first, second], [first.id], now);
    const deleted = deleteEntries([first, second], [first.id], now);
    expect(deleted).toEqual([{ ...first, deletedAt: now, updatedAt: now }]);
    expect(restoreEntries(plan, [...deleted, second], [first.id], before, later)).toEqual({
      ok: true,
      value: [{ ...first, deletedAt: null, updatedAt: later }],
    });
  });

  it('leaves entries alone that are already in the state asked for', () => {
    expect(deleteEntries([{ ...first, deletedAt: now }], [first.id], later)).toEqual([]);
    expect(restoreEntries(plan, [second], [second.id], noted([second.id]), later)).toEqual({ ok: true, value: [] });
  });

  it('notes, per month of a deleted monthly buy, whether it was skipped and which other monthly buys recorded it', () => {
    const btc = anEntry({ slot: month('2026-03') });
    const eth = anEntry({ slot: month('2026-03'), coin: ETH.id });
    const sibling = anEntry({ slot: month('2026-03'), source: 'one-tap' });
    const gone = { ...anEntry({ slot: month('2026-03') }), deletedAt: now };
    const april = anEntry({ slot: month('2026-04') });
    const skipped = aPlan({ skips: [skipOf('2026-03')] });
    const unslotted = anEntry({ slot: null });
    const entries = [btc, eth, sibling, gone, april, second, unslotted];
    expect(slotsAtDelete(skipped, entries, [btc.id, eth.id, second.id, unslotted.id], now)).toEqual({
      at: now,
      ids: [btc.id, eth.id, second.id, unslotted.id],
      slots: [{ slot: '2026-03', skipped: true, recordedBy: [sibling.id] }],
      currency: 'EUR',
    });
    // Without a plan nothing is skipped.
    expect(slotsAtDelete(null, entries, [april.id, gone.id], now)).toEqual({
      at: now,
      ids: [april.id],
      slots: [{ slot: '2026-04', skipped: false, recordedBy: [] }],
      currency: null,
    });
  });

  it('restores nothing when the month of a deleted monthly buy was skipped or recorded since', () => {
    const [btcLive, ethLive] = [anEntry({ slot: month('2026-03') }), anEntry({ slot: month('2026-03'), coin: ETH.id })];
    const live = [first, btcLive, ethLive];
    const [btc, eth] = deleteEntries(live, [btcLive.id, ethLive.id], now);
    if (btc === undefined || eth === undefined) throw new Error('two deleted entries');
    const deletedIds = [btc.id, eth.id];
    const clean = slotsAtDelete(plan, live, deletedIds, now);
    const skipped = aPlan({ skips: [skipOf('2026-03')] });
    expect(restoreEntries(skipped, [btc, eth], deletedIds, clean, later)).toEqual({
      ok: false,
      error: { code: 'slot-skipped', slot: '2026-03' },
    });
    const again = anEntry({ slot: month('2026-03'), source: 'one-tap' });
    expect(restoreEntries(plan, [btc, eth, again], deletedIds, clean, later)).toEqual({
      ok: false,
      error: { code: 'slot-done', slot: '2026-03' },
    });
    // With nothing noted at the delete, the month counts as having been open.
    expect(restoreEntries(skipped, [btc, eth], deletedIds, noted(deletedIds), later)).toEqual({
      ok: false,
      error: { code: 'slot-skipped', slot: '2026-03' },
    });
    // Another month's buy, or an entry of another kind, does not stand in the way.
    const extra = { ...buy(BTC.id, '1'), deletedAt: now, updatedAt: now };
    const others = [btc, eth, extra, anEntry({ slot: month('2026-04') })];
    expect(restoreEntries(skipped, others, [extra.id], noted([extra.id]), later).ok).toBe(true);
    expect(restoreEntries(plan, others, deletedIds, clean, later).ok).toBe(true);
  });

  it('restores a month that held another row, or a skip and a row, before the delete', () => {
    const btc = anEntry({ slot: month('2026-03'), date: date('2026-03-05') });
    const eth = anEntry({ slot: month('2026-03'), date: date('2026-03-07'), coin: ETH.id });
    const stored = [...deleteEntries([btc, eth], [btc.id], now), eth];
    const restored = { ok: true, value: [{ ...btc, deletedAt: null, updatedAt: later }] };
    const twoRows = slotsAtDelete(plan, [btc, eth], [btc.id], now);
    expect(restoreEntries(plan, stored, [btc.id], twoRows, later)).toEqual(restored);
    // A prototype import can hold a month both skipped and recorded.
    const skipped = aPlan({ skips: [skipOf('2026-03')] });
    const skipAndRow = slotsAtDelete(skipped, [btc, eth], [btc.id], now);
    expect(restoreEntries(skipped, stored, [btc.id], skipAndRow, later)).toEqual(restored);
    // What arrived after the delete still refuses the undo.
    expect(restoreEntries(skipped, stored, [btc.id], twoRows, later)).toEqual({
      ok: false,
      error: { code: 'slot-skipped', slot: '2026-03' },
    });
    const again = anEntry({ slot: month('2026-03'), source: 'one-tap' });
    expect(restoreEntries(skipped, [...stored, again], [btc.id], skipAndRow, later)).toEqual({
      ok: false,
      error: { code: 'slot-done', slot: '2026-03' },
    });
  });

  it('restores nothing when a deleted entry was written again after the delete, as a replace does', () => {
    const [gone] = deleteEntries([first], [first.id], now);
    if (gone === undefined) throw new Error('one deleted entry');
    expect(restoreEntries(plan, [gone, second], [first.id, second.id], noted([first.id, second.id]), later)).toEqual({
      ok: true,
      value: [{ ...first, deletedAt: null, updatedAt: later }],
    });
    const changed = { ok: false, error: { code: 'changed-since-delete' } };
    const replaced = { ...gone, updatedAt: later };
    expect(restoreEntries(plan, [replaced, second], [first.id], noted([first.id]), later)).toEqual(changed);
  });

  it('restores nothing when a tombstone is not the one the delete wrote, whatever the clocks of the tabs', () => {
    const earlier = instant('2026-03-02T09:59:57Z');
    const [gone] = deleteEntries([first], [first.id], now);
    if (gone === undefined) throw new Error('one deleted entry');
    const changed = { ok: false, error: { code: 'changed-since-delete' } };
    // A replace on a clock behind the delete's restamps the tombstone earlier than its deletedAt.
    expect(restoreEntries(plan, [{ ...gone, updatedAt: earlier }], [first.id], noted([first.id]), later)).toEqual(
      changed,
    );
    // A replace on a snapshot that still had the entry live tombstones it again, both stamps its own.
    const again = { ...gone, deletedAt: earlier, updatedAt: earlier };
    expect(restoreEntries(plan, [again], [first.id], noted([first.id]), later)).toEqual(changed);
    expect(
      restoreEntries(plan, [{ ...gone, deletedAt: later, updatedAt: later }], [first.id], noted([first.id]), later),
    ).toEqual(changed);
    // The same moment in another offset is the same stamp.
    const sameMoment = { ...gone, updatedAt: instant('2026-03-02T11:00:00+01:00') };
    expect(restoreEntries(plan, [sameMoment], [first.id], noted([first.id]), later).ok).toBe(true);
  });

  it('restores only what its delete wrote: an entry another tab deleted first stays deleted and refuses nothing', () => {
    const earlier = instant('2026-03-02T09:59:57Z');
    const elsewhere = deleteEntries([first], [first.id], earlier);
    const before = slotsAtDelete(plan, [...elsewhere, second], [first.id, second.id], now);
    expect(before.ids).toEqual([second.id]);
    const stored = [...elsewhere, ...deleteEntries([...elsewhere, second], before.ids, before.at)];
    expect(restoreEntries(plan, stored, [first.id, second.id], before, later)).toEqual({
      ok: true,
      value: [{ ...second, deletedAt: null, updatedAt: later }],
    });
  });

  it('stamps a delete, its undo and an edit strictly after the stored stamps on a clock behind them', () => {
    const ahead = instant('2026-03-02T10:00:07Z');
    const stored = anEntry({ updatedAt: ahead });
    const before = slotsAtDelete(plan, [stored], [stored.id], now);
    expect(compareInstants(before.at, ahead)).toBe(1);
    expect(before.at).toBe(stampAfter(now, ahead));
    const deleted = deleteEntries([stored], before.ids, before.at);
    expect(deleted).toEqual([{ ...stored, deletedAt: before.at, updatedAt: before.at }]);
    const restored = restoreEntries(plan, deleted, [stored.id], before, now);
    if (!restored.ok) throw new Error(restored.error.code);
    expect(restored.value.map((entry) => compareInstants(entry.updatedAt, before.at))).toEqual([1]);

    const btc = anEntry({ coin: BTC.id, updatedAt: ahead });
    const eth = anEntry({ coin: ETH.id, updatedAt: ahead });
    const rows = [{ coin: BTC.id, amount: money('80'), units: units('0.002') }];
    const saved = saveTransaction(draft({ rows }), context({ entries: [btc, eth], editing: [btc, eth] }));
    if (!saved.ok) throw new Error(saved.error.code);
    const after = stampAfter(now, ahead);
    expect(saved.value.map((entry) => [entry.id, entry.updatedAt, entry.deletedAt])).toEqual([
      [btc.id, after, null],
      [eth.id, after, after],
    ]);
  });
});

describe('every sale stays covered by purchases dated on or before it (docs/DOMAIN.md §3.7, §6)', () => {
  const later = instant('2026-03-02T10:00:05Z');
  const on = (day: string, entry: Entry): Entry => ({ ...entry, date: date(day) });
  const sale = (quantity: string, day = '2026-03-01') =>
    draft({
      kind: 'sell',
      slot: null,
      date: date(day),
      rows: [{ coin: BTC.id, amount: money('90'), units: units(quantity) }],
    });
  const purchase = (coin: CoinId, quantity: string, day: string) =>
    draft({
      kind: 'extra',
      slot: null,
      date: date(day),
      rows: [{ coin, amount: money('100'), units: units(quantity) }],
    });
  const short = (held: string, sold: string) => ({ code: 'sell-exceeds-held', coin: BTC.id, held, sold });
  /** The store's merge: an entry written replaces the one with its id. */
  const store = (entries: readonly Entry[], written: readonly Entry[]) => {
    const ids = new Set(written.map((entry) => entry.id));
    return [...entries.filter((entry) => !ids.has(entry.id)), ...written];
  };

  it("the undo of a sale's delete refuses when the units are no longer held", () => {
    const bought = buy(BTC.id, '0.002');
    const first = saveTransaction(sale('0.002'), context({ entries: [bought], ids: [id()] }));
    if (!first.ok) throw new Error(first.error.code);
    let stored = [bought, ...first.value];
    const before = slotsAtDelete(
      plan,
      stored,
      first.value.map((entry) => entry.id),
      now,
    );
    stored = store(stored, deleteEntries(stored, before.ids, before.at));
    const second = saveTransaction(sale('0.002'), context({ entries: stored, ids: [id()] }));
    if (!second.ok) throw new Error(second.error.code);
    stored = store(stored, second.value);
    expect(restoreEntries(plan, stored, before.ids, before, later)).toEqual({ ok: false, error: short('0', '0.002') });
  });

  it('refuses a sale dated before the purchases that cover it, or one that leaves a later sale short', () => {
    const bought = on('2026-02-01', buy(BTC.id, '0.002'));
    expect(failure(saveTransaction(sale('0.001', '2026-01-15'), context({ entries: [bought] })))).toEqual(
      short('0', '0.001'),
    );
    expect(failure(saveTransaction(sale('0.002', '2026-02-01'), context({ entries: [bought] })))).toBeNull();
    const sold = on('2026-03-01', sell(BTC.id, '0.0015'));
    expect(failure(saveTransaction(sale('0.001', '2026-02-15'), context({ entries: [bought, sold] })))).toEqual(
      short('0.0005', '0.001'),
    );
  });

  it('refuses deleting a purchase, or moving it after a sale it covers, or giving it fewer units or another coin', () => {
    const bought = buy(BTC.id, '0.002');
    const sold = on('2026-02-01', sell(BTC.id, '0.002'));
    const entries = [bought, sold];
    expect(uncoveredSale(entries, deleteEntries(entries, [bought.id], now))).toEqual(short('0', '0.002'));
    expect(uncoveredSale(entries, deleteEntries(entries, [sold.id], now))).toBeNull();
    const edit = (next: TransactionDraft) => failure(saveTransaction(next, context({ entries, editing: [bought] })));
    expect(edit(purchase(BTC.id, '0.002', '2026-03-01'))).toEqual(short('0', '0.002'));
    expect(edit(purchase(BTC.id, '0.001', '2026-01-01'))).toEqual(short('0.001', '0.002'));
    expect(edit(purchase(ETH.id, '0.002', '2026-01-01'))).toEqual(short('0', '0.002'));
    expect(edit(purchase(BTC.id, '0.003', '2026-02-01'))).toBeNull();
  });

  it('takes a write that leaves no sale less covered than imported data already had it', () => {
    const orphan = sell(BTC.id, '0.001');
    expect(uncoveredSale([orphan], [on('2026-02-01', buy(BTC.id, '0.002'))])).toBeNull();
    expect(uncoveredSale([orphan], [buy(ETH.id, '1')])).toBeNull();
    expect(uncoveredSale([orphan], [on('2026-02-01', sell(BTC.id, '0.001'))])).toEqual(short('0', '0.001'));
  });

  describe('imported data with a sale dated before its purchase', () => {
    const orphan = on('2026-01-15', sell(BTC.id, '0.001'));
    const entries = [orphan, on('2026-02-01', buy(BTC.id, '0.002')), buy(ETH.id, '1')];
    const edit = (changes: Partial<TransactionDraft>) =>
      failure(saveTransaction({ ...sale('0.001', '2026-01-15'), ...changes }, context({ entries, editing: [orphan] })));

    it('saves an edit of that sale that leaves its coverage as it was', () => {
      expect(edit({ note: 'moved to cold storage' })).toBeNull();
      expect(edit({ fee: money('2') })).toBeNull();
      expect(edit({ venue: 'Bitstamp' })).toBeNull();
      expect(edit({ rows: [{ coin: BTC.id, amount: money('90'), units: units('0.0015') }] })).toEqual(
        short('0', '0.0015'),
      );
    });

    it('refuses a new sale that would make the units sold exceed the units bought', () => {
      expect(failure(saveTransaction(sale('0.002'), context({ entries })))).toEqual(short('0.001', '0.002'));
      expect(failure(saveTransaction(sale('0.001'), context({ entries })))).toBeNull();
    });

    it('refuses a purchase edit that leaves the units sold above the units bought', () => {
      const bought = on('2026-02-01', buy(BTC.id, '0.002'));
      const stored = [orphan, bought, on('2026-03-01', sell(BTC.id, '0.001'))];
      const edited = saveTransaction(
        purchase(BTC.id, '0.001', '2026-02-01'),
        context({ entries: stored, editing: [bought] }),
      );
      expect(failure(edited)).toEqual(short('0', '0.001'));
    });

    it('refuses deleting one of two purchases when the other leaves the units sold above the units bought', () => {
      const first = on('2026-02-01', buy(BTC.id, '0.001'));
      const stored = [orphan, first, on('2026-02-01', buy(BTC.id, '0.001')), on('2026-03-01', sell(BTC.id, '0.001'))];
      expect(uncoveredSale(stored, deleteEntries(stored, [first.id], now))).toEqual(short('0', '0.001'));
      expect(uncoveredSale(stored, deleteEntries(stored, [orphan.id], now))).toBeNull();
    });

    it('refuses the undo of a sale once its purchase was edited down, which would sell more than was bought', () => {
      const bought = on('2026-02-01', buy(BTC.id, '0.003'));
      const sold = on('2026-03-01', sell(BTC.id, '0.002'));
      let stored = [orphan, bought, sold];
      const before = slotsAtDelete(plan, stored, [sold.id], now);
      stored = store(stored, deleteEntries(stored, before.ids, before.at));
      const edited = saveTransaction(
        purchase(BTC.id, '0.002', '2026-02-01'),
        context({ entries: stored, editing: [bought] }),
      );
      if (!edited.ok) throw new Error(edited.error.code);
      stored = store(stored, edited.value);
      // The restored sale is the step the undo leaves uncovered in total: 0.001 of the 0.002 bought is left for it.
      expect(restoreEntries(plan, stored, before.ids, before, later)).toEqual({
        ok: false,
        error: short('0.001', '0.002'),
      });
    });
  });
});

describe("a move's fee stays covered, its venues never refuse a write (docs/DOMAIN.md §3.7, §6; ADR-0055)", () => {
  const purchase = (quantity: string, venue: string, day = '2026-01-10') =>
    anEntry({
      kind: 'extra',
      slot: null,
      coin: BTC.id,
      date: date(day),
      units: units(quantity),
      amount: money('3000'),
      fee: null,
      note: '',
      venue,
    });
  const move = (from: string, to: string, received = '0.0498', sent = '0.05') =>
    aMove({ coin: BTC.id, date: date('2026-03-01'), units: units(sent), received: units(received), venue: from, to });
  type Changes = Partial<TransactionDraft> & { coin?: CoinId; quantity?: string };
  /** The Log form's edit of `stored`, with the fields it changes. */
  const edit = (stored: Entry, changes: Changes) => {
    const { coin = stored.coin, quantity = stored.units, ...fields } = changes;
    return draft({
      kind: 'extra',
      slot: null,
      date: stored.date,
      fee: null,
      note: stored.note,
      venue: stored.venue,
      rows: [{ coin, amount: money('3000'), units: units(quantity) }],
      ...fields,
    });
  };
  const store = (entries: readonly Entry[], written: readonly Entry[]) => {
    const ids = new Set(written.map((entry) => entry.id));
    return [...entries.filter((entry) => !ids.has(entry.id)), ...written];
  };
  /** The units left unmatched once the edit is stored, or its refusal. */
  const saved = (stored: Entry, entries: readonly Entry[], changes: Changes) => {
    const result = saveTransaction(edit(stored, changes), context({ entries, editing: [stored], ids: [id()] }));
    return result.ok ? matchLots(store(entries, result.value), BTC.id, 'global').unmatchedUnits : result.error;
  };
  /** The moves `movesLeftShort` names for the saved edit, under each lot scope. */
  const named = (stored: Entry, entries: readonly Entry[], changes: Changes) => {
    const result = saveTransaction(edit(stored, changes), context({ entries, editing: [stored], ids: [id()] }));
    if (!result.ok) throw new Error(result.error.code);
    return (['per-venue', 'global'] as const).map((lotScope) =>
      movesLeftShort(entries, result.value, { overrides: [], lotScope, lotRule: 'fifo' }).map((each) => each.id),
    );
  };
  const feeShort = (held: string) => ({
    code: 'fee-exceeds-held',
    coin: BTC.id,
    held,
    fee: '0.0002',
    date: '2026-03-01',
    written: false,
  });

  it("a purchase edit that changes its venue to a stored move's destination saves, leaves no unit unmatched, and movesLeftShort names the move", () => {
    const bought = purchase('0.10', 'Kraken');
    const moved = move('Kraken', 'Ledger');
    expect(saved(bought, [bought, moved], { venue: 'Ledger' })).toBe('0');
    // Its fee is then taken at Ledger: named in every country.
    expect(named(bought, [bought, moved], { venue: 'Ledger' })).toEqual([[moved.id], [moved.id]]);
  });

  it('a purchase edit that keeps its units and date (its note) beside a move imported short saves and names no move', () => {
    const bought = purchase('0.0001', 'Kraken');
    expect(saved(bought, [bought, move('Kraken', 'Ledger')], { note: 'from the bank' })).toBe('0.0001');
    expect(named(bought, [bought, move('Kraken', 'Ledger')], { note: 'from the bank' })).toEqual([[], []]);
  });

  it('a purchase edit that raises its units saves and names no move', () => {
    const bought = purchase('0.0001', 'Kraken');
    expect(saved(bought, [bought, move('Kraken', 'Ledger')], { quantity: '0.10' })).toBe('0');
    expect(named(bought, [bought, move('Kraken', 'Ledger')], { quantity: '0.10' })).toEqual([[], []]);
  });

  it('a purchase edit that moves its date after the move is refused with fee-exceeds-held: held 0, fee 0.0002, date 2026-03-01, never sell-exceeds-held', () => {
    const bought = purchase('0.10', 'Kraken');
    expect(saved(bought, [bought, move('Kraken', 'Ledger')], { date: date('2026-03-15') })).toEqual(feeShort('0'));
  });

  it("a purchase edit that changes its coin is refused with fee-exceeds-held for the old coin's move", () => {
    const bought = purchase('0.10', 'Kraken');
    expect(saved(bought, [bought, move('Kraken', 'Ledger')], { coin: ETH.id })).toEqual(feeShort('0'));
  });

  it('a venue renamed from "ledger" to "Ledger" that leaves a move to "Ledger" short saves, and movesLeftShort names it', () => {
    const bought = purchase('0.10', 'ledger');
    const moved = move('ledger', 'Ledger');
    expect(saved(bought, [bought, moved], { venue: 'Ledger' })).toBe('0');
    expect(named(bought, [bought, moved], { venue: 'Ledger' })).toEqual([[moved.id], [moved.id]]);
  });

  it('deleting the only purchase before a move is refused with fee-exceeds-held', () => {
    const bought = purchase('0.10', 'Kraken');
    const entries = [bought, move('Kraken', 'Ledger')];
    expect(uncoveredSale(entries, deleteEntries(entries, [bought.id], now))).toEqual(feeShort('0'));
  });

  it("the undo of a deleted sale that leaves a later move's fee beyond the units held is refused with fee-exceeds-held", () => {
    const bought = purchase('0.10', 'Kraken');
    const sold = anEntry({ kind: 'sell', slot: null, coin: BTC.id, date: date('2026-02-01'), units: units('0.10') });
    const before = slotsAtDelete(plan, [bought, sold], [sold.id], now);
    const deleted = store([bought, sold], deleteEntries([bought, sold], before.ids, before.at));
    const stored = [...deleted, move('Kraken', 'Ledger', '0.0998', '0.10')];
    const later = instant('2026-03-02T10:00:05Z');
    expect(restoreEntries(plan, stored, before.ids, before, later)).toEqual({ ok: false, error: feeShort('0') });
  });

  it('the undo of a deleted move whose fee a sale since then leaves without units is refused as the move it restores', () => {
    const bought = purchase('0.10', 'Kraken');
    const moved = move('Kraken', 'Ledger', '0.0998', '0.10');
    const before = slotsAtDelete(plan, [bought, moved], [moved.id], now);
    const deleted = store([bought, moved], deleteEntries([bought, moved], before.ids, before.at));
    const sold = anEntry({ kind: 'sell', slot: null, coin: BTC.id, date: date('2026-02-01'), units: units('0.10') });
    const later = instant('2026-03-02T10:00:05Z');
    expect(restoreEntries(plan, [...deleted, sold], before.ids, before, later)).toEqual({
      ok: false,
      error: { ...feeShort('0'), written: true },
    });
  });
});

describe('a refusal names the step the write made worse (docs/DOMAIN.md §3.7, §6; ADR-0055)', () => {
  const at = (day: string, quantity: string, overrides: Partial<Entry> = {}) =>
    anEntry({
      kind: 'extra',
      slot: null,
      coin: BTC.id,
      date: date(day),
      units: units(quantity),
      venue: 'Kraken',
      ...overrides,
    });
  const sold = (day: string, quantity: string) => at(day, quantity, { kind: 'sell' });
  /** A move Kraken→Ledger whose fee is `sent` less `received`. */
  const moved = (day: string, sent: string, received: string) =>
    aMove({
      coin: BTC.id,
      date: date(day),
      units: units(sent),
      received: units(received),
      venue: 'Kraken',
      to: 'Ledger',
    });
  const deleting = (entries: readonly Entry[], entry: Entry) =>
    uncoveredSale(entries, deleteEntries(entries, [entry.id], now));
  const saleShort = (held: string, quantity: string) => ({
    code: 'sell-exceeds-held',
    coin: BTC.id,
    held,
    sold: quantity,
  });
  const feeShort = (held: string, fee: string, day: string) => ({
    code: 'fee-exceeds-held',
    coin: BTC.id,
    held,
    fee,
    date: day,
    written: false,
  });

  // The refuter's case: a move imported short before a purchase that covers a later sale.
  const shortMove = [at('2026-01-01', '0.0001'), moved('2026-03-01', '0.01', '0.009')];
  const purchase = at('2026-04-01', '0.5');
  const sale = sold('2026-05-01', '0.4');

  it('deleting a purchase after a move imported short names the sale it covers, never the move', () => {
    const entries = [...shortMove, purchase, sale];
    expect(uncoveredSale(entries, [])).toBeNull();
    expect(deleting(entries, purchase)).toEqual(saleShort('0', '0.4'));
  });

  it('a purchase edit after a move imported short that leaves the sale short names the sale', () => {
    const entries = [...shortMove, purchase, sale];
    const edit = draft({ kind: 'extra', slot: null, date: purchase.date, fee: null, venue: 'Kraken' });
    const rows = [{ coin: BTC.id, amount: money('3000'), units: units('0.1') }];
    const result = saveTransaction({ ...edit, rows }, context({ entries, editing: [purchase], ids: [id()] }));
    expect(result.ok ? null : result.error).toEqual(saleShort('0.1', '0.4'));
  });

  it("a delete that leaves only a move's fee short names the move, never a sale imported short before it", () => {
    const entries = [
      at('2026-01-01', '0.0001'),
      sold('2026-02-01', '0.5'),
      purchase,
      moved('2026-05-01', '0.1', '0.0998'),
    ];
    expect(deleting(entries, purchase)).toEqual(feeShort('0', '0.0002', '2026-05-01'));
  });

  it("a delete that leaves a move's fee and a later sale short names the move, the first of them", () => {
    const entries = [purchase, moved('2026-05-01', '0.1', '0.0998'), sold('2026-06-01', '0.05')];
    expect(deleting(entries, purchase)).toEqual(feeShort('0', '0.0002', '2026-05-01'));
  });

  it('a delete that leaves a sale imported short before it uncovered in total names that sale', () => {
    const early = sold('2026-01-01', '0.1');
    expect(deleting([early, purchase], purchase)).toEqual(saleShort('0', '0.1'));
  });

  it("a delete that leaves a move's fee imported short before it uncovered in total names that move", () => {
    const early = moved('2026-01-01', '0.1', '0.0998');
    expect(deleting([early, purchase], purchase)).toEqual(feeShort('0', '0.0002', '2026-01-01'));
  });
});
