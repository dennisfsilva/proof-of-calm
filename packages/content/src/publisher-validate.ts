// A drawdown row's publisher as the falls tables and source lines split it: packages/app's falls-basis.ts splits a
// value on " and " into the names of the two series a row's high and low come from, "Bitcoinity (Mt. Gox) and
// CoinMarketCap", and keeps its own pattern, since the app's lazy chunk takes no value from content. This check
// refuses each value whose split would not give one or two whole names (docs/CONTENT-STYLE.md §3, the falls tables).
import type { Problem } from './problem.ts';
import type { ContentDrawdown } from './schema/drawdown.ts';

const JOIN = ' and ';

const count = (text: string, sign: string) => text.split(sign).length - 1;

/** Why the split of `publisher` gives no one or two whole names, or null when it does. */
function joinFault(publisher: string): string | null {
  const names = publisher.split(JOIN);
  if (names.length > 2) return `joins more than two names with "${JOIN}"`;
  if (names.length === 2 && names.some((name) => count(name, '(') !== count(name, ')'))) {
    return `has "${JOIN}" inside parentheses`;
  }
  if (names.some((name) => name === '' || name.trim() !== name)) return "has an empty name or a space at a name's edge";
  return null;
}

/** Each row whose publisher the falls tables would not split into one or two whole names. */
export function publisherProblems(path: string, rows: readonly Pick<ContentDrawdown, 'publisher'>[]): Problem[] {
  return rows.flatMap(({ publisher }, index): Problem[] => {
    const fault = joinFault(publisher);
    if (fault === null) return [];
    return [
      { path, code: 'drawdown-publisher-joined', detail: `drawdowns.${index} publisher "${publisher}": ${fault}` },
    ];
  });
}
