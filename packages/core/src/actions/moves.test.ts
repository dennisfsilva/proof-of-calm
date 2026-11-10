import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, money, units } from '../../test/builders';
import { ENTRY_NOTE_MAX_LENGTH, MAX_ENTRIES, VENUE_MAX_LENGTH } from '../constants';
import { stampAfter } from '../dates/calendar';
import { matchLots } from '../portfolio/lots';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { SaveContext } from './entries';
import { type MoveDraft, sameMove, saveMove, sourceShort } from './moves';

// Recording a move between venues (docs/DOMAIN.md §6 "Record a move", ADR-0054).
const plan = aPlan();
const now = instant('2026-03-02T10:00:00+00:00');
const ids = [id()];
const buy = (quantity: string, overrides: Partial<Entry> = {}) =>
  anEntry({ kind: 'extra', slot: null, units: units(quantity), amount: money('100'), venue: 'Kraken', ...overrides });
const sale = (quantity: string, overrides: Partial<Entry> = {}) =>
  anEntry({ kind: 'sell', slot: null, units: units(quantity), amount: money('100'), venue: 'Kraken', ...overrides });
const draft = (overrides: Partial<MoveDraft> = {}): MoveDraft => ({
  coin: BTC.id,
  date: date('2026-02-01'),
  from: 'Kraken',
  to: 'Ledger',
  sent: units('0.005'),
  received: units('0.0049'),
  note: 'to cold storage',
  ...overrides,
});
const context = (entries: readonly Entry[], overrides: Partial<SaveContext> = {}): SaveContext => ({
  plan,
  entries,
  editing: [],
  ids,
  now,
  source: 'manual',
  ...overrides,
});
const failure = (result: ReturnType<typeof saveMove>) => (result.ok ? null : result.error);
const bought = [buy('0.01')];

describe('saveMove (docs/DOMAIN.md §6)', () => {
  it('records a move with amount, fee and slot null, and its source, destination and units received as drafted', () => {
    expect(saveMove(draft(), context(bought))).toEqual({
      ok: true,
      value: [
        {
          id: ids[0],
          kind: 'move',
          date: '2026-02-01',
          coin: BTC.id,
          amount: null,
          units: '0.005',
          fee: null,
          note: 'to cold storage',
          slot: null,
          venue: 'Kraken',
          to: 'Ledger',
          received: '0.0049',
          source: 'manual',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    });
  });

  it('refuses received above sent (received-exceeds-sent) and a destination equal to the source (same-venue)', () => {
    const over = saveMove(draft({ received: units('0.0051') }), context(bought));
    expect(failure(over)).toEqual({ code: 'received-exceeds-sent' });
    expect(failure(saveMove(draft({ to: 'Kraken' }), context(bought)))).toEqual({ code: 'same-venue' });
    expect(saveMove(draft({ received: units('0.005') }), context(bought)).ok).toBe(true);
    expect(saveMove(draft({ from: null, to: 'Ledger' }), context([buy('0.01', { venue: null })])).ok).toBe(true);
  });

  it('refuses sent or received at 0 (amount-and-units), more than 10 decimals, a coin with no entries, a note or venue too long', () => {
    const refused = (overrides: Partial<MoveDraft>) => failure(saveMove(draft(overrides), context(bought)));
    const zero = { code: 'amount-and-units', coin: BTC.id };
    expect(refused({ sent: units('0') })).toEqual(zero);
    expect(refused({ received: units('0') })).toEqual(zero);
    const precision = { code: 'units-precision', coin: BTC.id };
    expect(refused({ sent: units('0.00500000001') })).toEqual(precision);
    expect(refused({ received: units('0.00490000001') })).toEqual(precision);
    const SOL = 'SOL' as CoinId;
    expect(refused({ coin: SOL })).toEqual({ code: 'unknown-coin', coin: SOL });
    expect(refused({ note: 'x'.repeat(ENTRY_NOTE_MAX_LENGTH + 1) })).toEqual({
      code: 'note-too-long',
      max: ENTRY_NOTE_MAX_LENGTH,
    });
    const long = 'v'.repeat(VENUE_MAX_LENGTH + 1);
    const venue = { code: 'venue-too-long', max: VENUE_MAX_LENGTH };
    expect(refused({ from: long })).toEqual(venue);
    expect(refused({ to: long })).toEqual(venue);
    expect(refused({ note: 'x'.repeat(ENTRY_NOTE_MAX_LENGTH), to: 'v'.repeat(VENUE_MAX_LENGTH) })).toBeNull();
  });

  it('refuses a move above the units held just before it (move-exceeds-held), naming held and sent', () => {
    const refusal = (sent: string) => ({ code: 'move-exceeds-held', coin: BTC.id, held: '0.01', sent });
    expect(failure(saveMove(draft({ sent: units('0.02') }), context(bought)))).toEqual(refusal('0.02'));
    const later = [...bought, buy('0.01', { date: date('2026-03-01') })];
    expect(failure(saveMove(draft({ sent: units('0.011') }), context(later)))).toEqual(refusal('0.011'));
    expect(saveMove(draft({ sent: units('0.01'), received: units('0.01') }), context(bought)).ok).toBe(true);
  });

  describe('an edit of a move already above the units held before it (§3.7: no worse than before)', () => {
    // The sale dated before the move was saved after it: heldOn allowed it, since the move takes out only its fee.
    const stored = aMove({ date: date('2026-02-01'), units: units('0.01'), received: units('0.0099') });
    const entries = [...bought, sale('0.005', { date: date('2026-01-15') }), stored, buy('0.001', { coin: ETH.id })];
    const edit = (overrides: Partial<MoveDraft>) =>
      saveMove(
        draft({ sent: units('0.01'), received: units('0.0099'), ...overrides }),
        context(entries, { editing: [stored] }),
      );

    it('an edit that keeps units and date saves although an earlier-dated sale left the move above the units held before it', () => {
      expect(edit({ note: 'a new note' }).ok).toBe(true);
      expect(edit({ sent: units('0.009'), received: units('0.0089') }).ok).toBe(true);
    });

    it('an edit that raises the units of a move already short is refused', () => {
      expect(failure(edit({ sent: units('0.011') }))).toEqual({
        code: 'move-exceeds-held',
        coin: BTC.id,
        held: '0.005',
        sent: '0.011',
      });
      const fresh = saveMove(draft({ sent: units('0.01'), received: units('0.0099') }), context(entries.slice(0, 2)));
      expect(failure(fresh)).toEqual({
        code: 'move-exceeds-held',
        coin: BTC.id,
        held: '0.005',
        sent: '0.01',
      });
    });

    it('an edit that moves the date is judged by its excess at the new date against the stored move excess', () => {
      // Stored: 0.01 sent with 0.005 held before it. Before the sale nothing is beyond; after it the same 0.005 is.
      expect(edit({ date: date('2026-01-10') }).ok).toBe(true);
      expect(edit({ date: date('2026-03-01') }).ok).toBe(true);
      expect(failure(edit({ date: date('2025-12-31') }))).toEqual({
        code: 'move-exceeds-held',
        coin: BTC.id,
        held: '0',
        sent: '0.01',
      });
    });

    it('an edit that changes the coin is judged as a new move of the new coin', () => {
      const eth = { coin: ETH.id, sent: units('0.004'), received: units('0.004') };
      const refusal = { code: 'move-exceeds-held', coin: ETH.id, held: '0.001', sent: '0.004' };
      expect(failure(edit(eth))).toEqual(refusal);
      const others = entries.filter((entry) => entry !== stored);
      expect(failure(saveMove(draft(eth), context(others)))).toEqual(refusal);
      expect(edit({ ...eth, sent: units('0.001'), received: units('0.001') }).ok).toBe(true);
    });
  });

  it('bounds sent by the units held at its place, not by heldOn: a move dated before a later sale it does not affect saves', () => {
    // heldOn on 2026-02-01 is 0.0005 (the March sale takes 0.0095), yet the move removes only its fee of 0.0004.
    const entries = [...bought, sale('0.0095', { date: date('2026-03-01') })];
    const moved = draft({ sent: units('0.01'), received: units('0.0096') });
    expect(saveMove(moved, context(entries)).ok).toBe(true);
  });

  it('saves a move whose source venue is short; sourceShort names what the source lacks and is null when it holds them', () => {
    const entries = [...bought, buy('0.01', { venue: 'Bitvavo' })];
    const short = draft({ sent: units('0.015'), received: units('0.0149') });
    expect(saveMove(short, context(entries)).ok).toBe(true);
    expect(sourceShort(entries, short, null)).toBe('0.005');
    expect(sourceShort(entries, draft({ sent: units('0.01') }), null)).toBeNull();
    expect(sourceShort(entries, draft({ from: 'Coinbase' }), null)).toBe('0.005');
    expect(sourceShort([buy('0.01', { venue: null })], draft({ from: null }), null)).toBeNull();
  });

  it("sourceShort counts the edited move's own units back at its source", () => {
    const stored = aMove({ date: date('2026-02-01'), units: units('0.008'), received: units('0.008') });
    const entries = [...bought, stored];
    const edited = draft({ sent: units('0.009'), received: units('0.009') });
    expect(sourceShort(entries, edited, null)).toBe('0.007');
    expect(sourceShort(entries, edited, stored.id)).toBeNull();
  });

  it("sourceShort reads the source before the date's sales, as matchLots matches the move", () => {
    // Session review round 3: a sale at the source on the move's date comes after the move in the matching order.
    const entries = [
      buy('0.05', { date: date('2026-01-15') }),
      buy('0.02', { date: date('2026-01-15'), venue: 'Bitvavo' }),
      sale('0.03', { date: date('2026-02-01') }),
    ];
    const moved = draft({ sent: units('0.04'), received: units('0.04') });
    expect(sourceShort(entries, moved, null)).toBeNull();
    const saved = saveMove(moved, context(entries));
    if (!saved.ok) throw new Error('the move saves');
    const [match] = matchLots([...entries, ...saved.value], BTC.id, 'per-venue').moves;
    expect(match?.takes.map(({ units, venue }) => [units, venue])).toEqual([['0.04', 'Kraken']]);
    expect(match?.unmatched).toBe('0');
  });

  it("sourceShort counts a purchase at the source on the move's date", () => {
    const onTheDay = { date: date('2026-02-01') };
    const entries = [buy('0.01', onTheDay), sale('0.01', onTheDay)];
    expect(sourceShort(entries, draft({ sent: units('0.01') }), null)).toBeNull();
    expect(sourceShort(entries, draft({ sent: units('0.012') }), null)).toBe('0.002');
  });

  it('sourceShort counts the units an earlier move of the date delivered to the source', () => {
    const earlier = aMove({ date: date('2026-02-01'), venue: 'Bitvavo', to: 'Kraken', received: units('0.01') });
    const entries = [buy('0.01', { venue: 'Bitvavo' }), earlier, sale('0.005', { date: date('2026-02-01') })];
    expect(sourceShort(entries, draft({ sent: units('0.01'), received: units('0.01') }), null)).toBeNull();
  });

  it("sourceShort counts an edited move's own units back at its source", () => {
    // The edit keeps its place among the date's moves: before the later move from Kraken, which a new move would follow.
    const at = (time: string) => instant(`2026-02-01T${time}:00+00:00`);
    const stored = aMove({
      date: date('2026-02-01'),
      units: units('0.008'),
      received: units('0.008'),
      createdAt: at('09:00'),
    });
    const later = aMove({ date: date('2026-02-01'), units: units('0.002'), to: 'Coinbase', createdAt: at('10:00') });
    const entries = [buy('0.01', { date: date('2026-01-15') }), stored, later];
    const edited = draft({ sent: units('0.009'), received: units('0.009') });
    expect(sourceShort(entries, edited, stored.id)).toBeNull();
    expect(sourceShort(entries, edited, null)).toBe('0.009');
  });

  it('refuses a fee that leaves a later sale short (sell-exceeds-held)', () => {
    const entries = [...bought, sale('0.01', { date: date('2026-03-01') })];
    const moved = draft({ sent: units('0.01'), received: units('0.0099') });
    expect(failure(saveMove(moved, context(entries)))).toEqual({
      code: 'sell-exceeds-held',
      coin: BTC.id,
      held: '0.0099',
      sold: '0.01',
    });
    expect(saveMove({ ...moved, received: units('0.01') }, context(entries)).ok).toBe(true);
  });

  it('an edit keeps id, createdAt and source, stamps after the stored stamp, and soft-deletes the other edited entries', () => {
    const later = instant('2026-03-02T11:00:00+00:00');
    const stored = aMove({ date: date('2026-02-01'), source: 'import-json', updatedAt: later });
    const other = aMove({ date: date('2026-02-02'), units: units('0.001'), received: units('0.001') });
    const entries = [...bought, stored, other];
    const result = saveMove(draft({ sent: units('0.01') }), context(entries, { editing: [stored, other] }));
    const stamp = stampAfter(now, later);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          ...stored,
          units: '0.01',
          received: '0.0049',
          note: 'to cold storage',
          source: 'import-json',
          updatedAt: stamp,
        },
        { ...other, updatedAt: now, deletedAt: now },
      ],
    });
  });

  it('throws a RangeError for an empty destination', () => {
    expect(() => saveMove(draft({ to: '' }), context(bought))).toThrow(RangeError);
  });
});

describe('sameMove', () => {
  it('names a live identical move, never a deleted one and never the move being edited', () => {
    const same = aMove({ date: date('2026-02-01'), units: units('0.005'), received: units('0.0049') });
    expect(sameMove([...bought, same], draft(), null)).toBe(same.id);
    expect(sameMove([...bought, same], draft(), same.id)).toBeNull();
    expect(sameMove([{ ...same, deletedAt: now, updatedAt: now }], draft(), null)).toBeNull();
    const differing: Partial<Entry>[] = [
      { kind: 'extra' },
      { coin: 'ETH' as CoinId },
      { date: date('2026-02-02') },
      { venue: 'Bitvavo' },
      { to: 'Trezor' },
      { units: units('0.006') },
      { received: units('0.0048') },
    ];
    for (const change of differing) expect(sameMove([{ ...same, ...change }], draft(), null)).toBeNull();
  });
});

describe('saveMove at the cap', { timeout: 30_000 }, () => {
  it('refuses a new move beside 10,000 live entries; saves an edit at the cap', () => {
    // The other entries are ETH, so the units held and the sales' cover read only the two BTC entries (fast in CI).
    const full = Array.from({ length: MAX_ENTRIES - 2 }, () => buy('0.0001', { coin: ETH.id }));
    const stored = aMove({ date: date('2026-02-01'), units: units('0.001'), received: units('0.001') });
    const entries = [...full, ...bought, stored];
    expect(failure(saveMove(draft(), context(entries)))).toEqual({ code: 'too-many-entries', max: MAX_ENTRIES });
    expect(saveMove(draft(), context(entries, { editing: [stored] })).ok).toBe(true);
  });
});

describe('a move before a stored move on its route (docs/DOMAIN.md §3.7, §6; ADR-0055)', () => {
  const kraken = buy('0.10', { date: date('2026-01-10') });
  const march = (received: string) =>
    aMove({ coin: BTC.id, date: date('2026-03-01'), units: units('0.10'), received: units(received) });
  const february = (received: string) =>
    draft({ date: date('2026-02-01'), sent: units('0.10'), received: units(received) });

  it('saves a new move dated before a stored move on the same route and leaves no unit unmatched', () => {
    const entries = [kraken, march('0.0998')];
    const saved = saveMove(february('0.0998'), context(entries));
    if (!saved.ok) throw new Error(saved.error.code);
    expect(matchLots([...entries, ...saved.value], BTC.id, 'global').unmatchedUnits).toBe('0');
  });

  it("a new move whose fee leaves a later stored move's fee beyond the units held is refused with fee-exceeds-held", () => {
    expect(failure(saveMove(february('0.05'), context([kraken, march('0.0001')])))).toEqual({
      code: 'fee-exceeds-held',
      coin: BTC.id,
      held: '0.05',
      fee: '0.0999',
      date: '2026-03-01',
    });
  });
});
