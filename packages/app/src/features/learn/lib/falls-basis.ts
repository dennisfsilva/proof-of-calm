import type { PastFall } from '../../../lib/services/red-day-types';

// What the falls' source sentences say they were computed from (docs/LEGAL.md §4): a row with no `basis` runs from
// an intraday high to an intraday low, one with `basis: 'close'` between daily closes.

/** The rows' basis for a message's select: every row intraday, every row on closes, or both kinds. */
export function fallsBasis(falls: readonly PastFall[]): 'intraday' | 'close' | 'mixed' {
  const closes = falls.filter(({ basis }) => basis === 'close').length;
  if (closes === 0) return 'intraday';
  return closes === falls.length ? 'close' : 'mixed';
}
