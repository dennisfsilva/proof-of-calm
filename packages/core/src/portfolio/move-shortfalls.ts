// The stored moves that send more than the Log finds outside their destination (docs/DOMAIN.md §3.7): the lines the
// Log shows beside them never refuse a write (research Q10), and only the lot scope decides which moves they name.
import type { CalendarDate } from '../dates/calendar';
import { isPositive, max, minus, plus, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { defined } from '../result';
import type { Entry } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import { feeUnmatched, type HoldingContext, matchLots, venueUnitsAtMove } from './lots';

/**
 * A move's units sent, the units the Log holds at every venue but its destination at the move's place in the matching
 * order (`outside`, `venueUnitsAtMove`, the figures of the move form's source cards), how many more it sends (`short`,
 * 0 when none), and from the country's matching the units of its fee taken at the destination and those no piece of the
 * coin covered. A listed move has `outside + short = sent`.
 */
export type MoveShortfall = {
  readonly id: EntityId;
  readonly coin: CoinId;
  readonly date: CalendarDate;
  readonly from: string | null;
  readonly to: string;
  readonly sent: Units;
  readonly outside: Units;
  readonly short: Units;
  readonly feeAtDestination: Units;
  readonly feeUncovered: Units;
};

/**
 * What a write may not make larger for `movesLeftShort`: `short` under per-venue lots, the fee's lost cover outside the
 * destination (`feeAtDestination + feeUncovered`) under global lots (research Q5).
 */
export function shortfallMeasure(shortfall: MoveShortfall, context: HoldingContext): Units {
  return context.lotScope === 'per-venue' ? shortfall.short : plus(shortfall.feeAtDestination, shortfall.feeUncovered);
}

/**
 * The coin's live moves the scope rule lists, in `compareEntries` order: under per-venue lots each with `short` above
 * 0; under global lots each with `short` and its measure above 0, since there the matching's pieces sit where global
 * sales left them, not where the Log shows the units, and a fee covered outside the destination leaves nothing to check.
 */
export function moveShortfalls(
  entries: readonly Entry[],
  coin: CoinId,
  context: HoldingContext,
): readonly MoveShortfall[] {
  const byId = new Map(liveEntries(entries).map((entry) => [entry.id, entry]));
  return matchLots(entries, coin, context.lotScope, context.lotRule).moves.flatMap((match) => {
    const move = defined(byId.get(match.id), 'the move');
    const to = defined(move.to, 'destination');
    const held = venueUnitsAtMove(entries, coin, move.date, move).filter((place) => place.venue !== to);
    const outside = sum(held.map((place) => place.units));
    const shortfall: MoveShortfall = {
      id: move.id,
      coin,
      date: move.date,
      from: move.venue,
      to,
      sent: move.units,
      outside,
      short: max(minus(move.units, outside), '0' as Units),
      feeAtDestination: match.atDestination,
      feeUncovered: feeUnmatched(match),
    };
    const listed = isPositive(shortfall.short) && isPositive(shortfallMeasure(shortfall, context));
    return listed ? [shortfall] : [];
  });
}
