import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, BTC, date, money, month, units } from '../../test/builders';
import { isPositive, sum } from '../money/decimal';
import { ENTRY_KINDS, type Entry } from '../schema/entry';
import { heldLots, type LotMatch, matchLots } from './lots';

// docs/DOMAIN.md §3.7: a lot's open units are kept by place, the venue they are held at; the places are the lot's
// remaining units split, never more and never fewer, whatever the kinds, dates, venues, scope and rule.

const DAYS = ['2025-01-10', '2025-06-10', '2025-11-10', '2026-03-10', '2026-08-10'];
const QUANTITIES = ['0.001', '0.004', '0.01', '0.025', '0.10'];
const VENUES = ['Kraken', 'Bitvavo', 'Ledger', null];

const entry: fc.Arbitrary<Entry> = fc
  .record({
    kind: fc.constantFrom(...ENTRY_KINDS),
    day: fc.constantFrom(...DAYS),
    quantity: fc.constantFrom(...QUANTITIES),
    venue: fc.constantFrom(...VENUES),
  })
  .map(({ kind, day, quantity, venue }) =>
    anEntry({
      kind,
      slot: kind === 'dca' ? month('2026-01') : null,
      coin: BTC.id,
      date: date(day),
      units: units(quantity),
      amount: kind === 'held' ? null : money('100'),
      venue,
    }),
  );

const placesHold = (match: LotMatch) => {
  for (const lot of match.lots) {
    expect(sum(lot.places.map((place) => place.units))).toBe(sum([lot.remainingUnits]));
    expect(lot.places.every((place) => isPositive(place.units))).toBe(true);
  }
};

describe('lot places (docs/DOMAIN.md §3.7)', () => {
  it('places of each lot sum to its remaining units', () => {
    fc.assert(
      fc.property(
        fc.array(entry, { maxLength: 12 }),
        fc.constantFrom('global' as const, 'per-venue' as const),
        fc.constantFrom('fifo' as const, 'lifo' as const),
        (entries, scope, rule) => {
          const match = matchLots(entries, BTC.id, scope, rule);
          placesHold(match);
          placesHold(heldLots(match));
          // No entry moves units yet, so each place is still where the lot was bought.
          for (const lot of match.lots)
            for (const place of lot.places) expect(place).toMatchObject({ venue: lot.venue, since: null });
        },
      ),
    );
  });
});
