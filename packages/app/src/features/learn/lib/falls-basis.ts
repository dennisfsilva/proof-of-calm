import type { Formatters } from '../../../lib/format';
import type { PastFall } from '../../../lib/services/red-day-types';

// What the falls' source sentences say they were computed from (docs/LEGAL.md §4): a row with no `basis` runs from
// an intraday high to an intraday low, one with `basis: 'close'` between daily closes. The module chart's source
// line and the fall page's line over each coin's falls both name the publishers from here.

/** The rows' basis for a message's select: every row intraday, every row on closes, or both kinds. */
function fallsBasis(falls: readonly PastFall[]): 'intraday' | 'close' | 'mixed' {
  const closes = falls.filter(({ basis }) => basis === 'close').length;
  if (closes === 0) return 'intraday';
  return closes === falls.length ? 'close' : 'mixed';
}

// A row whose high and low come from two series names both, "Bitcoinity (Mt. Gox) and CoinMarketCap": the word
// "and" between two names joins them, and no publisher's own name holds it. Content's drawdown-publisher-joined
// (packages/content/src/publisher-validate.ts) holds each value to a closed grammar of one name or two, so this split
// always gives whole names; it cannot tell a join from a name that holds " and " ("Smith and Wesson" would read as
// two), which the content review keeps out. The pattern stays here, as the lazy chunk takes no value from content
// (module-chart.tsx's header).
const JOINED_PUBLISHERS = / and /;

/** Each publisher once, by name, compound values split into their names, for the source sentence. */
const publisherNames = (publishers: readonly string[]) =>
  [...new Set(publishers.flatMap((publisher) => publisher.split(JOINED_PUBLISHERS)))].sort((a, b) =>
    a.localeCompare(b),
  );

/**
 * A row's publisher as the page shows it, in the falls tables' Source column and the fall page's line: a compound
 * value's names joined by the page's list (docs/CONTENT-STYLE.md §1 rule 9), so pt-PT reads "Bitcoinity (Mt. Gox) e
 * CoinMarketCap" where English keeps the cycles file's "and".
 */
export const rowPublisher = ({ publisher }: Pick<PastFall, 'publisher'>, f: Formatters) =>
  f.list(publisher.split(JOINED_PUBLISHERS));

/**
 * The rows' basis and each publisher once under the basis of its rows: `intraday` the publishers of intraday rows,
 * `closes` those of rows on daily closes, '' for none.
 */
export function fallsSources(falls: readonly PastFall[], f: Formatters) {
  const publishers = (rows: readonly PastFall[]) => f.list(publisherNames(rows.map(({ publisher }) => publisher)));
  return {
    basis: fallsBasis(falls),
    intraday: publishers(falls.filter(({ basis }) => basis === undefined)),
    closes: publishers(falls.filter(({ basis }) => basis === 'close')),
  };
}
