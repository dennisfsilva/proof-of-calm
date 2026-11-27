// A drawdown row's publisher as the falls tables and source lines split it: packages/app's falls-basis.ts splits a
// value on " and " into the names of the two series a row's high and low come from, "Bitcoinity (Mt. Gox) and
// CoinMarketCap", and keeps its own pattern, since the app's lazy chunk takes no value from content. This check holds
// each value to a closed grammar, so the split always gives one or two whole names (docs/CONTENT-STYLE.md §3, the
// falls tables), and refuses everything outside it:
//   value = name, or name " and " name (one join; the split is case-sensitive, and so are the "and" rules)
//   name  = word (" " word)* (" (" word (" " word)* ")")?, at most one parenthesised note, at the name's end
//   word  = one or more letters of any script, decimal digits, . & - ' or ’
// A name's first word and a note's first word start with a letter or a digit. No name is the word "and", starts with
// "and " or ends with " and". The grammar refuses some values the app would show whole, a comma or a slash, which the
// content review backs; the comma also separates the names in the falls' source sentence.
import type { Problem } from './problem.ts';
import type { ContentDrawdown } from './schema/drawdown.ts';

const JOIN = ' and ';
const WORD_SIGN = /^[\p{L}\p{Nd}.&\-'’]$/u;
const FIRST_SIGN = /^[\p{L}\p{Nd}]/u;

const count = (text: string, sign: string) => text.split(sign).length - 1;

/** Why `name`'s parentheses are not one note at its end, or null when they are or it has none. */
function noteFault(name: string): string | null {
  const opens = count(name, '(');
  const closes = count(name, ')');
  if (opens > 1) return 'has more than one note';
  if (opens === 0) return closes === 0 ? null : 'closes a note it does not open';
  if (closes === 0) return 'has a note it does not close';
  const open = name.indexOf('(');
  const close = name.indexOf(')');
  if (closes > 1 || close < open) return 'closes a note it does not open';
  if (close !== name.length - 1) return 'has a note before its end';
  if (name[open - 1] !== ' ') return 'has no space before its note';
  const note = name.slice(open + 1, close);
  if (note === '') return 'has an empty note';
  if (note.trim() !== note) return "has a space at its note's edge";
  if (!FIRST_SIGN.test(note)) return 'has a note that starts with neither a letter nor a digit';
  return null;
}

/** Why `name` falls outside the grammar, or null when it is one. */
function nameFault(name: string): string | null {
  if (name === '') return 'is empty';
  if (name.trim() !== name) return 'has a space at its edge';
  if (name.includes('  ')) return 'has two spaces in a row';
  const sign = [...name].find((s) => s !== ' ' && s !== '(' && s !== ')' && !WORD_SIGN.test(s));
  if (sign !== undefined) return `has a sign no name takes: "${sign}"`;
  if (!FIRST_SIGN.test(name)) return 'starts with neither a letter nor a digit';
  const note = noteFault(name);
  if (note !== null) return note;
  if (name === 'and') return 'is the word "and"';
  if (name.startsWith('and ')) return 'starts with the word "and"';
  if (name.endsWith(' and')) return 'ends with the word "and"';
  return null;
}

/** Why `publisher` is not one name or two joined by " and ", or null when it is; a fault of two names names its name. */
function joinFault(publisher: string): string | null {
  const names = publisher.split(JOIN);
  if (names.length > 2) return `joins more than two names with "${JOIN}"`;
  for (const name of names) {
    const fault = nameFault(name);
    if (fault !== null) return names.length === 1 ? fault : `name "${name}" ${fault}`;
  }
  return null;
}

/** Each row whose publisher is not one name or two joined by " and " in the grammar above. */
export function publisherProblems(path: string, rows: readonly Pick<ContentDrawdown, 'publisher'>[]): Problem[] {
  return rows.flatMap(({ publisher }, index): Problem[] => {
    const fault = joinFault(publisher);
    if (fault === null) return [];
    return [
      { path, code: 'drawdown-publisher-joined', detail: `drawdowns.${index} publisher "${publisher}": ${fault}` },
    ];
  });
}
