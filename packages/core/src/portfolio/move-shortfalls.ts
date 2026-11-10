// The stored moves that send more than the Log finds outside their destination (docs/DOMAIN.md §3.7): the lines the
// Log shows beside them never refuse a write (research Q10), and only the lot scope decides which moves they name.
import type { CalendarDate } from '../dates/calendar';
import { isPositive, minus, plus, sum, type Units } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { defined } from '../result';
import type { Entry } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import { feeUnmatched, type HoldingContext, matchLots } from './lots';

/**
 * A move's units sent, the part of them the matching found outside its destination (`outside`), the rest (`short`),
 * the units of its fee taken at the destination and those no piece of the coin covered: `outside + short = sent`.
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
 * What the scope rule reads of a shortfall: `short` under per-venue lots, the fee's lost cover outside the destination
 * (`feeAtDestination + feeUncovered`) under global lots (research Q5). A move is listed while it is above 0.
 */
export function shortfallMeasure(shortfall: MoveShortfall, context: HoldingContext): Units {
  return context.lotScope === 'per-venue' ? shortfall.short : plus(shortfall.feeAtDestination, shortfall.feeUncovered);
}

/** The coin's live moves the scope rule lists, in `compareEntries` order, read from the country's matching. */
export function moveShortfalls(
  entries: readonly Entry[],
  coin: CoinId,
  context: HoldingContext,
): readonly MoveShortfall[] {
  const byId = new Map(liveEntries(entries).map((entry) => [entry.id, entry]));
  return matchLots(entries, coin, context.lotScope, context.lotRule).moves.flatMap((match) => {
    const move = defined(byId.get(match.id), 'the move');
    const to = defined(move.to, 'destination');
    const outside = sum(match.takes.filter((take) => take.venue !== to).map((take) => take.units));
    const shortfall: MoveShortfall = {
      id: move.id,
      coin,
      date: move.date,
      from: move.venue,
      to,
      sent: move.units,
      outside,
      short: minus(move.units, outside),
      feeAtDestination: match.atDestination,
      feeUncovered: feeUnmatched(match),
    };
    return isPositive(shortfallMeasure(shortfall, context)) ? [shortfall] : [];
  });
}
