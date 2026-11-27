// A drawdown row's publisher as the falls tables and source lines split it: packages/app's falls-basis.ts splits a
// value on " and " into the names of the two series a row's high and low come from, "Bitcoinity (Mt. Gox) and
// CoinMarketCap", and keeps its own pattern, since the app's lazy chunk takes no value from content. This check
// refuses each value whose split would not give one or two whole names (docs/CONTENT-STYLE.md §3, the falls tables).
// In a two-name value each name closes every bracket and quote it opens: (), [], {}, “” and ‘’, and an even count of
// ASCII ". The ASCII ' is an apostrophe and is not counted, and a ’ that closes no ‘ is a typographic apostrophe. The
// split is case-sensitive, and so is the second-"and" rule.
import type { Problem } from './problem.ts';
import type { ContentDrawdown } from './schema/drawdown.ts';

const JOIN = ' and ';
const PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['“', '”'],
  ['‘', '’'],
] as const;
const APOSTROPHE = '’';

const count = (text: string, sign: string) => text.split(sign).length - 1;

/** Whether `name` closes each bracket and quote it opens, and opens each it closes. */
function closes(name: string): boolean {
  const balanced = PAIRS.every(([open, close]) => {
    let depth = 0;
    for (const sign of name) {
      if (sign === open) depth += 1;
      else if (sign === close && depth > 0) depth -= 1;
      else if (sign === close && close !== APOSTROPHE) return false;
    }
    return depth === 0;
  });
  return balanced && count(name, '"') % 2 === 0;
}

/** Why the split of `publisher` gives no one or two whole names, or null when it does. */
function joinFault(publisher: string): string | null {
  const names = publisher.split(JOIN);
  if (names.length > 2) return `joins more than two names with "${JOIN}"`;
  if (names.length === 2 && !names.every(closes)) return `has "${JOIN}" inside brackets or quotes`;
  if (names.some((name) => name === '' || name.trim() !== name)) return "has an empty name or a space at a name's edge";
  if (names.length === 2 && names.some((name) => name.startsWith('and ') || name.endsWith(' and'))) {
    return 'has a second "and" beside the join';
  }
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
