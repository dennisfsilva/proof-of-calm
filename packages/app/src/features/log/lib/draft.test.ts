import type { Entry, Price, PriceSnapshot } from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, id, instant, money, month, split, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { draftBase, draftEntity, EntryFormDraftSchema, replayTyped, restoredState, sameForm } from './draft';
import { editRow, type FormContext, type FormState, initialState, saveOn, toDraft } from './form';

const en = createNumberInput('en-GB');
const prices: PriceSnapshot = {
  at: instant('2026-10-20T09:59:30.000Z'),
  prices: { BTC: { EUR: '60000.12' as Price } } as PriceSnapshot['prices'],
};
const september = anEntry({
  date: date('2026-09-01'),
  slot: month('2026-09'),
  fee: money('0.70'),
  venue: 'Wallet A',
  createdAt: instant('2026-09-01T09:00:00+01:00'),
});
const august = anEntry({ date: date('2026-08-01'), slot: month('2026-08'), fee: money('2'), venue: 'Wallet B' });
const context = (overrides: Partial<FormContext> = {}): FormContext => ({
  plan: aPlan(),
  entries: [august, september],
  today: date('2026-10-20'),
  prices,
  numberInput: en,
  ...overrides,
});

describe('the session draft', () => {
  it('keys a new transaction by its kind and month, and an edit by the sorted ids of its entries', () => {
    expect(draftEntity(initialState('dca', [], undefined, context()), [])).toBe('new:dca:2026-10');
    expect(draftEntity(initialState('extra', [], undefined, context()), [])).toBe('new:extra:none');
    const [first, second] = [august, september].sort((a, b) => (a.id < b.id ? -1 : 1)) as [Entry, Entry];
    expect(draftEntity(initialState('dca', [second, first], undefined, context()), [second, first])).toBe(
      `${first.id},${second.id}`,
    );
  });

  it('reads back a draft stored as JSON, and refuses one in another shape', () => {
    const opened = initialState('dca', [], undefined, context());
    const state = editRow(opened, 1, 'amount', '30.5', en, 'EUR');
    const draft = { numberLocale: 'en-GB', base: '', opened, state };
    expect(EntryFormDraftSchema.safeParse(JSON.parse(JSON.stringify(draft)))).toEqual({ success: true, data: draft });
    const foreign = { ...draft, state: { ...state, rows: [{ ...state.rows[0], derived: 'fee' }] } };
    expect(EntryFormDraftSchema.safeParse(foreign).success).toBe(false);
  });

  // Session 12 (#111): a draft stored before it kept the form as opened cannot tell typed fields from defaults.
  it('refuses a draft without the form as it opened', () => {
    const state = initialState('dca', [], undefined, context());
    expect(EntryFormDraftSchema.safeParse({ numberLocale: 'en-GB', base: '', state }).success).toBe(false);
  });

  it('reads two forms as the same when no field the person can change differs', () => {
    const opened = initialState('extra', [], undefined, context());
    const tidied = { ...opened, rows: opened.rows.map((row) => ({ ...row })) };
    expect(sameForm(tidied, opened)).toBe(true);
    expect(
      sameForm({ ...opened, rows: opened.rows.map((row) => ({ ...row, derived: 'units' as const })) }, opened),
    ).toBe(true);
    expect(sameForm({ ...opened, note: 'typed' }, opened)).toBe(false);
    expect(sameForm({ ...opened, date: '2026-10-18' }, opened)).toBe(false);
    expect(sameForm(editRow(opened, 0, 'amount', '120', en, 'EUR'), opened)).toBe(false);
    expect(sameForm({ ...opened, rows: opened.rows.slice(1) }, opened)).toBe(false);
  });

  describe('restoredState', () => {
    const initial = initialState('extra', [], undefined, context());
    const state: FormState = { ...initial, note: 'typed' };
    const fits = { numberLocale: 'en-GB', base: '', initial, numberInput: en, currency: 'EUR' } as const;
    const typedOver = (typed: FormState, opened = initial) => ({
      numberLocale: 'en-GB',
      base: '',
      opened,
      state: typed,
    });

    it('restores a draft typed in the same number locale and drops one typed in another', () => {
      expect(restoredState(typedOver(state), fits)).toEqual(state);
      expect(restoredState({ ...typedOver(state), numberLocale: 'pt-PT' }, fits)).toBeNull();
      expect(restoredState(null, fits)).toBeNull();
    });

    it('drops a draft that reads as the form opened', () => {
      expect(restoredState(typedOver({ ...initial, rows: initial.rows.map((row) => ({ ...row })) }), fits)).toBeNull();
    });

    // Session 11's review (#104): a restored edit gave the stale value of a field the person never touched to the save.
    it('drops the draft of an edit once one of its entries was written since', () => {
      const edited = initialState('dca', [september], undefined, context());
      const draft = { ...typedOver({ ...edited, fee: '1.00' }, edited), base: draftBase([september]) };
      const now = { ...fits, initial: edited };
      expect(restoredState(draft, { ...now, base: draftBase([september]) })).toEqual(draft.state);
      const written = { ...september, note: 'changed elsewhere', updatedAt: instant('2026-10-20T11:00:00+01:00') };
      expect(restoredState(draft, { ...now, base: draftBase([written]) })).toBeNull();
    });

    // Session 11's review (#104): an ETH row came back after the plan dropped ETH, and the save refused it every time.
    it('drops a draft whose rows are not the coins the form now opens with', () => {
      const btcOnly = aPlan({ coins: [BTC], split: split({ BTC: '100' }) });
      const now = initialState('extra', [], undefined, context({ plan: btcOnly }));
      expect(restoredState(typedOver(state), { ...fits, initial: now })).toBeNull();
    });

    // Session 11's review round 2 (#104): a new entry's draft brought back every field the person left alone, so a
    // plan amount raised from 100 to 200 still showed and saved BTC paid 70.00.
    it("gives the fields the person left alone the form's values as it opens now", () => {
      const opened = initialState('dca', [], undefined, context());
      const fresh = initialState('dca', [], undefined, context({ plan: aPlan({ monthlyAmount: money('200') }) }));
      const restored = restoredState(typedOver({ ...opened, note: 'typed' }, opened), { ...fits, initial: fresh });
      expect(restored?.rows[0]?.amount).toBe('140.00');
      expect(restored).toEqual({ ...fresh, note: 'typed' });
    });

    it('keeps a typed amount while an untouched price takes the live price now, and derives the units again', () => {
      const typed = editRow(initial, 0, 'amount', '120.00', en, 'EUR');
      const cheaper = { ...prices, prices: { BTC: { EUR: '50000' as Price } } as PriceSnapshot['prices'] };
      const fresh = initialState('extra', [], undefined, context({ prices: cheaper }));
      const [btc] = restoredState(typedOver(typed), { ...fits, initial: fresh })?.rows ?? [];
      expect(btc).toMatchObject({ amount: '120.00', price: '50,000.00', units: '0.0024', derived: 'units' });
    });

    it('opens on the default date now unless the person changed the date', () => {
      const later = initialState('extra', [], undefined, context({ today: date('2026-10-22') }));
      expect(restoredState(typedOver(state), { ...fits, initial: later })?.date).toBe('2026-10-22');
      const dated = { ...state, date: '2026-10-18' };
      expect(restoredState(typedOver(dated), { ...fits, initial: later })?.date).toBe('2026-10-18');
    });

    // Session 12a (#350): the price a form fills is the opening day's; a draft dated earlier brought it back filled.
    it('shows no filled price in a draft dated before the day the form opens on', () => {
      const typed = { ...editRow(initial, 0, 'amount', '120.00', en, 'EUR'), date: '2026-10-18' };
      const [btc] = restoredState(typedOver(typed), fits)?.rows ?? [];
      expect(btc).toMatchObject({ amount: '120.00', units: '', price: '', derived: 'units' });
      const monthly = initialState('dca', [], undefined, context());
      const [planned] =
        restoredState(typedOver({ ...monthly, date: '2026-10-01' }, monthly), { ...fits, initial: monthly })?.rows ??
        [];
      expect(planned).toMatchObject({ amount: '70.00', units: '', price: '' });
    });

    it('keeps typed units and derives the price from them and the amount the form opens with now', () => {
      const opened = initialState('dca', [], undefined, context());
      const typed = editRow(opened, 0, 'units', '0.002', en, 'EUR');
      const fresh = initialState('dca', [], undefined, context({ plan: aPlan({ monthlyAmount: money('200') }) }));
      const [btc] = restoredState(typedOver(typed, opened), { ...fits, initial: fresh })?.rows ?? [];
      expect(btc).toMatchObject({ amount: '140.00', units: '0.002', price: '70,000.00', derived: 'price' });
    });

    it('fills a derived amount again from typed units and the price the form opens with now', () => {
      const typed = editRow(initial, 0, 'units', '0.002', en, 'EUR');
      expect(typed.rows[0]).toMatchObject({ amount: '120.00', derived: 'amount' });
      const cheaper = { ...prices, prices: { BTC: { EUR: '50000' as Price } } as PriceSnapshot['prices'] };
      const fresh = initialState('extra', [], undefined, context({ prices: cheaper }));
      const [btc] = restoredState(typedOver(typed), { ...fits, initial: fresh })?.rows ?? [];
      expect(btc).toMatchObject({ amount: '100.00', units: '0.002', price: '50,000.00', derived: 'amount' });
    });

    // Session 12a's review (#356): units typed before the live price loaded came back beside it with no amount, and
    // the save refused the row (amount-and-units) where the live form fills 120.00.
    it('fills the amount of units typed before the live price loaded from the price the form opens with now', () => {
      const unpriced = initialState('extra', [], undefined, context({ prices: null }));
      const typed = editRow(unpriced, 0, 'units', '0.002', en, 'EUR');
      expect(typed.rows[0]).toMatchObject({ amount: '', units: '0.002', price: '', derived: null });
      const restored = restoredState(typedOver(typed, unpriced), fits);
      expect(restored?.rows[0]).toMatchObject({
        amount: '120.00',
        units: '0.002',
        price: '60,000.12',
        derived: 'amount',
      });
      if (restored === null) throw new Error('no restored form');
      const draft = toDraft(restored, en);
      if (!draft.ok) throw new Error('unreadable draft');
      expect(draft.value.rows[0]).toEqual({ coin: BTC.id, entry: null, amount: money('120'), units: units('0.002') });
      const now = instant('2026-10-20T10:00:00.000Z');
      const form = {
        plan: aPlan(),
        editing: [],
        ids: [id()],
        now,
        source: 'manual' as const,
        initial,
        current: restored,
      };
      const saved = saveOn([august, september], draft.value, form);
      expect(saved?.ok && saved.value).toEqual([
        expect.objectContaining({ coin: BTC.id, amount: '120', units: '0.002' }),
      ]);
    });

    it('derives the units of an amount typed before the live price loaded at the price the form opens with now', () => {
      const unpriced = initialState('extra', [], undefined, context({ prices: null }));
      const typed = editRow(unpriced, 0, 'amount', '120', en, 'EUR');
      expect(typed.rows[0]).toMatchObject({ amount: '120', units: '', price: '', derived: null });
      const [btc] = restoredState(typedOver(typed, unpriced), fits)?.rows ?? [];
      const [live] = editRow(initial, 0, 'amount', '120', en, 'EUR').rows;
      expect(live).toMatchObject({ amount: '120', units: '0.00199999', price: '60,000.12', derived: 'units' });
      expect(btc).toEqual(live);
    });

    it('keeps a row whose three typed fields fill nothing as typed', () => {
      const unpriced = initialState('extra', [], undefined, context({ prices: null }));
      const three = { amount: '100', units: '0.002', price: '40,000.00', derived: null };
      const typed = { ...unpriced, rows: unpriced.rows.map((row, at) => (at === 0 ? { ...row, ...three } : row)) };
      const [btc] = restoredState(typedOver(typed, unpriced), fits)?.rows ?? [];
      expect(btc).toMatchObject(three);
    });
  });

  describe('replayTyped', () => {
    const opened = initialState('dca', [], undefined, context());
    const fresh = initialState('dca', [], undefined, context({ entries: [] }));

    it('keeps a typed fee and gives an untouched venue its value now', () => {
      expect(opened).toMatchObject({ fee: '0.70', venue: 'Wallet A' });
      const replayed = replayTyped(opened, { ...opened, fee: '1.00' }, fresh, en, 'EUR');
      expect(replayed).toMatchObject({ fee: '1.00', venue: '' });
    });

    it('leaves a derived field empty where no fill backs it', () => {
      const typed = editRow(opened, 0, 'amount', '', en, 'EUR');
      const [btc] = replayTyped(opened, typed, fresh, en, 'EUR').rows;
      expect(btc).toMatchObject({ amount: '', units: '', price: '60,000.12', derived: 'units' });
    });
  });
});
