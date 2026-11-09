import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, aPlan, BTC, date, instant, money, month, units } from '../../test/builders';
import { compare, isPositive, max, min, minus, type Price, plus, sum, type Units } from '../money/decimal';
import type { LotRule, LotScope } from '../schema/country';
import { ENTRY_KINDS, type Entry } from '../schema/entry';
import type { PriceSnapshot } from '../schema/prices';
import { unitsIn, unitsOut } from './effect';
import { heldLots, type LotMatch, matchLots } from './lots';
import { portfolio } from './portfolio';

// docs/DOMAIN.md §3.7: a lot's open units are kept by place, the venue they are held at; the places are the lot's
// remaining units split, never more and never fewer, whatever the kinds, dates, venues, scope and rule. A move (ADR-0054)
// takes its units sent from its source, never from its destination, and only its fee, sent − received, leaves the coin.

const DAYS = ['2025-01-10', '2025-06-10', '2025-11-10', '2026-03-10', '2026-08-10'];
const QUANTITIES = ['0.001', '0.004', '0.01', '0.025', '0.10'];
const PLACES = ['Kraken', 'Bitvavo', 'Ledger'] as const;
const VENUES = [...PLACES, null];
const SCOPES: LotScope[] = ['global', 'per-venue'];
const RULES: LotRule[] = ['fifo', 'lifo'];

type Shape = { day: string; quantity: string; venue: string | null; to: string; whole: boolean };

/** A valid move: `to` a venue other than its source, `received` all units sent or 0.001 fewer. */
const moveOf = ({ day, quantity, venue, to, whole }: Shape) =>
  aMove({
    coin: BTC.id,
    date: date(day),
    units: units(quantity),
    venue,
    to: to === venue ? PLACES[(PLACES.indexOf(to as (typeof PLACES)[number]) + 1) % PLACES.length] : to,
    received: whole || quantity === '0.001' ? units(quantity) : minus(units(quantity), units('0.001')),
  });

const shape = {
  day: fc.constantFrom(...DAYS),
  quantity: fc.constantFrom(...QUANTITIES),
  venue: fc.constantFrom(...VENUES),
  to: fc.constantFrom(...PLACES),
  whole: fc.boolean(),
};
const move = fc.record(shape).map(moveOf);
const entry: fc.Arbitrary<Entry> = fc.record({ kind: fc.constantFrom(...ENTRY_KINDS), ...shape }).map((drawn) =>
  drawn.kind === 'move'
    ? moveOf(drawn)
    : anEntry({
        kind: drawn.kind,
        slot: drawn.kind === 'dca' ? month('2026-01') : null,
        coin: BTC.id,
        date: date(drawn.day),
        units: units(drawn.quantity),
        amount: drawn.kind === 'held' ? null : money('100'),
        venue: drawn.venue,
      }),
);
/** A log that starts with a purchase, so the coin always has a position. */
const log = fc
  .tuple(fc.constantFrom(...VENUES), fc.array(entry, { maxLength: 10 }))
  .map(([venue, rest]) => [
    anEntry({ kind: 'extra', slot: null, date: date('2025-01-10'), units: units('0.01'), venue }),
    ...rest,
  ]);
const scopes = fc.constantFrom(...SCOPES);
const rules = fc.constantFrom(...RULES);

const plan = aPlan({ coins: [BTC] });
const prices: PriceSnapshot = {
  at: instant('2026-10-16T14:05:00+01:00'),
  prices: { BTC: { EUR: '60000' as Price } } as PriceSnapshot['prices'],
};
const positionOf = (entries: readonly Entry[], lotScope: LotScope, lotRule: LotRule) => {
  const position = portfolio(plan, entries, prices, { overrides: [], lotScope, lotRule }).positions[0];
  if (position === undefined) throw new Error('No position');
  return position;
};
/** The units held as `bought − sold − fees`, never below 0 (§3.6). */
const unitsHeld = (entries: readonly Entry[]) =>
  max(minus(sum(entries.map(unitsIn)), sum(entries.map(unitsOut))), '0' as Units);
const placed = (match: LotMatch) => sum(match.lots.flatMap((lot) => lot.places.map((place) => place.units)));
const same = (a: string | null, b: string | null) =>
  a === null || b === null ? expect(a).toBe(b) : expect(compare(a as Units, b as Units)).toBe(0);
/** Each sale's units taken per lot, whatever place within the lot they came from. */
const takenPerLot = (match: LotMatch) =>
  match.sales.map((sale) => {
    const perLot = new Map<string, Units>();
    for (const take of sale.takes) perLot.set(take.lot, plus(perLot.get(take.lot) ?? ('0' as Units), take.units));
    return [...perLot].sort(([a], [b]) => (a < b ? -1 : 1));
  });
const placesHold = (match: LotMatch) => {
  for (const lot of match.lots) {
    expect(sum(lot.places.map((place) => place.units))).toBe(sum([lot.remainingUnits]));
    expect(lot.places.every((place) => isPositive(place.units))).toBe(true);
  }
};

// The edge cases every run tries: a move from a venue with nothing there, one larger than all units held, one that
// sends everything, two moves on one day, and a sale at the destination on the move's date.
const buy = (venue: string | null, quantity = '0.01', day = '2025-01-10') =>
  anEntry({ kind: 'extra', slot: null, date: date(day), units: units(quantity), venue });
const sale = (venue: string | null, quantity: string, day: string) =>
  anEntry({ kind: 'sell', slot: null, date: date(day), units: units(quantity), venue });
const at = (day: string, quantity: string, venue: string | null, to: string, whole: boolean) =>
  moveOf({ day, quantity, venue, to, whole });
const EDGES: [Entry[], Entry][] = [
  [[buy('Kraken')], at('2025-06-10', '0.01', 'Bitvavo', 'Ledger', false)],
  [[buy('Kraken')], at('2025-06-10', '0.10', 'Kraken', 'Ledger', false)],
  [[buy('Kraken'), buy('Ledger')], at('2025-06-10', '0.01', 'Kraken', 'Ledger', true)],
  [
    [buy('Kraken', '0.025'), at('2025-06-10', '0.01', 'Kraken', 'Ledger', false)],
    at('2025-06-10', '0.004', 'Kraken', 'Bitvavo', false),
  ],
  [
    [buy('Kraken'), buy(null), sale('Ledger', '0.004', '2025-06-10')],
    at('2025-06-10', '0.01', 'Kraken', 'Ledger', false),
  ],
];

describe('lot places (docs/DOMAIN.md §3.7)', () => {
  it('places of each lot sum to its remaining units', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), scopes, rules, (entries, scope, rule) => {
        const match = matchLots(entries, BTC.id, scope, rule);
        placesHold(match);
        placesHold(heldLots(match));
        // A place away from where the lot was bought is the destination of a move on its date.
        for (const lot of match.lots)
          for (const place of lot.places)
            if (place.since !== null)
              expect(
                entries.some((each) => each.kind === 'move' && each.to === place.venue && each.date === place.since),
              ).toBe(true);
      }),
      { examples: EDGES.map(([entries, last]) => [[...entries, last], 'per-venue', 'fifo']) },
    );
  });

  it('places sum to units held', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), scopes, rules, (entries, scope, rule) => {
        same(placed(heldLots(matchLots(entries, BTC.id, scope, rule))), unitsHeld(entries));
      }),
      { examples: EDGES.map(([entries, last]) => [[...entries, last], 'global', 'lifo']) },
    );
  });

  it('a move never takes from its destination', () => {
    fc.assert(
      fc.property(log, move, scopes, rules, (entries, last, scope, rule) => {
        const all = [...entries, last];
        for (const each of matchLots(all, BTC.id, scope, rule).moves) {
          const to = all.find((one) => one.id === each.id)?.to;
          expect(each.takes.every((take) => take.venue !== to)).toBe(true);
          same(plus(sum(each.takes.map((take) => take.units)), each.unmatched), each.units);
        }
      }),
      { examples: EDGES.map(([entries, last]) => [entries, last, 'per-venue', 'fifo']) },
    );
  });
});

describe('a move (ADR-0054)', () => {
  it('a move with received = sent changes no units, invested, average, P/L, take or unmatched unit', () => {
    fc.assert(
      fc.property(log, move, scopes, rules, (drawn, last, scope, rule) => {
        // Against a log of purchases and sales: a second move can find the units this one placed at its destination
        // out of its reach, which changes where its fee comes from but never the units held.
        const entries = drawn.filter((each) => each.kind !== 'move');
        const whole = { ...last, received: last.units };
        const [before, after] = [positionOf(entries, scope, rule), positionOf([...entries, whole], scope, rule)];
        same(after.units, before.units);
        same(after.invested, before.invested);
        same(after.average, before.average);
        const [matched, moved] = [
          matchLots(entries, BTC.id, scope, rule),
          matchLots([...entries, whole], BTC.id, scope, rule),
        ];
        same(moved.unmatchedUnits, matched.unmatchedUnits);
        // Per venue the units a sale finds at its venue move with the coins, so which lot it takes changes; one queue
        // for every venue keeps every take and so the P/L.
        if (scope === 'global') {
          same(after.pnl, before.pnl);
          expect(takenPerLot(moved)).toEqual(takenPerLot(matched));
        }
      }),
      { examples: EDGES.map(([entries, last]) => [entries, last, 'global', 'fifo']) },
    );
  });

  it('a move lowers units held by exactly sent − received', () => {
    fc.assert(
      fc.property(log, move, scopes, rules, (entries, last, scope, rule) => {
        const fee = minus(last.units, last.received ?? last.units);
        const [before, after] = [positionOf(entries, scope, rule), positionOf([...entries, last], scope, rule)];
        same(after.units, max(minus(before.units, fee), '0' as Units));
        same(after.soldUnits, plus(before.soldUnits, fee));
        same(after.invested, before.invested);
        same(placed(heldLots(matchLots([...entries, last], BTC.id, scope, rule))), after.units);
      }),
      { examples: EDGES.map(([entries, last]) => [entries, last, 'per-venue', 'lifo']) },
    );
  });

  it('deleting a move returns exactly its fee', () => {
    fc.assert(
      fc.property(log, move, scopes, rules, (entries, last, scope, rule) => {
        const fee = minus(last.units, last.received ?? last.units);
        const deleted = { ...last, deletedAt: instant('2026-10-01T09:00:00+00:00') };
        const [kept, gone] = [
          positionOf([...entries, last], scope, rule),
          positionOf([...entries, deleted], scope, rule),
        ];
        same(minus(gone.units, kept.units), min(fee, gone.units));
        same(placed(heldLots(matchLots([...entries, deleted], BTC.id, scope, rule))), gone.units);
      }),
      { examples: EDGES.map(([entries, last]) => [entries, last, 'global', 'fifo']) },
    );
  });
});
