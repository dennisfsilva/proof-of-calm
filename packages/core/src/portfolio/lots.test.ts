import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, date, instant, money, units } from '../../test/builders';
import { compare, isNegative, minus, sum, type Units } from '../money/decimal';
import type { Entry } from '../schema/entry';
import { heldLots, lots, matchLots, venueUnits, venueUnitsAtMove } from './lots';

const BTC = 'BTC' as never;
const buy = (day: string, quantity: string, venue: string | null = null, created = '2026-01-01T09:00:00Z') =>
  anEntry({
    kind: 'extra',
    slot: null,
    coin: BTC,
    date: date(day),
    units: units(quantity),
    amount: money('100'),
    venue,
    createdAt: instant(created),
  });
const sell = (day: string, quantity: string, venue: string | null = null) =>
  anEntry({
    kind: 'sell',
    slot: null,
    coin: BTC,
    date: date(day),
    units: units(quantity),
    amount: money('100'),
    venue,
  });

const remaining = (entries: Entry[], scope: 'global' | 'per-venue' = 'global', rule: 'fifo' | 'lifo' = 'fifo') =>
  lots(entries, BTC, scope, rule).map((lot) => [lot.date, lot.remainingUnits]);

describe('lots (docs/DOMAIN.md §3.7)', () => {
  it('lists the purchases in date order and consumes sales first in, first out', () => {
    const entries = [
      buy('2026-03-01', '0.3'),
      buy('2026-01-01', '0.5'),
      sell('2026-06-01', '0.6'),
      buy('2026-02-01', '0.2'),
    ];
    expect(remaining(entries)).toEqual([
      ['2026-01-01', '0'],
      ['2026-02-01', '0.1'],
      ['2026-03-01', '0.3'],
    ]);
  });

  it('orders same-day purchases by creation and lets a same-day purchase cover a sale', () => {
    const entries = [
      buy('2026-01-01', '0.5', null, '2026-01-01T12:00:00Z'),
      buy('2026-01-01', '0.25', null, '2026-01-01T10:00:00+02:00'),
      sell('2026-01-01', '0.3'),
    ];
    // 10:00+02:00 is 08:00 UTC, so the 0.25 lot is first and is consumed first.
    expect(lots(entries, BTC, 'global').map((lot) => [lot.units, lot.remainingUnits])).toEqual([
      ['0.25', '0'],
      ['0.5', '0.45'],
    ]);
  });

  it('never lets a sale consume a purchase made after it, and reports what it could not match', () => {
    const entries = [buy('2026-01-01', '0.1'), sell('2026-02-01', '0.3'), buy('2026-03-01', '1')];
    const match = matchLots(entries, BTC, 'global');
    expect(match.lots.map((lot) => lot.remainingUnits)).toEqual(['0', '1']);
    expect(match.unmatchedUnits).toBe('0.2');
  });

  it('matches per venue where the country does (Portugal per platform, Germany per wallet)', () => {
    const entries = [
      buy('2026-01-01', '1', 'Kraken'),
      buy('2026-02-01', '1', 'Bitpanda'),
      sell('2026-03-01', '0.5', 'Bitpanda'),
    ];
    expect(remaining(entries, 'per-venue')).toEqual([
      ['2026-01-01', '1'],
      ['2026-02-01', '0.5'],
    ]);
    expect(remaining(entries, 'global')).toEqual([
      ['2026-01-01', '0.5'],
      ['2026-02-01', '1'],
    ]);
  });

  it('puts the entries without a venue in one group of their own', () => {
    const entries = [buy('2026-01-01', '1', null), buy('2026-02-01', '1', 'Kraken'), sell('2026-03-01', '0.5', null)];
    expect(remaining(entries, 'per-venue')).toEqual([
      ['2026-01-01', '0.5'],
      ['2026-02-01', '1'],
    ]);
  });

  it('consumes the latest available lot first under LIFO (Italy)', () => {
    const entries = [buy('2026-01-01', '1'), buy('2026-02-01', '1'), sell('2026-03-01', '1.5'), buy('2026-04-01', '1')];
    expect(remaining(entries, 'global', 'lifo')).toEqual([
      ['2026-01-01', '0.5'],
      ['2026-02-01', '0'],
      ['2026-04-01', '1'],
    ]);
  });

  it('carries each lot cost, fee, venue and creation time, and only for the coin asked', () => {
    const [lot] = lots([buy('2026-01-01', '0.1', 'Ledger'), anEntry({ coin: 'ETH' as never })], BTC, 'global');
    expect(lot).toEqual(
      expect.objectContaining({ cost: '100', fee: null, venue: 'Ledger', units: '0.1', remainingUnits: '0.1' }),
    );
    expect(lots([], BTC, 'global')).toEqual([]);
  });

  it('gives each sale, in entry order, its units and how many of them came from lots with no cost', () => {
    const held = (day: string, quantity: string, venue: string) =>
      anEntry({ kind: 'held', slot: null, coin: BTC, date: date(day), units: units(quantity), amount: null, venue });
    const first = sell('2026-06-01', '0.3', 'Kraken');
    const second = sell('2026-07-01', '0.4', 'Kraken');
    const entries = [second, held('2025-01-01', '0.5', 'Ledger'), buy('2026-01-01', '0.5', 'Kraken'), first];
    const sales = (scope: 'global' | 'per-venue', rule: 'fifo' | 'lifo') =>
      matchLots(entries, BTC, scope, rule).sales.map((sale) => [sale.id, sale.units, sale.uncosted]);
    // Per venue, Kraken's sales take Kraken's purchase first; the 0.2 it cannot cover come off the Ledger lot.
    expect(sales('per-venue', 'fifo')).toEqual([
      [first.id, '0.3', '0'],
      [second.id, '0.4', '0.2'],
    ]);
    // One queue, FIFO: the held 0.5 go first, 0.3 and then 0.2 of the second sale.
    expect(sales('global', 'fifo')).toEqual([
      [first.id, '0.3', '0.3'],
      [second.id, '0.4', '0.2'],
    ]);
    // One queue, LIFO: the purchase goes first, 0.3 and then 0.2, before the held 0.2.
    expect(sales('global', 'lifo')).toEqual([
      [first.id, '0.3', '0'],
      [second.id, '0.4', '0.2'],
    ]);
    // Units no lot covers count as costed: the sale is unmatched in a group without purchases.
    expect(matchLots([sell('2026-06-01', '0.1', 'Bitvavo')], BTC, 'per-venue').sales).toEqual([
      expect.objectContaining({ units: '0.1', uncosted: '0', unmatched: '0.1', takes: [] }),
    ]);
  });
});

describe('the units a sale’s own venue cannot cover (docs/DOMAIN.md §3.7)', () => {
  const noCost = (day: string, quantity: string, venue: string) =>
    anEntry({ kind: 'held', slot: null, coin: BTC, date: date(day), units: units(quantity), amount: null, venue });

  it('per venue, the #368 repro: the June sale at Bitvavo takes the January Ledger lot (uncosted 1) and the September sale the August lot', () => {
    const january = noCost('2025-01-01', '1', 'Ledger');
    const june = { ...sell('2025-06-01', '1', 'Bitvavo'), amount: money('30000') };
    const august = buy('2025-08-01', '1', 'Ledger');
    const september = { ...sell('2025-09-01', '1', 'Ledger'), amount: money('300') };
    const match = matchLots([september, august, june, january], BTC, 'per-venue');
    expect(match.sales).toEqual([
      {
        id: june.id,
        units: '1',
        uncosted: '1',
        unmatched: '0',
        takes: [{ lot: january.id, units: '1', venue: 'Ledger', since: null }],
      },
      {
        id: september.id,
        units: '1',
        uncosted: '0',
        unmatched: '0',
        takes: [{ lot: august.id, units: '1', venue: 'Ledger', since: null }],
      },
    ]);
    expect(match.lots.map((lot) => lot.remainingUnits)).toEqual(['0', '0']);
    expect(match.unmatchedUnits).toBe('0');
    expect(matchLots([september, august, june, january], BTC, 'global')).toEqual(match);
  });

  it('a sale takes its own venue’s lots first, then only other venues’ lots dated on or before it', () => {
    const entries = [
      buy('2026-01-01', '0.3', 'Kraken'),
      buy('2026-01-15', '0.3', 'Ledger'),
      buy('2026-02-01', '0.2', 'Bitvavo'),
      buy('2026-05-01', '1', 'Ledger'),
    ];
    const sale = (quantity: string) => sell('2026-03-01', quantity, 'Bitvavo');
    // FIFO: Bitvavo's 0.2, then the oldest other lots, Kraken's 0.3 and 0.1 of Ledger's January lot.
    expect(remaining([...entries, sale('0.6')], 'per-venue')).toEqual([
      ['2026-01-01', '0'],
      ['2026-01-15', '0.2'],
      ['2026-02-01', '0'],
      ['2026-05-01', '1'],
    ]);
    // LIFO: Bitvavo's 0.2, then the latest other lot dated on or before the sale, Ledger's January lot, then Kraken's.
    expect(remaining([...entries, sale('0.6')], 'per-venue', 'lifo')).toEqual([
      ['2026-01-01', '0.2'],
      ['2026-01-15', '0'],
      ['2026-02-01', '0'],
      ['2026-05-01', '1'],
    ]);
    // Never the May lot, bought after the sale: the 0.2 no lot covers on 1 March stay unmatched.
    const short = matchLots([...entries, sale('1')], BTC, 'per-venue');
    expect(short.lots.map((lot) => lot.remainingUnits)).toEqual(['0', '0', '0', '1']);
    expect(short.unmatchedUnits).toBe('0.2');
    expect(short.sales[0]?.unmatched).toBe('0.2');
    // LIFO per venue, a sale short at its own venue: the rest comes off the latest other lot held then, Ledger's.
    const kraken = [
      buy('2026-01-01', '0.5', 'Kraken'),
      buy('2026-02-01', '0.3'),
      buy('2026-03-01', '0.2', 'Ledger'),
      sell('2026-04-01', '0.6', 'Kraken'),
      buy('2026-05-01', '0.4', 'Bitvavo'),
    ];
    expect(lots(kraken, BTC, 'per-venue', 'lifo').map((lot) => [lot.venue, lot.remainingUnits])).toEqual([
      ['Kraken', '0'],
      [null, '0.3'],
      ['Ledger', '0.1'],
      ['Bitvavo', '0.4'],
    ]);
  });

  it('takes list each lot and its units; with unmatched they sum to the sale’s units', () => {
    const quantity = fc.integer({ min: 1, max: 10_000 }).map((sats) => (sats / 1e4).toFixed(4));
    const records = fc.array(
      fc.record({
        kind: fc.constantFrom('extra' as const, 'held' as const, 'sell' as const),
        day: fc.integer({ min: 1, max: 9 }),
        venue: fc.constantFrom(null, 'Kraken', 'Ledger'),
        quantity,
      }),
      { maxLength: 30 },
    );
    const scopes = fc.constantFrom('global' as const, 'per-venue' as const);
    const rules = fc.constantFrom('fifo' as const, 'lifo' as const);
    fc.assert(
      fc.property(records, scopes, rules, (list, scope, rule) => {
        const entries = list.map(({ kind, day, venue, quantity: amount }) => {
          const on = `2026-02-0${day}`;
          if (kind === 'sell') return sell(on, amount, venue);
          return kind === 'held' ? noCost(on, amount, venue ?? 'Ledger') : buy(on, amount, venue);
        });
        const match = matchLots(entries, BTC, scope, rule);
        const byId = new Map(match.lots.map((lot) => [lot.id, lot]));
        const takenFrom = new Map<string, Units>();
        for (const sale of match.sales) {
          const entry = entries.find((each) => each.id === sale.id);
          expect(compare(sum([...sale.takes.map((take) => take.units), sale.unmatched]), sale.units)).toBe(0);
          const uncosted = sale.takes.filter((take) => byId.get(take.lot)?.cost === null).map((take) => take.units);
          expect(compare(sum(uncosted), sale.uncosted)).toBe(0);
          for (const take of sale.takes) {
            expect(compare(take.units, '0' as Units)).toBeGreaterThan(0);
            expect((byId.get(take.lot)?.date ?? '9999-12-31') <= (entry?.date ?? '')).toBe(true);
            takenFrom.set(take.lot, sum([takenFrom.get(take.lot) ?? ('0' as Units), take.units]));
          }
        }
        for (const lot of match.lots) {
          expect(compare(takenFrom.get(lot.id) ?? ('0' as Units), minus(lot.units, lot.remainingUnits))).toBe(0);
        }
      }),
    );
  });
});

describe('lot conservation (docs/ROADMAP.md M0: FIFO conservation)', () => {
  const quantity = fc.integer({ min: 1, max: 100_000 }).map((sats) => (sats / 1e4).toFixed(4));
  const events = fc.array(
    fc.record({
      sell: fc.boolean(),
      day: fc.integer({ min: 1, max: 28 }),
      venue: fc.constantFrom(null, 'Kraken', 'Ledger'),
      quantity,
    }),
    { maxLength: 40 },
  );
  const scopes = fc.constantFrom('global' as const, 'per-venue' as const);
  const rules = fc.constantFrom('fifo' as const, 'lifo' as const);

  it('holds every unit bought exactly once: remaining plus matched sales equals purchases, nothing negative', () => {
    fc.assert(
      fc.property(events, scopes, rules, (records, scope, rule) => {
        const entries = records.map((record) =>
          (record.sell ? sell : buy)(`2026-02-${String(record.day).padStart(2, '0')}`, record.quantity, record.venue),
        );
        const match = matchLots(entries, BTC, scope, rule);
        const bought = sum(entries.filter((entry) => entry.kind !== 'sell').map((entry) => entry.units));
        const sold = sum(entries.filter((entry) => entry.kind === 'sell').map((entry) => entry.units));
        const left = sum(match.lots.map((lot) => lot.remainingUnits));
        expect(minus(bought, left)).toBe(minus(sold, match.unmatchedUnits));
        for (const lot of match.lots) {
          expect(isNegative(lot.remainingUnits)).toBe(false);
          expect(compare(lot.remainingUnits, lot.units as Units)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});

describe('the places of a lot (docs/DOMAIN.md §3.7)', () => {
  it('keeps a lot’s open units at its venue, not yet moved, and names that venue on each take', () => {
    const kraken = buy('2026-01-01', '0.5', 'Kraken');
    const ledger = buy('2026-02-01', '0.3', 'Ledger');
    const sale = sell('2026-03-01', '0.6', 'Kraken');
    const match = matchLots([kraken, ledger, sale], BTC, 'per-venue');
    expect(match.lots.map((lot) => lot.places)).toEqual([[], [{ venue: 'Ledger', since: null, units: '0.2' }]]);
    expect(match.sales[0]?.takes).toEqual([
      { lot: kraken.id, units: '0.5', venue: 'Kraken', since: null },
      { lot: ledger.id, units: '0.1', venue: 'Ledger', since: null },
    ]);
  });

  it('takes the units held count off from the places too', () => {
    // The sale is dated before any purchase, so the lots keep 0.5 though 0.3 are held.
    const match = heldLots(
      matchLots([sell('2025-12-01', '0.2', 'Kraken'), buy('2026-01-01', '0.5', 'Kraken')], BTC, 'global'),
    );
    expect(match.lots.map((lot) => [lot.remainingUnits, lot.places])).toEqual([
      ['0.3', [{ venue: 'Kraken', since: null, units: '0.3' }]],
    ]);
    const all = heldLots(matchLots([sell('2025-12-01', '0.5'), buy('2026-01-01', '0.5')], BTC, 'global'));
    expect(all.lots.map((lot) => [lot.remainingUnits, lot.places])).toEqual([['0', []]]);
  });
});

describe('venueUnits (docs/DOMAIN.md §3.7)', () => {
  it('gives the units held at each venue on a date, matched per venue whatever the scope, no venue a place of its own', () => {
    const entries = [
      buy('2026-01-01', '0.5', 'Kraken'),
      buy('2026-02-01', '0.3'),
      buy('2026-03-01', '0.2', 'Ledger'),
      sell('2026-04-01', '0.6', 'Kraken'),
      buy('2026-05-01', '0.4', 'Bitvavo'),
    ];
    // Kraken's 0.5 cannot cover its 0.6 sale: the 0.1 left comes off the oldest other lot, the one with no venue.
    expect(venueUnits(entries, BTC, date('2026-04-01'))).toEqual([
      { venue: null, units: '0.2' },
      { venue: 'Ledger', units: '0.2' },
    ]);
    // Before the sale and the Bitvavo buy; dated on the day, a purchase counts.
    expect(venueUnits(entries, BTC, date('2026-03-01'))).toEqual([
      { venue: 'Kraken', units: '0.5' },
      { venue: null, units: '0.3' },
      { venue: 'Ledger', units: '0.2' },
    ]);
    expect(venueUnits(entries, BTC, date('2025-12-31'))).toEqual([]);
  });

  it('matches first in, first out per venue whatever the country’s rule: it takes no lot rule', () => {
    const entries = [
      buy('2026-01-01', '0.5', 'Kraken'),
      buy('2026-02-01', '0.3'),
      buy('2026-03-01', '0.2', 'Ledger'),
      sell('2026-04-01', '0.6', 'Kraken'),
    ];
    // Under LIFO the 0.1 Kraken lacks would come off Ledger's lot; FIFO takes it off the oldest, the one with no venue.
    // @ts-expect-error: no lot rule (docs/DOMAIN.md §3.7).
    expect(venueUnits(entries, BTC, date('2026-05-01'), 'lifo')).toEqual([
      { venue: null, units: '0.2' },
      { venue: 'Ledger', units: '0.2' },
    ]);
    // @ts-expect-error: no lot rule, as venueUnits.
    expect(venueUnitsAtMove(entries, BTC, date('2026-05-01'), null, 'lifo')).toEqual([
      { venue: null, units: '0.2' },
      { venue: 'Ledger', units: '0.2' },
    ]);
  });

  it('sums to the units held on the date, a sale no lot covered then taken off the oldest lots', () => {
    const entries = [
      sell('2025-12-01', '0.2', 'Kraken'),
      buy('2026-01-01', '0.5', 'Ledger'),
      buy('2026-02-01', '0.1', 'Kraken'),
    ];
    expect(venueUnits(entries, BTC, date('2026-02-01'))).toEqual([
      { venue: 'Ledger', units: '0.3' },
      { venue: 'Kraken', units: '0.1' },
    ]);
  });
});

describe('venueUnitsAtMove (docs/DOMAIN.md §3.7)', () => {
  const at = (time: string) => instant(`2026-02-01T${time}:00Z`);
  const moveOn = (quantity: string, to: string, created: string) =>
    aMove({
      coin: BTC,
      date: date('2026-02-01'),
      units: units(quantity),
      received: units(quantity),
      to,
      createdAt: at(created),
    });

  it("reads the venues after the date's purchases and earlier moves, before its sales, the edited move at its own place", () => {
    const early = moveOn('0.1', 'Ledger', '09:00');
    const late = moveOn('0.2', 'Coinbase', '11:00');
    const entries = [
      buy('2026-01-01', '0.5', 'Kraken'),
      buy('2026-02-01', '0.1', 'Kraken'),
      early,
      late,
      sell('2026-02-01', '0.6', 'Kraken'),
      buy('2026-02-02', '1', 'Kraken'),
    ];
    // A new move comes after both stored moves; the sale and the next day's purchase never count.
    expect(venueUnitsAtMove(entries, BTC, date('2026-02-01'), null)).toEqual([
      { venue: 'Kraken', units: '0.3' },
      { venue: 'Ledger', units: '0.1' },
      { venue: 'Coinbase', units: '0.2' },
    ]);
    // A move stamped 10:00 sits between them.
    expect(venueUnitsAtMove(entries, BTC, date('2026-02-01'), { createdAt: at('10:00'), id: late.id })).toEqual([
      { venue: 'Kraken', units: '0.5' },
      { venue: 'Ledger', units: '0.1' },
    ]);
    // Unlike venueUnits, a sale that no lot covered is not taken off the lots bought after it.
    const short = [sell('2025-12-01', '0.2', 'Kraken'), buy('2026-01-01', '0.5', 'Kraken')];
    expect(venueUnitsAtMove(short, BTC, date('2026-02-01'), null)).toEqual([{ venue: 'Kraken', units: '0.5' }]);
  });
});

describe('a move (docs/DOMAIN.md §3.7, ADR-0054)', () => {
  const move = (day: string, quantity: string, received: string, venue: string | null, to: string) =>
    aMove({ coin: BTC, date: date(day), units: units(quantity), received: units(received), venue, to });

  it('PT: takes the fee first, places the rest at its destination dated the move, and a sale there takes the moved lot', () => {
    const l1 = buy('2025-01-10', '0.10', 'Bitvavo');
    const l2 = buy('2025-02-01', '0.05', 'Kraken');
    const moved = move('2025-06-01', '0.05', '0.0498', 'Kraken', 'Ledger');
    const match = matchLots([l1, l2, moved], BTC, 'per-venue');
    expect(match.moves).toEqual([
      {
        id: moved.id,
        units: '0.05',
        fee: '0.0002',
        unmatched: '0',
        atDestination: '0',
        takes: [{ lot: l2.id, units: '0.05', venue: 'Kraken', since: null }],
      },
    ]);
    expect(match.lots.map((lot) => [lot.remainingUnits, lot.places])).toEqual([
      ['0.10', [{ venue: 'Bitvavo', since: null, units: '0.10' }]],
      ['0.0498', [{ venue: 'Ledger', since: '2025-06-01', units: '0.0498' }]],
    ]);
    const sale = sell('2025-09-01', '0.04', 'Ledger');
    expect(matchLots([l1, l2, moved, sale], BTC, 'per-venue').sales[0]?.takes).toEqual([
      { lot: l2.id, units: '0.04', venue: 'Ledger', since: '2025-06-01' },
    ]);
  });

  it('takes a shortfall of its units received from the other venues, never from its destination, and leaves the rest unmatched', () => {
    const kraken = buy('2025-01-10', '0.02', 'Kraken');
    const ledger = buy('2025-01-11', '0.5', 'Ledger');
    const bitvavo = buy('2025-01-12', '0.01', 'Bitvavo');
    const moved = move('2025-06-01', '0.05', '0.03', 'Kraken', 'Ledger');
    const match = matchLots([kraken, ledger, bitvavo, moved], BTC, 'global');
    expect(match.moves[0]).toEqual({
      id: moved.id,
      units: '0.05',
      fee: '0.02',
      unmatched: '0.02',
      atDestination: '0',
      takes: [
        { lot: kraken.id, units: '0.02', venue: 'Kraken', since: null },
        { lot: bitvavo.id, units: '0.01', venue: 'Bitvavo', since: null },
      ],
    });
    // The fee, 0.02, came from Kraken; the 0.01 from Bitvavo arrived at Ledger, beside Ledger's own lot.
    expect(match.lots.map((lot) => lot.remainingUnits)).toEqual(['0', '0.5', '0.01']);
    expect(match.lots[2]?.places).toEqual([{ venue: 'Ledger', since: '2025-06-01', units: '0.01' }]);
    expect(match.unmatchedUnits).toBe('0');
  });

  it("a move whose pieces outside its destination cannot pay its fee takes the rest of the fee from the destination's pieces by the lot rule and adds none of them to it", () => {
    const ledger = buy('2025-01-10', '0.5', 'Ledger');
    const moved = move('2025-06-01', '0.05', '0.04', 'Kraken', 'Ledger');
    const match = matchLots([ledger, moved], BTC, 'per-venue');
    expect(match.moves[0]).toEqual({
      id: moved.id,
      units: '0.05',
      fee: '0.01',
      unmatched: '0.04',
      atDestination: '0.01',
      takes: [{ lot: ledger.id, units: '0.01', venue: 'Ledger', since: null }],
    });
    expect(match.unmatchedUnits).toBe('0');
    const ledgerOnly = [['0.49', [{ venue: 'Ledger', since: null, units: '0.49' }]]];
    expect(match.lots.map((lot) => [lot.remainingUnits, lot.places])).toEqual(ledgerOnly);
    expect(heldLots(match).lots.map((lot) => [lot.remainingUnits, lot.places])).toEqual(ledgerOnly);
  });

  it('LIFO: the rest of the fee comes from the latest piece at the destination', () => {
    const first = buy('2025-01-10', '0.3', 'Ledger');
    const second = buy('2025-02-10', '0.2', 'Ledger');
    const moved = move('2025-06-01', '0.05', '0.04', 'Kraken', 'Ledger');
    const lifo = matchLots([first, second, moved], BTC, 'per-venue', 'lifo');
    expect(lifo.moves[0]?.takes).toEqual([{ lot: second.id, units: '0.01', venue: 'Ledger', since: null }]);
    expect(lifo.lots.map((lot) => lot.remainingUnits)).toEqual(['0.3', '0.19']);
    const fifo = matchLots([first, second, moved], BTC, 'per-venue', 'fifo');
    expect(fifo.lots.map((lot) => lot.remainingUnits)).toEqual(['0.29', '0.2']);
  });

  it("a new move dated before a stored move on its route takes the stored move's fee at the destination", () => {
    const kraken = buy('2026-01-10', '0.10', 'Kraken');
    const february = move('2026-02-01', '0.10', '0.0998', 'Kraken', 'Ledger');
    const march = move('2026-03-01', '0.10', '0.0998', 'Kraken', 'Ledger');
    const match = matchLots([kraken, february, march], BTC, 'global');
    expect(match.moves[1]).toEqual({
      id: march.id,
      units: '0.10',
      fee: '0.0002',
      unmatched: '0.0998',
      atDestination: '0.0002',
      takes: [{ lot: kraken.id, units: '0.0002', venue: 'Ledger', since: '2026-02-01' }],
    });
    expect(match.unmatchedUnits).toBe('0');
    expect(match.lots.map((lot) => lot.remainingUnits)).toEqual(['0.0996']);
    expect(heldLots(match).lots.map((lot) => lot.remainingUnits)).toEqual(['0.0996']);
  });

  it("a move's fee stays unmatched only when no piece of the coin, the destination's included, covers it", () => {
    const ledger = buy('2025-01-10', '0.005', 'Ledger');
    const moved = move('2025-06-01', '0.05', '0.04', 'Kraken', 'Ledger');
    const match = matchLots([ledger, moved], BTC, 'per-venue');
    expect(match.moves[0]).toMatchObject({ fee: '0.01', unmatched: '0.045', atDestination: '0.005' });
    expect(match.unmatchedUnits).toBe('0.005');
    expect(heldLots(match).lots.map((lot) => lot.remainingUnits)).toEqual(['0']);
  });

  it('merges the units a second move brings to one place on one day', () => {
    const kraken = buy('2025-01-10', '0.10', 'Kraken');
    const first = move('2025-06-01', '0.02', '0.02', 'Kraken', 'Ledger');
    const second = move('2025-06-01', '0.03', '0.03', 'Kraken', 'Ledger');
    expect(matchLots([kraken, first, second], BTC, 'per-venue').lots[0]?.places).toEqual([
      { venue: 'Kraken', since: null, units: '0.05' },
      { venue: 'Ledger', since: '2025-06-01', units: '0.05' },
    ]);
  });
});
