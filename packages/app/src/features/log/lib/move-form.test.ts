import type { CoinId, Entry, MoveDraft } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { createFormatters, createNumberInput } from '../../../lib/format';
import {
  initialMoveState,
  type MoveFormContext,
  type MoveFormState,
  MoveFormStateSchema,
  movableCoins,
  moveDraft,
  moveErrorField,
  moveLines,
  moveMessage,
  moveSources,
  saveMoveOn,
  typedFee,
  typeSent,
  withSource,
} from './move-form';

const en = createNumberInput('en-GB');
const pt = createNumberInput('pt-PT');
const plan = aPlan();
const format = createFormatters('en-GB', 'en-GB');

const filled: MoveFormState = {
  coin: 'BTC',
  date: '2026-03-01',
  from: 'Kraken',
  to: 'Ledger',
  sent: '0.05',
  received: '0.0498',
  receivedTyped: true,
  note: '',
};

describe('moveDraft', () => {
  it('moveDraft refuses 0 sent or received at the field', () => {
    expect(moveDraft({ ...filled, sent: '0', received: '0' }, en)).toEqual({
      ok: false,
      error: [
        { field: 'sent', error: 'sent-zero' },
        { field: 'received', error: 'received-zero' },
      ],
    });
    expect(moveDraft({ ...filled, sent: '', received: '' }, en)).toEqual({
      ok: false,
      error: [
        { field: 'sent', error: 'sent-zero' },
        { field: 'received', error: 'received-zero' },
      ],
    });
    // A readable figure in the plan's number locale is read as that locale writes it.
    const draft = moveDraft({ ...filled, sent: '0,05', received: '0,0498' }, pt);
    expect(draft.ok && [draft.value.sent, draft.value.received]).toEqual(['0.05', '0.0498']);
  });

  it('moveDraft trims the destination and refuses it empty', () => {
    const draft = moveDraft({ ...filled, to: '  Ledger  ', note: ' first ' }, en);
    expect(draft).toEqual({
      ok: true,
      value: {
        coin: BTC.id,
        date: date('2026-03-01'),
        from: 'Kraken',
        to: 'Ledger',
        sent: units('0.05'),
        received: units('0.0498'),
        note: 'first',
      },
    });
    expect(moveDraft({ ...filled, to: '   ' }, en)).toEqual({ ok: false, error: [{ field: 'to', error: 'to-empty' }] });
    // No source chosen and no coin chosen are named at their own fields; a blank date at the date.
    expect(moveDraft({ ...filled, coin: '', date: '', from: undefined }, en)).toEqual({
      ok: false,
      error: [
        { field: 'coin', error: 'coin-empty' },
        { field: 'date', error: 'date-invalid' },
        { field: 'from', error: 'from-empty' },
      ],
    });
  });
});

describe('moveErrorField', () => {
  it('names the field of each refusal a move can meet', () => {
    const coin = BTC.id;
    expect(moveErrorField({ code: 'move-exceeds-held', coin, held: units('0'), sent: units('1') })).toBe('sent');
    expect(moveErrorField({ code: 'units-precision', coin })).toBe('sent');
    expect(moveErrorField({ code: 'amount-and-units', coin })).toBe('sent');
    expect(moveErrorField({ code: 'received-exceeds-sent' })).toBe('received');
    expect(moveErrorField({ code: 'sell-exceeds-held', coin, held: units('0'), sold: units('1') })).toBe('received');
    expect(moveErrorField({ code: 'same-venue' })).toBe('to');
    expect(moveErrorField({ code: 'venue-too-long', max: 40 })).toBe('to');
    expect(moveErrorField({ code: 'note-too-long', max: 500 })).toBe('note');
    expect(moveErrorField({ code: 'unknown-coin', coin })).toBe('coin');
    expect(moveErrorField({ code: 'too-many-entries', max: 10_000 })).toBeNull();
  });

  it('moveErrorField maps fee-exceeds-held to the received field', () => {
    const error = { code: 'fee-exceeds-held', coin: BTC.id, held: units('0'), fee: units('0.0002') } as const;
    expect(moveErrorField({ ...error, date: date('2026-03-01'), written: false })).toBe('received');
  });
});

describe('moveMessage', () => {
  it("moveMessage words a later sale left short as the move's fee, not as a sale", () => {
    const error = { code: 'sell-exceeds-held', coin: BTC.id, held: units('0.01'), sold: units('0.02') } as const;
    expect(moveMessage(error, plan, format, date('2026-03-01'))).toEqual({
      key: 'log.move.saleShort',
      values: { coin: 'BTC' },
    });
  });

  it("moveMessage words fee-exceeds-held as a later move's fee", () => {
    const error = {
      code: 'fee-exceeds-held',
      coin: BTC.id,
      held: units('0.05'),
      fee: units('0.0999'),
      date: date('2026-03-01'),
      written: false,
    } as const;
    // The later move's date, not the date of the move being saved.
    expect(moveMessage(error, plan, format, date('2026-02-01'))).toEqual({
      key: 'log.move.feeShort',
      values: { coin: 'BTC', date: '1\u00a0Mar\u00a02026' },
    });
  });

  it("moveMessage words fee-exceeds-held for the move it saves as that move's own fee, never another move's", () => {
    // A sale imported short leaves no unit in total for the fee of the move being saved (docs/DOMAIN.md §3.7).
    const error = {
      code: 'fee-exceeds-held',
      coin: BTC.id,
      held: units('0'),
      fee: units('0.0001'),
      date: date('2026-03-01'),
      written: true,
    } as const;
    expect(moveMessage(error, plan, format, date('2026-03-01'))).toEqual({
      key: 'log.move.ownFeeShort',
      values: { coin: 'BTC' },
    });
  });

  it('words a move over the holdings with the units sent and held on its date, as prose', () => {
    const error = { code: 'move-exceeds-held', coin: BTC.id, held: units('0.03'), sent: units('0.05') } as const;
    expect(moveMessage(error, plan, format, date('2026-03-01'))).toEqual({
      key: 'errors.action.move-exceeds-held',
      values: { product: 'Proof of Calm', sent: '0.05 BTC', held: '0.03 BTC', date: '1 Mar 2026' },
    });
    // Nothing held reads 0, and every other refusal is worded as the entry form words it.
    const none = moveMessage({ ...error, held: units('0') }, plan, format, date('2026-03-01'));
    expect(none.values.held).toBe('0 BTC');
    expect(moveMessage({ code: 'same-venue' }, plan, format, date('2026-03-01')).key).toBe('errors.action.same-venue');
  });
});

describe('MoveFormStateSchema', () => {
  it('the draft round-trips through MoveFormStateSchema', () => {
    for (const state of [filled, { ...filled, from: null }, { ...filled, from: undefined }]) {
      expect(MoveFormStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    }
    expect(MoveFormStateSchema.safeParse({ ...filled, receivedTyped: 'yes' }).success).toBe(false);
  });
});

// 0.03 BTC bought at Kraken on 10 Jan 2026 and 0.02 BTC with no venue on 10 Feb 2026: one group holds BTC on 20 Jan,
// two on 20 Feb.
const bought = (quantity: string, on: string, venue: string | null, coin = BTC.id) =>
  anEntry({ kind: 'extra', date: date(on), slot: null, coin, units: units(quantity), venue });
const lots = [bought('0.03', '2026-01-10', 'Kraken'), bought('0.02', '2026-02-10', null)];
const context = (entries: readonly Entry[], editing: Entry | null = null): MoveFormContext => ({
  plan,
  entries,
  editing,
  numberInput: en,
});
const blank = initialMoveState(null, context(lots));
const dated = (on: string, from?: string | null): MoveFormState => ({
  ...blank,
  date: on,
  ...(from === undefined ? {} : { from }),
});
const draft: MoveDraft = {
  coin: BTC.id,
  date: date('2026-02-20'),
  from: 'Kraken',
  to: 'Ledger',
  sent: units('0.05'),
  received: units('0.0498'),
  note: '',
};
const save = { plan, ids: [id()], now: instant('2026-03-01T09:00:00+00:00'), source: 'manual' } as const;
const perVenue = { overrides: [], lotScope: 'per-venue', lotRule: 'fifo' } as const;
const global = { ...perVenue, lotScope: 'global' } as const;
/** What moveLines runs the save with: the form's fresh id and its clock. */
const at = { ids: save.ids, now: save.now };
// 0.03 BTC bought at Kraken on 10 Jan 2026 and sold on 1 Mar 2026: none held now, 0.03 held all February.
const gone = [
  bought('0.03', '2026-01-10', 'Kraken'),
  anEntry({ kind: 'sell', coin: BTC.id, units: units('0.03'), slot: null, date: date('2026-03-01') }),
];
const SOL = 'SOL' as CoinId;

describe('initialMoveState', () => {
  it('a new move opens with a blank date, the coin chosen when one is held and none while two are', () => {
    expect(blank).toEqual({
      coin: 'BTC',
      date: '',
      from: undefined,
      to: '',
      sent: '',
      received: '',
      receivedTyped: false,
      note: '',
    });
    const both = [...lots, bought('0.5', '2026-01-10', 'Kraken', ETH.id)];
    expect(initialMoveState(null, context(both)).coin).toBe('');
  });

  it('a new move preselects the one coin held now while the choice also lists the coins sold out since', () => {
    const eth = [...gone, bought('0.5', '2026-01-10', 'Kraken', ETH.id)];
    expect(movableCoins({ plan, entries: eth })).toEqual(['BTC', 'ETH']);
    expect(initialMoveState(null, context(eth)).coin).toBe('ETH');
    // With nothing held now the one coin the Log has held is chosen; with two held now, none.
    expect(initialMoveState(null, context(gone)).coin).toBe('BTC');
    const two = [...eth, bought('1', '2026-01-10', 'Kraken', SOL)];
    expect(initialMoveState(null, context(two)).coin).toBe('');
  });

  it('an edit opens on its move, its units received typed only when they differ from the units sent', () => {
    const move = aMove({ date: date('2026-02-01'), units: units('0.01'), received: units('0.0099'), note: 'cold' });
    expect(initialMoveState(move, context([...lots, move], move))).toEqual({
      coin: 'BTC',
      date: '2026-02-01',
      from: 'Kraken',
      to: 'Ledger',
      sent: '0.01',
      received: '0.0099',
      receivedTyped: true,
      note: 'cold',
    });
    const whole = aMove({ venue: null, received: units('0.01') });
    expect(initialMoveState(whole, context([...lots, whole], whole))).toMatchObject({
      from: null,
      receivedTyped: false,
    });
  });
});

describe('movableCoins', () => {
  it("offers the coins the Log has held at some time, in the portfolio's order", () => {
    const sale = anEntry({ kind: 'sell', coin: ETH.id, units: units('0.5'), slot: null, date: date('2026-01-20') });
    const sold = [bought('0.5', '2026-01-10', 'Kraken', ETH.id), sale];
    expect(movableCoins({ plan, entries: [...sold, ...lots] })).toEqual(['BTC', 'ETH']);
    // A plan coin never bought, and a coin whose only purchase was deleted, are not offered.
    const deleted = { ...bought('1', '2026-01-10', 'Kraken', SOL), deletedAt: instant('2026-01-11T09:00:00+00:00') };
    expect(movableCoins({ plan, entries: [...lots, deleted] })).toEqual(['BTC']);
    expect(movableCoins({ plan, entries: [] })).toEqual([]);
  });

  it('a coin sold out since can still be chosen for a move dated while it was held', () => {
    expect(movableCoins({ plan, entries: gone })).toEqual(['BTC']);
    expect(initialMoveState(null, context(gone)).coin).toBe('BTC');
    const february = { ...draft, date: date('2026-02-01'), sent: units('0.01'), received: units('0.01') };
    expect(saveMoveOn(gone, february, { ...save, editing: null })?.ok).toBe(true);
  });

  it('an edit keeps its own coin in the choice after a later sale used its units up', () => {
    const move = aMove({ date: date('2026-02-01'), received: units('0.01') });
    const others = [bought('0.5', '2026-01-10', 'Kraken', ETH.id), bought('1', '2026-01-10', 'Kraken', SOL)];
    const entries = [...gone, move, ...others];
    expect(movableCoins(context(entries, move))).toEqual(['BTC', 'ETH', 'SOL']);
    expect(initialMoveState(move, context(entries, move)).coin).toBe('BTC');
    // Its coin stays even when no live purchase of it is left in the Log.
    expect(movableCoins(context([move, ...others], move))).toEqual(['BTC', 'ETH', 'SOL']);
  });
});

describe('moveSources', () => {
  it('lists each venue holding the coin on the date with its units, the edited move left out', () => {
    expect(moveSources(dated('2026-01-20'), context(lots))).toEqual([{ venue: 'Kraken', units: units('0.03') }]);
    const twenty = moveSources(dated('2026-02-20'), context(lots));
    expect(twenty).toHaveLength(2);
    expect(twenty).toEqual(
      expect.arrayContaining([
        { venue: 'Kraken', units: units('0.03') },
        { venue: null, units: units('0.02') },
      ]),
    );
    // The move being edited is left out, so its units count at its source again and not at its destination.
    const move = aMove({ date: date('2026-01-15') });
    expect(moveSources(dated('2026-01-20'), context([...lots, move], move))).toEqual([
      { venue: 'Kraken', units: units('0.03') },
    ]);
    // No sources without a coin and a full date.
    expect(moveSources({ ...dated('2026-01-20'), coin: '' }, context(lots))).toEqual([]);
    expect(moveSources(dated('2026-01'), context(lots))).toEqual([]);
  });

  it("the source cards and Fill in all units read the units before a sale at the source on the move's date", () => {
    // The move comes before its date's sales in the matching order, so the cards show what the match finds there.
    const sold = anEntry({ kind: 'sell', slot: null, date: date('2026-02-20'), units: units('0.01'), venue: 'Kraken' });
    const state = dated('2026-02-20', 'Kraken');
    const sources = moveSources(state, context([...lots, sold]));
    expect(sources).toEqual(
      expect.arrayContaining([
        { venue: 'Kraken', units: units('0.03') },
        { venue: null, units: units('0.02') },
      ]),
    );
    // Fill in all units fills the chosen card's figure, and the short-source line finds those units there.
    const all = sources.find((place) => place.venue === state.from)?.units;
    expect(all).toBe(units('0.03'));
    const filledAll = {
      ...draft,
      date: date('2026-02-20'),
      from: 'Kraken',
      sent: units('0.03'),
      received: units('0.03'),
    };
    expect(moveLines(filledAll, context([...lots, sold]), perVenue, at).short).toBeNull();
  });
});

describe('withSource', () => {
  it('chooses the source only when exactly one group holds units on the date', () => {
    expect(withSource(dated('2026-01-20'), context(lots)).from).toBe('Kraken');
    expect(withSource(dated('2026-02-20'), context(lots)).from).toBeUndefined();
    expect(withSource(dated('2026-01-05'), context(lots)).from).toBeUndefined();
  });

  it('keeps the chosen source while it still holds units on the date, else drops it', () => {
    expect(withSource(dated('2026-02-20', null), context(lots)).from).toBeNull();
    expect(withSource(dated('2026-01-20', null), context(lots)).from).toBe('Kraken');
    expect(withSource(dated('2026-01-05', 'Kraken'), context(lots)).from).toBeUndefined();
  });
});

describe('typeSent', () => {
  it('the units received follow the units sent until the person types them', () => {
    expect(typeSent(blank, '0.05')).toMatchObject({ sent: '0.05', received: '0.05' });
    const typed = { ...blank, received: '0.0498', receivedTyped: true };
    expect(typeSent(typed, '0.06')).toMatchObject({ sent: '0.06', received: '0.0498' });
  });
});

describe('typedFee', () => {
  it('shows the network fee only when both figures read and it is above 0', () => {
    expect(typedFee({ ...blank, sent: '0.05', received: '0.0498' }, en)).toBe(units('0.0002'));
    expect(typedFee({ ...blank, sent: '0.05', received: '0.05' }, en)).toBeNull();
    expect(typedFee({ ...blank, sent: '0.05', received: '0.06' }, en)).toBeNull();
    expect(typedFee({ ...blank, sent: '0.05', received: '' }, en)).toBeNull();
  });
});

describe('moveLines', () => {
  it('names a short source only under per-venue lots, with what the source holds on the date', () => {
    expect(moveLines(draft, context(lots), perVenue, at).short).toEqual({ short: units('0.02'), held: units('0.03') });
    expect(moveLines(draft, context(lots), global, at).short).toBeNull();
    expect(moveLines({ ...draft, sent: units('0.03') }, context(lots), perVenue, at).short).toBeNull();
  });

  it('names an identical live move in the Log, never the move being edited', () => {
    const move = aMove({ date: draft.date, units: draft.sent, received: draft.received });
    expect(moveLines(draft, context([...lots, move]), global, at).same).toBe(true);
    expect(moveLines(draft, context([...lots, move], move), global, at).same).toBe(false);
    expect(moveLines(draft, context(lots), global, at).same).toBe(false);
  });
});

describe('moveLines and the moves it leaves short (docs/DOMAIN.md §3.7)', () => {
  it('moveLines names a stored later move the draft leaves short', () => {
    // The draft takes all 0.05 BTC outside Ledger before a stored move from Kraken on 10 Mar 2026.
    const march = (received: string) =>
      aMove({ date: date('2026-03-10'), units: units('0.03'), received: units(received) });
    const paid = march('0.0298');
    expect(moveLines(draft, context([...lots, paid]), perVenue, at).later).toMatchObject({
      id: paid.id,
      short: '0.03',
    });
    // Its fee then taken at Ledger: named under global lots too.
    expect(moveLines(draft, context([...lots, paid]), global, at).later).toMatchObject({ feeAtDestination: '0.0002' });
    // With no fee nothing lost its cover: per venue only.
    const free = march('0.03');
    expect(moveLines(draft, context([...lots, free]), perVenue, at).later).toMatchObject({ id: free.id });
    expect(moveLines(draft, context([...lots, free]), global, at).later).toBeNull();
    // A refused draft (more than held) names nothing.
    const refused = moveLines({ ...draft, sent: units('1') }, context(lots), perVenue, at);
    expect([refused.later, refused.found]).toEqual([null, null]);
  });

  it("under global lots reads outside from the units held at each venue but the destination, as the source cards show", () => {
    // Global FIFO sells the Kraken lot for the sale at Ledger, which leaves 1 BTC at Kraken: no line anywhere.
    const sale = anEntry({
      kind: 'sell',
      coin: BTC.id,
      date: date('2026-02-10'),
      units: units('1'),
      slot: null,
      venue: 'Ledger',
    });
    const kraken = bought('1', '2026-01-10', 'Kraken');
    const sold = [kraken, bought('1', '2026-02-01', 'Ledger'), sale];
    const half = { ...draft, sent: units('0.5'), received: units('0.4999') };
    expect(moveLines(half, context(sold), global, at)).toMatchObject({ short: null, found: null, later: null });
    // 0.2 BTC left at Kraken: short outside Ledger and its fee taken at Ledger, so the short-source line shows.
    const thin = [{ ...kraken, units: units('0.2') }, ...sold.slice(1, 2), { ...sale, units: units('0.2') }];
    expect(moveLines(half, context(thin), global, at)).toMatchObject({
      short: { short: '0.3', held: '0.2' },
      found: { outside: '0.2', short: '0.3', feeAtDestination: '0.0001' },
    });
  });

  it('the short-source line says how much the Log finds outside the destination when that is less than sent', () => {
    // 0.05 BTC outside Ledger on 20 Feb 2026, 0.01 at Ledger: a move of 0.06 finds 0.05 outside.
    const withLedger = [...lots, bought('0.01', '2026-02-01', 'Ledger')];
    const six = { ...draft, sent: units('0.06'), received: units('0.0598') };
    expect(moveLines(six, context(withLedger), perVenue, at)).toMatchObject({
      short: { short: '0.03', held: '0.03' },
      found: { outside: '0.05', short: '0.01' },
    });
    // Under global lots the fee is covered outside Ledger: no line.
    expect(moveLines(six, context(withLedger), global, at)).toMatchObject({ short: null, found: null });
    // Part of the fee taken at Ledger: the line in every country.
    const thin = [bought('0.05', '2026-01-10', 'Ledger'), bought('0.00005', '2026-01-10', 'Kraken')];
    const small = { ...draft, sent: units('0.01'), received: units('0.0099') };
    expect(moveLines(small, context(thin), global, at)).toMatchObject({
      short: { short: '0.00995', held: '0.00005' },
      found: { outside: '0.00005', short: '0.00995' },
    });
  });
});

describe('saveMoveOn', () => {
  const small = { ...draft, sent: units('0.01'), received: units('0.0099') };

  it('saves a new move on the entries as stored', () => {
    const saved = saveMoveOn(lots, small, { ...save, editing: null });
    expect(saved?.ok && saved.value.filter((entry) => entry.kind === 'move')).toEqual([
      expect.objectContaining({ id: save.ids[0], venue: 'Kraken', to: 'Ledger', units: units('0.01') }),
    ]);
  });

  it('writes nothing when the move being edited is no longer live', () => {
    const move = aMove({ date: date('2026-02-01') });
    const deleted = { ...move, deletedAt: instant('2026-02-15T09:00:00+00:00') };
    expect(saveMoveOn([...lots, deleted], small, { ...save, editing: move })).toBeNull();
    expect(saveMoveOn(lots, small, { ...save, editing: move })).toBeNull();
    const saved = saveMoveOn([...lots, move], small, { ...save, editing: move });
    expect(saved?.ok && saved.value.find((entry) => entry.id === move.id)?.date).toBe('2026-02-20');
  });
});
