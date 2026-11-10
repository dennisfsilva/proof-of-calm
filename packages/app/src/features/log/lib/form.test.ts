import {
  type Coin,
  type CoinId,
  type Entry,
  isPositive,
  type Money,
  PRICE_FIGURES,
  type Price,
  type PriceSnapshot,
  quotientSignificant,
  round,
  saveTransaction,
  type Units,
  unitsFor,
  valueAt,
} from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, ETH, id, instant, money, month, split, units } from '@proofofcalm/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFormatters, createNumberInput } from '../../../lib/format';
import {
  actionMessage,
  changedFields,
  detailFieldOf,
  editedVenues,
  editRow,
  type FormContext,
  type FormState,
  initialState,
  keepUnchanged,
  proseDigits,
  saveOn,
  toDraft,
} from './form';

const en = createNumberInput('en-GB');
const pt = createNumberInput('pt-PT');
const plan = aPlan();
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
  plan,
  entries: [august, september],
  today: date('2026-10-20'),
  prices,
  numberInput: en,
  ...overrides,
});

describe('initialState', () => {
  it('opens a monthly buy on the focus slot with the last fee, the last venue and the planned parts', () => {
    const state = initialState('dca', [], undefined, context());
    expect(state).toMatchObject({ kind: 'dca', date: '2026-10-20', slot: '2026-10', fee: '0.70', venue: 'Wallet A' });
    expect(state.rows).toEqual([
      {
        source: null,
        coin: 'BTC',
        decimals: 8,
        amount: '70.00',
        units: '0.00116666',
        price: '60,000.12',
        derived: 'units',
      },
      { source: null, coin: 'ETH', decimals: 6, amount: '30.00', units: '', price: '', derived: null },
    ]);
  });

  // DOMAIN §2.2: coins the plan did not buy have no date, venue, fee or price to assume, and their cost may be unknown.
  it('a held transaction opens with no date, no venue, no fee and no filled price', () => {
    const state = initialState('held', [], undefined, context());
    expect(state).toEqual({
      kind: 'held',
      date: '',
      slot: null,
      fee: '',
      venue: '',
      note: '',
      rows: [
        { source: null, coin: 'BTC', decimals: 8, amount: '', units: '', price: '', derived: null },
        { source: null, coin: 'ETH', decimals: 6, amount: '', units: '', price: '', derived: null },
      ],
    });
  });

  // A wallet's or an old exchange's name never becomes a new purchase's or a sale's venue.
  it('takes the venue of the latest entry that is not coins added', () => {
    const ledger = anEntry({ kind: 'held', date: date('2026-10-01'), slot: null, fee: null, venue: 'Ledger' });
    const entries = [august, september, ledger];
    expect(initialState('extra', [], undefined, context({ entries })).venue).toBe('Wallet A');
    expect(initialState('sell', [], undefined, context({ entries })).venue).toBe('Wallet A');
  });

  it('takes the nearest open slot before the plan starts, and a slot it is given', () => {
    const later = context({ plan: aPlan({ firstBuy: date('2026-11-01') }), entries: [] });
    expect(initialState('dca', [], undefined, later)).toMatchObject({ slot: '2026-11', fee: '', venue: '' });
    expect(initialState('dca', [], month('2026-12'), later).slot).toBe('2026-12');
    expect(initialState('extra', [], month('2026-12'), later).slot).toBeNull();
  });

  it('offers only the coins held for a sale, every plan coin when nothing is held', () => {
    expect(initialState('sell', [], undefined, context()).rows.map((row) => row.coin)).toEqual(['BTC']);
    expect(initialState('sell', [], undefined, context({ entries: [] })).rows.map((row) => row.coin)).toEqual([
      'BTC',
      'ETH',
    ]);
  });

  // saveTransaction takes any coin that has entries (DOMAIN §3.6, §6), so a held coin outside the plan can be sold.
  it('offers every held coin for a sale, the plan coins first and then the others as they appear', () => {
    const extra = (coin: string, day: string, unitsBought: string) =>
      anEntry({ kind: 'extra', coin: coin as CoinId, date: date(day), slot: null, units: units(unitsBought) });
    const sol = extra('SOL', '2026-09-02', '3');
    const ada = extra('ADA', '2026-09-03', '10');
    const soldOut = extra('DOT', '2026-09-04', '1');
    const sale = anEntry({ kind: 'sell', coin: soldOut.coin, date: date('2026-09-05'), slot: null, units: units('1') });
    const entries = [ada, september, sol, soldOut, sale];
    const rows = initialState('sell', [], undefined, context({ entries, prices: null })).rows;
    expect(rows.map((row) => row.coin)).toEqual(['BTC', 'ADA', 'SOL']);
    expect(rows[2]).toEqual({
      source: null,
      coin: 'SOL',
      decimals: 10,
      amount: '',
      units: '',
      price: '',
      derived: null,
    });
    const repro = initialState('sell', [], undefined, context({ entries: [september, sol], prices: null }));
    expect(repro.rows.map((row) => row.coin)).toEqual(['BTC', 'SOL']);
  });

  it('prices an extra buy at the live price and leaves a sale unpriced', () => {
    const [btc] = initialState('extra', [], undefined, context()).rows;
    expect(btc).toMatchObject({ amount: '', units: '', price: '60,000.12' });
    expect(initialState('sell', [], undefined, context()).rows[0]?.price).toBe('');
  });

  // A live price derived from another currency carries every digit of the division; the field shows it
  // at the currency's minor unit, as an edit's implied price does, and the units come from what it shows.
  it('rounds a live price to the minor unit half-even and derives the units from the rounded price', () => {
    const long: PriceSnapshot = {
      ...prices,
      prices: { BTC: { EUR: '73732.759060663' as Price } } as PriceSnapshot['prices'],
    };
    const [btc] = initialState('dca', [], undefined, context({ prices: long })).rows;
    expect(btc).toMatchObject({
      price: '73,732.76',
      units: en.format(unitsFor(money('70'), '73732.76' as Price, 8)),
      derived: 'units',
    });
  });

  // At the minor unit alone a coin priced under half a cent would fill as 0 and divide by it; the price keeps
  // PRICE_FIGURES significant figures instead, and the units still come from the price the field shows.
  it('keeps the significant figures of a live price under a cent and derives positive units from it', () => {
    const coin = (id: string, decimals: number): Coin => ({ id: id as CoinId, name: id, geckoId: id, decimals });
    const tiny = aPlan({
      coins: [BTC, coin('PEPE', 0), coin('XLM', 2)],
      split: split({ BTC: '50', PEPE: '20', XLM: '30' }),
    });
    const live: PriceSnapshot = {
      ...prices,
      prices: {
        BTC: { EUR: '73732.759060663' as Price },
        PEPE: { EUR: '0.0000123' as Price },
        XLM: { EUR: '0.2734' as Price },
      } as PriceSnapshot['prices'],
    };
    const [btc, pepe, xlm] = initialState('dca', [], undefined, context({ plan: tiny, prices: live })).rows;
    expect(btc).toMatchObject({ price: '73,732.76', units: en.format(unitsFor(money('50'), '73732.76' as Price, 8)) });
    expect(pepe).toMatchObject({
      price: en.format('0.0000123' as Price, 2),
      units: en.format(unitsFor(money('20'), '0.0000123' as Price, 0)),
      derived: 'units',
    });
    expect(pepe?.units).toBe('1,626,016');
    expect(xlm).toMatchObject({ price: '0.2734', units: '109.72', derived: 'units' });
    expect(initialState('extra', [], undefined, context({ plan: tiny, prices: live })).rows[1]?.price).toBe(
      en.format('0.0000123' as Price, 2),
    );
  });

  // The price is implied by the stored amount and units, so a new amount keeps the units.
  it('fills an edit from its entries, with the implied price and their fees summed', () => {
    const state = initialState('extra', [september], undefined, context({ numberInput: pt }));
    expect(state).toMatchObject({ kind: 'dca', date: '2026-09-01', slot: '2026-09', fee: '0,70', venue: 'Wallet A' });
    expect(state.rows).toEqual([
      {
        source: september.id,
        coin: 'BTC',
        decimals: 8,
        amount: '70,00',
        units: '0,001',
        price: '70 000,00',
        derived: 'price',
      },
    ]);
  });

  // The session-16 carry-over (#10): a grouped edit at two venues showed the first one's, as if both were there. Its
  // Venue field opens empty, so a save keeps each entry's own until a venue is typed for all (`keepUnchanged`).
  it('opens a grouped edit with the Venue field empty when its entries were at different venues', () => {
    const at = (venue: string | null) => anEntry({ kind: 'sell', slot: null, date: date('2026-04-01'), venue });
    const venueOf = (...editing: Entry[]) => initialState('sell', editing, undefined, context()).venue;
    expect(venueOf(at('Bitvavo'), at('Ledger'))).toBe('');
    expect(venueOf(at('Bitvavo'), at('Bitvavo'), at('Ledger'))).toBe('');
    expect(venueOf(at('Bitvavo'), at(null))).toBe('');
    expect(venueOf(at('Bitvavo'), at('Bitvavo'))).toBe('Bitvavo');
    expect(venueOf(at(null), at(null))).toBe('');
    expect(editedVenues([at('Bitvavo'), at(null), at('Ledger'), at('Bitvavo'), at(null)])).toEqual({
      named: ['Bitvavo', 'Ledger'],
      unnamed: 2,
    });
    expect(editedVenues([at('Bitvavo'), at('Bitvavo')])).toBeNull();
  });

  // Coins held may carry no recorded cost (DOMAIN §2.2): the edit shows an empty amount and no implied price.
  it('fills an edit of coins held with no cost with an empty amount and an empty price', () => {
    const held = anEntry({ kind: 'held', slot: null, fee: null, amount: null, units: units('0.5') });
    const state = initialState('extra', [held], undefined, context());
    expect(state).toMatchObject({ kind: 'held', fee: '' });
    expect(state.rows).toEqual([
      { source: held.id, coin: 'BTC', decimals: 8, amount: '', units: '0.5', price: '', derived: 'price' },
    ]);
  });

  // At the minor unit alone 10 € for 813,008 PEPE implies 0.00; the price keeps PRICE_FIGURES significant figures,
  // in an edit as in a row whose units are typed (DOMAIN §6).
  it('implies the price of a coin under a cent at its significant figures, in an edit and as units are typed', () => {
    const pepe: Coin = { id: 'PEPE' as CoinId, name: 'PEPE', geckoId: 'pepe', decimals: 0 };
    const tiny = aPlan({ coins: [BTC, pepe], split: split({ BTC: '50', PEPE: '50' }) });
    const bought = anEntry({ coin: pepe.id, amount: money('10'), units: units('813008'), slot: month('2026-09') });
    const shown = en.format('0.0000123' as Price, 2);
    expect(initialState('extra', [bought], undefined, context({ plan: tiny })).rows[0]).toMatchObject({
      price: shown,
      derived: 'price',
    });
    const blank = initialState('extra', [], undefined, context({ plan: tiny, prices: null }));
    const typed = editRow(editRow(blank, 1, 'amount', '10', en, 'EUR'), 1, 'units', '813,008', en, 'EUR');
    expect(typed.rows[1]).toMatchObject({ price: shown, derived: 'price' });
  });
});

describe('editRow', () => {
  const start = initialState('extra', [], undefined, context({ prices: null }));

  it('fills the units from the price as the amount is typed', () => {
    const priced = editRow(start, 0, 'price', '50,000', en, 'EUR');
    expect(editRow(priced, 0, 'amount', '100', en, 'EUR').rows[0]).toMatchObject({
      amount: '100',
      units: '0.002',
      derived: 'units',
    });
  });

  // Units filled from the live price are derived (DOMAIN §6): a new amount recomputes them, never the price.
  it('recomputes the units of a live-price row as its amount changes, and keeps the live price', () => {
    const live = initialState('dca', [], undefined, context());
    const at100 = editRow(live, 0, 'amount', '100', en, 'EUR');
    expect(at100.rows[0]).toMatchObject({ amount: '100', units: '0.00166666', price: '60,000.12', derived: 'units' });
    const at200 = editRow(at100, 0, 'amount', '200', en, 'EUR');
    expect(at200.rows[0]).toMatchObject({ amount: '200', units: '0.00333332', price: '60,000.12', derived: 'units' });
    const unpriced = editRow(editRow(at200, 0, 'price', '', en, 'EUR'), 0, 'amount', '300', en, 'EUR');
    expect(unpriced.rows[0]).toMatchObject({ amount: '300', units: '', price: '', derived: 'units' });
  });

  it('keeps typed units when the amount changes after the price was derived from them', () => {
    const typed = editRow(editRow(start, 0, 'units', '0.5', en, 'EUR'), 0, 'amount', '1', en, 'EUR');
    expect(typed.rows[0]).toMatchObject({ units: '0.5', price: '2.00', derived: 'price' });
    expect(editRow(typed, 0, 'amount', '100', en, 'EUR').rows[0]).toMatchObject({ units: '0.5', price: '200.00' });
  });

  // Review rounds 1 and 3: a new amount after the units were cleared neither fills the units from the derived price
  // nor leaves that price standing for units nobody typed; it blanks the price until the units read again.
  it('blanks the price a new amount no longer backs once the units were cleared, and recomputes it from new units', () => {
    const typed = editRow(editRow(start, 0, 'units', '0.5', en, 'EUR'), 0, 'amount', '1', en, 'EUR');
    const cleared = editRow(typed, 0, 'units', '', en, 'EUR');
    expect(cleared.rows[0]).toMatchObject({ units: '', price: '2.00', derived: 'price' });
    const blanked = editRow(cleared, 0, 'amount', '100', en, 'EUR');
    expect(blanked.rows[0]).toMatchObject({ amount: '100', units: '', price: '', derived: 'price' });
    expect(editRow(blanked, 0, 'units', '0.25', en, 'EUR').rows[0]).toMatchObject({
      units: '0.25',
      price: '400.00',
      derived: 'price',
    });
    expect(editRow(cleared, 0, 'units', '0.25', en, 'EUR').rows[0]).toMatchObject({
      units: '0.25',
      price: '4.00',
      derived: 'price',
    });
  });

  type Edit = readonly [field: 'amount' | 'units' | 'price', typed: string];
  const typeIn = (edits: readonly Edit[], input = en) =>
    edits.reduce((at, [field, typed]) => editRow(at, 0, field, typed, input, 'EUR'), start).rows[0];

  // Review round 2: a new amount below 1 passes through "0" ("0," in pt-PT) on its way.
  it('keeps the units the person typed while a new amount passes through zero', () => {
    const through = (texts: readonly string[]): Edit[] => texts.map((text) => ['amount', text]);
    expect(typeIn([['units', '0.5'], ['amount', '1'], ...through(['0', '0.7', '0.75'])])).toMatchObject({
      amount: '0.75',
      units: '0.5',
      price: '1.50',
      derived: 'price',
    });
    expect(typeIn([['units', '0,5'], ['amount', '1'], ...through(['0,', '0,7', '0,75'])], pt)).toMatchObject({
      amount: '0,75',
      units: '0,5',
      price: '1,50',
      derived: 'price',
    });
  });

  it('recomputes the derived field after a source is deleted and typed again', () => {
    const retyped = ['10', '1', '', '2', '20', '200'].map((text): Edit => ['amount', text]);
    expect(typeIn([['units', '0.5'], ['amount', '100'], ...retyped])).toMatchObject({
      amount: '200',
      units: '0.5',
      price: '400.00',
      derived: 'price',
    });
    expect(typeIn([['price', '50,000'], ['amount', '100'], ...retyped])).toMatchObject({
      amount: '200',
      units: '0.004',
      price: '50,000',
      derived: 'units',
    });
  });

  // A source that fills nothing pauses the derivation; only an edit of the derived field ends it.
  it('pauses the derivation while a source is empty, zero or unreadable, and ends it on the derived field', () => {
    const cases: readonly (readonly [Edit[], Record<string, string | null>])[] = [
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['amount', ''],
        ],
        { units: '0.5', price: '2.00', derived: 'price' },
      ],
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['amount', '1,2,3'],
        ],
        { units: '0.5', price: '2.00', derived: 'price' },
      ],
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['units', '0'],
        ],
        { units: '0', price: '2.00', derived: 'price' },
      ],
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['units', '0.25'],
        ],
        { units: '0.25', price: '4.00', derived: 'price' },
      ],
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['price', '4'],
        ],
        { units: '0.25', price: '4', derived: 'units' },
      ],
      [
        [
          ['units', '0.5'],
          ['amount', '1'],
          ['price', ''],
        ],
        { units: '0.5', price: '', derived: null },
      ],
      [
        [
          ['price', '50,000'],
          ['amount', '100'],
          ['price', ''],
        ],
        { units: '0.002', price: '', derived: 'units' },
      ],
      [
        [
          ['price', '50,000'],
          ['amount', '100'],
          ['price', ''],
          ['amount', '200'],
        ],
        { units: '', price: '', derived: 'units' },
      ],
      [
        [
          ['price', '50,000'],
          ['amount', '100'],
          ['price', ''],
          ['price', '40,000'],
        ],
        { units: '0.0025', price: '40,000', derived: 'units' },
      ],
      [
        [
          ['price', '50,000'],
          ['amount', '100'],
          ['amount', '200'],
        ],
        { units: '0.004', derived: 'units' },
      ],
    ];
    for (const [edits, expected] of cases) expect(typeIn(edits), JSON.stringify(edits)).toMatchObject(expected);
  });

  it('never marks the field just typed, and shows the fill whenever both sources of the marked one read', () => {
    const read = <T extends Money | Units | Price>(text: string): T | null => {
      const parsed = text.trim() === '' ? null : en.parse<T>(text);
      return parsed?.ok && isPositive(parsed.value) ? parsed.value : null;
    };
    const edit = fc.tuple(
      fc.constantFrom('amount', 'units', 'price'),
      fc.constantFrom('', '0', '1', '0.5', '2.5', '100', '50,000', '0.00000001', '1,2,3'),
    );
    fc.assert(
      fc.property(fc.array(edit, { maxLength: 12 }), (edits) => {
        let state = start;
        for (const [field, typed] of edits) {
          state = editRow(state, 0, field, typed, en, 'EUR');
          const row = state.rows[0] as FormState['rows'][number];
          expect(row.derived).not.toBe(field);
          const amount = read<Money>(row.amount);
          if (row.derived === 'price') {
            const of = read<Units>(row.units);
            if (amount !== null && of !== null) {
              expect(row.price).toBe(
                en.format(quotientSignificant<Price>(amount, of, PRICE_FIGURES, 2, 'half-even'), 2),
              );
            }
          }
          if (row.derived === 'units') {
            const at = read<Price>(row.price);
            if (amount !== null && at !== null) {
              expect(row.units).toBe(en.format(unitsFor(amount, at, row.decimals)));
            }
          }
          if (row.derived === 'amount') {
            const [of, at] = [read<Units>(row.units), read<Price>(row.price)];
            if (of !== null && at !== null) {
              const paid = round(valueAt(of, at), 2, 'half-even');
              expect(row.amount).toBe(isPositive(paid) ? en.format(paid, 2) : '');
            }
          }
        }
      }),
    );
  });

  it('keeps the text while it cannot be read, and touches no other row', () => {
    const state = editRow(start, 1, 'amount', '1,2,3', en, 'EUR');
    expect(state.rows[1]).toMatchObject({ amount: '1,2,3', units: '', price: '' });
    expect(state.rows[0]).toBe(start.rows[0]);
  });

  // Units typed beside the live price filled nothing, and the save refused the row: "Type two of the three" now holds.
  it('fills the amount from units typed beside the live price, and an amount typed after them derives the price', () => {
    const filled = editRow(initialState('extra', [], undefined, context()), 0, 'units', '0.002', en, 'EUR');
    expect(filled.rows[0]).toMatchObject({ amount: '120.00', units: '0.002', price: '60,000.12', derived: 'amount' });
    expect(editRow(filled, 0, 'amount', '130', en, 'EUR').rows[0]).toMatchObject({
      amount: '130',
      units: '0.002',
      price: '65,000.00',
      derived: 'price',
    });
  });

  it('pauses a derived amount while a source fills nothing, and empties it when one source reads alone or it rounds to 0', () => {
    const filled: Edit[] = [
      ['price', '2'],
      ['units', '1'],
    ];
    const cases: readonly (readonly [Edit[], Record<string, string | null>])[] = [
      [filled, { amount: '2.00', units: '1', price: '2', derived: 'amount' }],
      [[...filled, ['units', '']], { amount: '2.00', units: '', derived: 'amount' }],
      [[...filled, ['price', '0']], { amount: '2.00', price: '0', derived: 'amount' }],
      [[...filled, ['price', ''], ['units', '3']], { amount: '', units: '3', price: '', derived: 'amount' }],
      [[...filled, ['price', ''], ['units', '3'], ['price', '2']], { amount: '6.00', derived: 'amount' }],
      [[...filled, ['units', '0.002']], { amount: '', units: '0.002', derived: 'amount' }],
      [[...filled, ['amount', '5']], { amount: '5', units: '1', price: '5.00', derived: 'price' }],
    ];
    for (const [edits, expected] of cases) expect(typeIn(edits), JSON.stringify(edits)).toMatchObject(expected);
  });

  it('never fills over an amount the person typed, zero or unreadable', () => {
    for (const amount of ['0', '1,2,3']) {
      expect(
        typeIn([
          ['amount', amount],
          ['units', '1'],
          ['price', '2'],
        ]),
      ).toMatchObject({ amount, units: '1', price: '2', derived: null });
    }
  });
});

describe('toDraft', () => {
  const state = initialState('extra', [], undefined, context({ prices: null }));
  const typed = (numberInput: typeof en, amount: string, unitsTyped: string, fee: string) =>
    toDraft(
      {
        ...editRow(editRow(state, 0, 'amount', amount, numberInput, 'EUR'), 0, 'units', unitsTyped, numberInput, 'EUR'),
        fee,
        venue: ' ',
        note: ' bonus ',
      },
      numberInput,
    );

  it('reads the English and the Portuguese formats into the same draft', () => {
    for (const [numberInput, amount, unitsTyped, fee] of [
      [en, '1,234.56', '0.02', '1.5'],
      [pt, '1 234,56', '0,02', '1,5'],
      [pt, '1234.56', '0.02', '1.5'],
    ] as const) {
      expect(typed(numberInput, amount, unitsTyped, fee)).toEqual({
        ok: true,
        value: {
          kind: 'extra',
          date: '2026-10-20',
          slot: null,
          fee: '1.5',
          note: 'bonus',
          venue: null,
          rows: [
            { coin: 'BTC', entry: null, amount: '1234.56', units: '0.02' },
            { coin: 'ETH', entry: null, amount: null, units: null },
          ],
        },
      });
    }
  });

  // Review round 3: price 50,000, amount 100, price cleared, amount 200 stored 0.002 units, an implied 100,000.
  it('carries no derived units the amount and the price no longer produce, so the save refuses the row', () => {
    const along = (edits: readonly (readonly ['amount' | 'units' | 'price', string])[]) =>
      edits.reduce((at, [field, text]) => editRow(at, 0, field, text, en, 'EUR'), state);
    const cleared = along([
      ['price', '50,000'],
      ['amount', '100'],
      ['price', ''],
    ]);
    const retyped = editRow(cleared, 0, 'amount', '200', en, 'EUR');
    expect(retyped.rows[0]).toMatchObject({ amount: '200', units: '', price: '', derived: 'units' });
    for (const [form, row] of [
      [cleared, { coin: 'BTC', entry: null, amount: null, units: '0.002' }],
      [retyped, { coin: 'BTC', entry: null, amount: '200', units: null }],
    ] as const) {
      const draft = toDraft(form, en);
      if (!draft.ok) throw new Error('the draft reads');
      expect(draft.value.rows[0]).toEqual(row);
      const saved = saveTransaction(draft.value, {
        plan,
        entries: [],
        editing: [],
        ids: [id(), id()],
        now: instant('2026-10-20T10:00:00.000Z'),
        source: 'manual',
      });
      expect(saved).toEqual({ ok: false, error: { code: 'amount-and-units', coin: 'BTC' } });
    }
    const priced = toDraft(editRow(retyped, 0, 'price', '40,000', en, 'EUR'), en);
    expect(priced.ok && priced.value.rows[0]).toEqual({ coin: 'BTC', entry: null, amount: '200', units: '0.005' });
  });

  it('passes a derived amount only while its units and price back it, so the save refuses the row and stores none', () => {
    const along = (edits: readonly (readonly ['amount' | 'units' | 'price', string])[]) =>
      edits.reduce((at, [field, text]) => editRow(at, 0, field, text, en, 'EUR'), state);
    const paused = along([
      ['price', '2'],
      ['units', '1'],
      ['price', ''],
    ]);
    expect(paused.rows[0]).toMatchObject({ amount: '2.00', units: '1', price: '', derived: 'amount' });
    const emptied = along([
      ['price', '1'],
      ['units', '1'],
      ['units', '0.004'],
    ]);
    expect(emptied.rows[0]).toMatchObject({ amount: '', units: '0.004', price: '1', derived: 'amount' });
    const zeroUnits = along([
      ['price', '2'],
      ['units', '1'],
      ['units', '0'],
    ]);
    for (const [form, row] of [
      [paused, { coin: 'BTC', entry: null, amount: '2', units: null }],
      [emptied, { coin: 'BTC', entry: null, amount: null, units: '0.004' }],
      [zeroUnits, { coin: 'BTC', entry: null, amount: '2', units: null }],
    ] as const) {
      const draft = toDraft(form, en);
      if (!draft.ok) throw new Error('the draft reads');
      expect(draft.value.rows[0]).toEqual(row);
      const saved = saveTransaction(draft.value, {
        plan,
        entries: [],
        editing: [],
        ids: [id(), id()],
        now: instant('2026-10-20T10:00:00.000Z'),
        source: 'manual',
      });
      expect(saved).toEqual({ ok: false, error: { code: 'amount-and-units', coin: 'BTC' } });
    }
    const backed = toDraft(
      along([
        ['price', '2'],
        ['units', '1'],
      ]),
      en,
    );
    expect(backed.ok && backed.value.rows[0]).toEqual({ coin: 'BTC', entry: null, amount: '2', units: '1' });
  });

  // Review round 2, session 6: the amount cleared after units were derived left 0.002 on screen and the save
  // skipped the row silently, keeping only the other coin. Units shown without their amount are refused.
  it('passes units the row shows but cannot back without an amount, so the save refuses it and writes nothing', () => {
    const edits: readonly (readonly [number, 'amount' | 'units' | 'price', string])[] = [
      [0, 'price', '50,000'],
      [0, 'amount', '100'],
      [0, 'amount', ''],
      [1, 'amount', '30'],
      [1, 'units', '0.01'],
    ];
    const form = edits.reduce((at, [row, field, text]) => editRow(at, row, field, text, en, 'EUR'), state);
    expect(form.rows[0]).toMatchObject({ amount: '', units: '0.002', price: '50,000', derived: 'units' });
    const draft = toDraft(form, en);
    if (!draft.ok) throw new Error('the draft reads');
    expect(draft.value.rows).toEqual([
      { coin: 'BTC', entry: null, amount: null, units: '0.002' },
      { coin: 'ETH', entry: null, amount: '30', units: '0.01' },
    ]);
    const saved = saveTransaction(draft.value, {
      plan,
      entries: [],
      editing: [],
      ids: [id(), id()],
      now: instant('2026-10-20T10:00:00.000Z'),
      source: 'manual',
    });
    expect(saved).toEqual({ ok: false, error: { code: 'amount-and-units', coin: 'BTC' } });
  });

  // Review round 1, session 7: 0.0001 at 60,000 fills units that round to 0; with the price cleared the save skipped
  // the row, as units of 0 read as none, and kept only the other coin. Its amount stays in the draft instead.
  it('keeps the amount of a paused row whose units round to zero, so the save refuses it and writes nothing', () => {
    const edits: readonly (readonly [number, 'amount' | 'units' | 'price', string])[] = [
      [0, 'price', '60,000'],
      [0, 'amount', '0.0001'],
      [0, 'price', ''],
      [1, 'amount', '30'],
      [1, 'units', '0.01'],
    ];
    const form = edits.reduce((at, [row, field, text]) => editRow(at, row, field, text, en, 'EUR'), state);
    expect(form.rows[0]).toMatchObject({ amount: '0.0001', units: '0', price: '', derived: 'units' });
    const draft = toDraft(form, en);
    if (!draft.ok) throw new Error('the draft reads');
    expect(draft.value.rows).toEqual([
      { coin: 'BTC', entry: null, amount: '0.0001', units: '0' },
      { coin: 'ETH', entry: null, amount: '30', units: '0.01' },
    ]);
    const saved = saveTransaction(draft.value, {
      plan,
      entries: [],
      editing: [],
      ids: [id(), id()],
      now: instant('2026-10-20T10:00:00.000Z'),
      source: 'manual',
    });
    expect(saved).toEqual({ ok: false, error: { code: 'amount-and-units', coin: 'BTC' } });
  });

  it('returns every field it cannot read, with its code', () => {
    expect(typed(en, '1,234,56', '-1', '')).toEqual({
      ok: false,
      error: [
        { field: 'rows.0.amount', error: { code: 'number-invalid', example: '1,234.56' } },
        { field: 'rows.0.units', error: { code: 'number-negative' } },
      ],
    });
  });

  // Session 9, review round 2 (#97, #103): a cleared or partly typed date input gives '', which reached the store.
  it('returns the date issue for an empty or impossible date, beside the number issues', () => {
    for (const typedDate of ['', '2026-02-30']) {
      expect(toDraft({ ...state, date: typedDate }, en)).toEqual({
        ok: false,
        error: [{ field: 'date', error: 'date-invalid' }],
      });
      expect(toDraft({ ...state, date: typedDate, fee: '-1' }, en)).toEqual({
        ok: false,
        error: [
          { field: 'date', error: 'date-invalid' },
          { field: 'fee', error: { code: 'number-negative' } },
        ],
      });
    }
  });
});

// Finding B, session 8 (#96): the form shows a grouped row's first venue and note and its fees summed, so an edit
// that changes none of them gives each entry its own back, and one that changes a field sets it on every entry.
describe('keepUnchanged', () => {
  const now = instant('2026-10-20T10:00:00.000Z');
  const shared = { kind: 'dca', date: date('2026-09-01'), slot: month('2026-09') } as const;
  const btc = anEntry({ ...shared, amount: money('60.00'), units: units('0.001'), venue: 'Kraken', note: 'a' });
  const btcFee = { ...btc, fee: money('0.50') };
  const eth = anEntry({ ...shared, coin: ETH.id, amount: money('40.00'), units: units('0.02'), venue: 'Bitpanda' });
  const ethFee = { ...eth, fee: money('0.30') };
  const row = [btcFee, ethFee];
  const edit = (editing: readonly Entry[], change: (state: FormState) => FormState = (state) => state) => {
    const initial = initialState('dca', editing, undefined, context({ entries: editing }));
    const current = change(initial);
    const draft = toDraft(current, en);
    if (!draft.ok) throw new Error('unreadable draft');
    const ctx = { plan, entries: editing, editing, ids: [id()], now, source: 'manual' } as const;
    const saved = saveTransaction(draft.value, ctx);
    if (!saved.ok) throw new Error(saved.error.code);
    return keepUnchanged(saved.value, {
      current,
      draft: draft.value,
      editing,
      changed: changedFields(initial, current),
    });
  };

  it('gives back the entries of a row that holds two saves when nothing is changed', () => {
    expect(edit(row)).toEqual([
      { ...btcFee, updatedAt: now },
      { ...ethFee, updatedAt: now },
    ]);
  });

  it('sets a changed venue on every entry and keeps each note and fee', () => {
    expect(edit(row, (state) => ({ ...state, venue: ' Coinbase ' }))).toEqual([
      { ...btcFee, venue: 'Coinbase', updatedAt: now },
      { ...ethFee, venue: 'Coinbase', updatedAt: now },
    ]);
  });

  it('splits a changed fee by amount and keeps each venue and note', () => {
    expect(edit(row, (state) => ({ ...state, fee: '1.00' }))).toEqual([
      { ...btcFee, fee: '0.6', updatedAt: now },
      { ...ethFee, fee: '0.4', updatedAt: now },
    ]);
  });

  // The property's counterexamples: the number input reads 0.70 back as 0.7 and 1.0 as 1.
  it('keeps the stored text of an amount and units the edit reads back without trailing zeros', () => {
    const typed = { ...btcFee, amount: money('0.70'), units: units('1.0') };
    expect(edit([typed])).toEqual([{ ...typed, updatedAt: now }]);
  });

  it('gives back an unchanged edit of coins held with no cost as it was stored', () => {
    const held = anEntry({ kind: 'held', slot: null, fee: null, amount: null, units: units('0.50'), note: 'gift' });
    expect(edit([held])).toEqual([{ ...held, updatedAt: now }]);
  });

  it('gives a coin added in the edit no fee while the fee is unchanged', () => {
    const added = (state: FormState) => ({
      ...state,
      rows: [
        ...state.rows,
        { ...(state.rows[0] as FormState['rows'][number]), source: null, coin: ETH.id, amount: '40.00' },
      ],
    });
    const [kept, fresh] = edit([btcFee], added);
    expect(kept).toEqual({ ...btcFee, updatedAt: now });
    expect(fresh).toMatchObject({ coin: 'ETH', amount: '40', fee: null, venue: 'Kraken', note: 'a' });
  });

  // Review round 1, session 8 (#96): the unchanged fields follow the entry the row was loaded from; the save now keeps
  // that entry's id too (DOMAIN §6), and deletes the cleared row's own entry.
  it('keeps the venue, note and fee of the row that survives when another save of the same coin is cleared', () => {
    const a = anEntry({ ...shared, amount: money('60.00'), fee: money('0.50'), venue: 'Kraken', note: 'a' });
    const b = anEntry({ ...shared, amount: money('40.00'), fee: money('0.30'), venue: 'Bitpanda', note: 'b' });
    const cleared = (state: FormState) => ({
      ...state,
      rows: state.rows.map((each, at) => (at === 0 ? { ...each, amount: '', units: '' } : each)),
    });
    const [kept, removed] = edit([a, b], cleared);
    expect(kept).toEqual({ ...b, updatedAt: now });
    expect(removed).toEqual({ ...a, deletedAt: now, updatedAt: now });
  });

  it('keeps the fee, venue and note of an entry whose coin the edit changes', () => {
    const recoined = (state: FormState) => ({
      ...state,
      rows: state.rows.map((each) => ({ ...each, coin: ETH.id, decimals: ETH.decimals })),
    });
    const [fresh, removed] = edit([btcFee], recoined);
    expect(fresh).toMatchObject({
      coin: 'ETH',
      amount: '60.00',
      units: '0.001',
      fee: '0.50',
      venue: 'Kraken',
      note: 'a',
    });
    expect(fresh?.id).not.toBe(btcFee.id);
    expect(removed).toEqual({ ...btcFee, deletedAt: now, updatedAt: now });
  });

  // Session 9 (#97): with nothing being edited every saved entry had no source, so the prefilled fee was dropped.
  it('gives back what the save returned for a new transaction, the prefilled fee kept', () => {
    const initial = initialState('extra', [], undefined, context());
    const current = editRow(initial, 0, 'amount', '100', en, 'EUR');
    const draft = toDraft(current, en);
    if (!draft.ok) throw new Error('unreadable draft');
    const ctx = { plan, entries: [august, september], editing: [], ids: [id()], now, source: 'manual' } as const;
    const saved = saveTransaction(draft.value, ctx);
    if (!saved.ok) throw new Error(saved.error.code);
    expect(saved.value[0]?.fee).toBe('0.7');
    const changed = changedFields(initial, current);
    expect(keepUnchanged(saved.value, { current, draft: draft.value, editing: [], changed })).toEqual(saved.value);
  });
});

describe('saveOn', () => {
  const now = instant('2026-10-20T10:00:00.000Z');
  const shared = { kind: 'dca', date: date('2026-09-01'), slot: month('2026-09') } as const;
  const btc = anEntry({
    ...shared,
    amount: money('60.00'),
    units: units('0.001'),
    fee: money('0.50'),
    venue: 'Kraken',
  });
  const eth = anEntry({ ...shared, coin: ETH.id, amount: money('40.00'), units: units('0.02'), venue: 'Bitpanda' });
  const save = (stored: readonly Entry[], editing: readonly Entry[]) => {
    const initial = initialState('dca', editing, undefined, context({ entries: stored }));
    const draft = toDraft(initial, en);
    if (!draft.ok) throw new Error('unreadable draft');
    const form = { plan, editing, ids: [id()], now, source: 'manual', initial, current: initial } as const;
    return saveOn(stored, draft.value, form);
  };

  it('keeps the ids, venues and fees of an unchanged edit of a row with two venues', () => {
    expect(save([btc, eth], [btc, eth])).toEqual({
      ok: true,
      value: [
        { ...btc, updatedAt: now },
        { ...eth, updatedAt: now },
      ],
    });
  });

  it('saves nothing when an entry being edited was deleted since the form opened, so it never comes back', () => {
    expect(save([btc, { ...eth, deletedAt: now }], [btc, eth])).toBeNull();
    expect(save([btc], [btc, eth])).toBeNull();
  });
});

describe('actionMessage', () => {
  const format = createFormatters('en-GB', 'en-GB');

  it('words a sale over the holdings with the excess, the units held and today, trimmed as prose', () => {
    const error = { code: 'sell-exceeds-held', coin: BTC.id, held: units('0.312'), sold: units('0.333') } as const;
    expect(actionMessage(error, plan, format, date('2026-10-16'))).toEqual({
      key: 'errors.action.sell-exceeds-held',
      values: {
        product: 'Proof of Calm',
        excess: '0.021 BTC',
        held: '0.312 BTC',
        date: '16\u00a0Oct\u00a02026',
      },
    });
  });

  // The evaluator of issue 205: 0,881000 ETH beside the holding note's 0,119 (DESIGN §5 rule 7, CONTENT-STYLE §4).
  it('writes both figures at the places the more precise one needs, up to the coin decimals', () => {
    const pt = createFormatters('pt-PT', 'pt-PT');
    const sale = { code: 'sell-exceeds-held', coin: ETH.id, held: units('0.119'), sold: units('1') } as const;
    expect(actionMessage(sale, plan, pt, date('2026-10-16')).values).toMatchObject({
      excess: '0,881\u00a0ETH',
      held: '0,119\u00a0ETH',
    });
    const small = { code: 'sell-exceeds-held', coin: BTC.id, held: units('0.00012345'), sold: units('0.001') } as const;
    expect(actionMessage(small, plan, pt, date('2026-10-16')).values).toMatchObject({
      excess: '0,00087655\u00a0BTC',
      held: '0,00012345\u00a0BTC',
    });
  });

  // A sale dated before its purchase holds 0 that day (CONTENT-STYLE \u00a73): a zero figure reads 0, not 0,000.
  it('writes a zero holding as 0 and keeps the excess at its own places', () => {
    const pt = createFormatters('pt-PT', 'pt-PT');
    const early = { code: 'sell-exceeds-held', coin: BTC.id, held: units('0'), sold: units('0.001') } as const;
    expect(actionMessage(early, plan, pt, date('2026-09-20')).values).toMatchObject({
      excess: '0,001\u00a0BTC',
      held: '0\u00a0BTC',
    });
  });

  it("actionMessage words fee-exceeds-held with the move's date and the units held", () => {
    const error = {
      code: 'fee-exceeds-held',
      coin: BTC.id,
      held: units('0.05'),
      fee: units('0.0999'),
      date: date('2026-03-01'),
    } as const;
    // The move's date, not the date of the edit that left it short (docs/DOMAIN.md §6, ADR-0055).
    expect(actionMessage(error, plan, format, date('2026-10-16'))).toEqual({
      key: 'errors.action.fee-exceeds-held',
      values: {
        product: 'Proof of Calm',
        coin: 'BTC',
        held: '0.0500\u00a0BTC',
        fee: '0.0999\u00a0BTC',
        date: '1 Mar 2026',
      },
    });
    expect(actionMessage({ ...error, held: units('0') }, plan, format, date('2026-10-16')).values.held).toBe('0\u00a0BTC');
  });

  it('names the month of a slot refusal in words', () => {
    expect(actionMessage({ code: 'slot-done', slot: month('2026-10') }, plan, format, date('2026-10-20'))).toEqual({
      key: 'errors.action.slot-done',
      values: { product: 'Proof of Calm', slot: 'October\u00a02026' },
    });
  });

  it('passes every other error as it is', () => {
    expect(actionMessage({ code: 'no-coins' }, plan, format, date('2026-10-16'))).toEqual({
      key: 'errors.action.no-coins',
      values: { product: 'Proof of Calm' },
    });
  });
});

describe('proseDigits', () => {
  it('gives the places of the most precise value, capped at the decimals', () => {
    expect(proseDigits(6, units('0.881'), units('0.119'))).toBe(3);
    expect(proseDigits(6, units('1'), units('0.5'))).toBe(1);
    expect(proseDigits(2, units('0.00012345'))).toBe(2);
    expect(proseDigits(8, units('12'))).toBe(0);
  });
});

describe('detailFieldOf', () => {
  it('names the venue or the note a refusal is about, and no field for the others', () => {
    expect(detailFieldOf({ code: 'venue-too-long', max: 40 })).toBe('venue');
    expect(detailFieldOf({ code: 'note-too-long', max: 500 })).toBe('note');
    expect(detailFieldOf({ code: 'no-coins' })).toBeNull();
  });
});
