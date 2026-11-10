import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aMove, anEntry, BTC, date, month, units } from '../../test/builders';
import { movesLeftShort } from '../actions/moves';
import { compare, isPositive, minus, plus, sum, type Units } from '../money/decimal';
import type { LotRule, LotScope } from '../schema/country';
import { ENTRY_KINDS, type Entry } from '../schema/entry';
import { feeUnmatched, matchLots } from './lots';
import { type MoveShortfall, moveShortfalls } from './move-shortfalls';

// docs/DOMAIN.md §3.7: a move's units sent are what the Log finds outside its destination plus its `short`; per-venue
// lots list it exactly when `short` is above 0, global lots exactly when its fee lost its cover outside the destination.
// `movesLeftShort` names only stored moves whose measure a write made larger.

const DAYS = ['2025-01-10', '2025-06-10', '2025-11-10', '2026-03-10', '2026-08-10'];
const QUANTITIES = ['0.001', '0.004', '0.01', '0.025', '0.10'];
const PLACES = ['Kraken', 'Bitvavo', 'Ledger'] as const;
const VENUES = [...PLACES, null];

type Shape = { kind: Entry['kind']; day: string; quantity: string; venue: string | null; to: string; whole: boolean };
const entryOf = ({ kind, day, quantity, venue, to, whole }: Shape): Entry =>
  kind === 'move'
    ? aMove({
        coin: BTC.id,
        date: date(day),
        units: units(quantity),
        venue,
        to: to === venue ? PLACES[(PLACES.indexOf(to as (typeof PLACES)[number]) + 1) % PLACES.length] : to,
        received: whole || quantity === '0.001' ? units(quantity) : minus(units(quantity), units('0.001')),
      })
    : anEntry({
        kind,
        slot: kind === 'dca' ? month('2026-01') : null,
        coin: BTC.id,
        date: date(day),
        units: units(quantity),
        amount: kind === 'held' ? null : ('100' as Entry['amount']),
        venue,
      });
const entry = fc
  .record({
    kind: fc.constantFrom(...ENTRY_KINDS),
    day: fc.constantFrom(...DAYS),
    quantity: fc.constantFrom(...QUANTITIES),
    venue: fc.constantFrom(...VENUES),
    to: fc.constantFrom(...PLACES),
    whole: fc.boolean(),
  })
  .map(entryOf);
const log = fc.array(entry, { minLength: 1, maxLength: 10 });
const holding = fc.record({
  overrides: fc.constant([]),
  lotScope: fc.constantFrom<LotScope>('global', 'per-venue'),
  lotRule: fc.constantFrom<LotRule>('fifo', 'lifo'),
});

/** What the scope rule reads: `short` per venue, the fee's lost cover under global lots; 0 for a move not listed. */
const measure = (listed: readonly MoveShortfall[], id: Entry['id'], scope: LotScope): Units => {
  const found = listed.find((each) => each.id === id);
  if (found === undefined) return '0' as Units;
  return scope === 'per-venue' ? found.short : plus(found.feeAtDestination, found.feeUncovered);
};

describe('moveShortfalls and movesLeftShort (docs/DOMAIN.md §3.7)', () => {
  it("a move's outside plus short equals its units sent, and per venue it is listed exactly when short is above 0", () => {
    fc.assert(
      fc.property(log, holding, (entries, context) => {
        const match = matchLots(entries, BTC.id, context.lotScope, context.lotRule);
        const listed = moveShortfalls(entries, BTC.id, context);
        for (const shortfall of listed)
          expect(compare(plus(shortfall.outside, shortfall.short), shortfall.sent)).toBe(0);
        const expected = match.moves.filter((move) => {
          const to = entries.find((each) => each.id === move.id)?.to;
          const outside = sum(move.takes.filter((take) => take.venue !== to).map((take) => take.units));
          return context.lotScope === 'per-venue'
            ? isPositive(minus(move.units, outside))
            : isPositive(plus(move.atDestination, feeUnmatched(move)));
        });
        expect(listed.map((each) => each.id)).toEqual(expected.map((move) => move.id));
      }),
    );
  });

  it('movesLeftShort never names a move whose measure the write left as stored or smaller', () => {
    fc.assert(
      fc.property(log, entry, fc.nat(9), holding, (entries, drawn, at, context) => {
        // The write is a new entry, or an edit of a stored one under its id.
        const stored = entries[at % entries.length] as Entry;
        const written = at % 2 === 0 ? [drawn] : [{ ...drawn, id: stored.id }];
        const after = [...entries.filter((each) => each.id !== written[0]?.id), ...written];
        const before = moveShortfalls(entries, BTC.id, context);
        const later = moveShortfalls(after, BTC.id, context);
        for (const named of movesLeftShort(entries, written, context)) {
          expect(written.some((each) => each.id === named.id)).toBe(false);
          const grown = compare(
            measure(later, named.id, context.lotScope),
            measure(before, named.id, context.lotScope),
          );
          expect(grown).toBeGreaterThan(0);
        }
      }),
    );
  });
});
