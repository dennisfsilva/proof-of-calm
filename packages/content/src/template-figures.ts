// A template's figures against its rows and split (docs/CONTENT-STYLE.md §4, R1 to R4). A sentence that holds a
// percentage or a drawdown date passes only when it matches one of the closed shapes below. A shape matches
// the whole sentence, so a wording one step past the shapes fails, and a new wording needs a new reviewed shape
// (docs/research/review-safe-figures.md, amendment 7). English only: overlay-number-mismatch ties a translation's
// figures to these.
import { paragraphsOf } from './paragraphs.ts';
import { printedText } from './percent-gap.ts';
import { PERCENT_JOINER } from './percent-token.ts';
import type { Problem } from './problem.ts';

type Figures = {
  readonly coins: readonly { readonly id: string; readonly name: string }[];
  readonly split: Readonly<Record<string, string>>;
  readonly drawdowns: readonly { readonly coin: string; readonly fall: string }[];
  readonly explanation: string;
};
type Shape = 'F1' | 'F2' | 'S1' | 'S2' | 'S3' | 'S4';

const DATED = /\{date:drawdowns\./;
// The trigger is a closed set: the four signs, or "per" and "cent" at the start of a word or right after a digit,
// joined by nothing, any space, or a hyphen, in any case, with nothing required after "cent": percent, per cent,
// percentage, percentile, and the like all count.
const JOIN = '(?:\\s+|[\\u002D\\u2010\\u2011])?';
const SIGN_OR_WORD = `[%٪﹪％]|(?<![\\p{L}\\p{M}])per${JOIN}cent(?:ages?)?`;
const PERCENT = new RegExp(SIGN_OR_WORD, 'iu');
/** Each percentage sign or word, as the templates' trigger reads it; the module figures check reads its source. */
export const PERCENTS = new RegExp(SIGN_OR_WORD, 'giu');
const WRITTEN = new RegExp(`\\d+(?:[.,]\\d+)?${JOIN}(?:${SIGN_OR_WORD})`, 'giu');
const PLACEHOLDER = /\{date:drawdowns\.([^.{}]+)\.(?:high|low)\}/gu;
const LEAD = '(?:What can go wrong: )?';
const N = `\\d{1,3}${PERCENT_JOINER}%`;
const FALL = `(?<fig>(?<more>more than )?−?(?<n>\\d{1,3})${PERCENT_JOINER}%)`;
const A = '(?:each|every)(?: monthly)? amount';
const dates = (from: string) =>
  `${from} its high on \\{date:drawdowns\\.(?<x>[^.{}]+)\\.high\\} to its low on \\{date:drawdowns\\.\\k<x>\\.low\\}`;
/** The coin names, the longest first, so that a name holding another one reads as itself. */
const alternation = (names: readonly string[]) =>
  `(?:${[...names]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})`;

/** The six shapes of CONTENT-STYLE §4 for these coin names, each anchored to a whole sentence. */
const shapes = (names: readonly string[]): Record<Shape, RegExp> => {
  const C = alternation(names);
  const shape = (body: string) => new RegExp(`^${LEAD}${body}\\.$`, 'u');
  return {
    // A fall names its coin: no `It`, so no coin crosses a sentence (amendment 2).
    F1: shape(`(?<coin>${C}) fell ${FALL} ${dates('from')}`),
    F2: shape(`${dates('From')}, (?<coin>${C}) fell ${FALL}`),
    S1: shape(`${N} of ${A} goes into ${C}`),
    S2: shape(`${C}: ${N} of ${A}`),
    S3: shape(`${C} takes ${N} of ${A}(?:; ${N} goes into ${C})*`),
    // Two coins take no comma; three or more take the serial comma (CONTENT-STYLE §1 rule 9).
    S4: shape(`It splits ${A} ${N} ${C}(?:(?:, ${N} ${C})+,)? and ${N} ${C}`),
  };
};

/** The paragraphs the app renders (`paragraphsOf`), each split after `.`, `!` or `?` followed by whitespace. */
export const sentencesOf = (text: string): string[] =>
  paragraphsOf(text)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/u))
    .filter((sentence) => sentence !== '');

/** The shape a whole sentence matches, or null. */
export const shapeOf = (t: Pick<Figures, 'coins'>, sentence: string): Shape | null => {
  const all = shapes(t.coins.map((coin) => coin.name));
  return (Object.keys(all) as Shape[]).find((name) => all[name].test(sentence)) ?? null;
};

/** -1, 0 or 1 as a written whole percent is below, at or above a plain decimal (schema/common.ts). */
const compare = (whole: string, decimal: string) => {
  const [int = '', frac = ''] = decimal.split('.');
  const scale = (i: string, f: string) => BigInt(i + f.padEnd(6, '0').slice(0, 6));
  const [a, b] = [scale(whole, ''), scale(int, frac)];
  return a < b ? -1 : a > b ? 1 : 0;
};

/** A quoted text as every detail prints it (ADR-0057's Corrections): each hidden character by its code point. */
const quote = (text: string) => `"${printedText(text, [])}"`;

/** A list with the serial comma; an item that closes on its own comma (fallOf's no-row arm) takes no second one. */
const serial = (items: readonly string[]) => {
  if (items.length < 3) return items.join(' and ');
  const head = items.slice(0, -1).map((item) => (item.endsWith(',') ? `${item} ` : `${item}, `));
  return `${head.join('')}and ${items.at(-1)}`;
};

export function templateFigureProblems(path: string, t: Figures): Problem[] {
  const all = shapes(t.coins.map((coin) => coin.name));
  const idOf = new Map(t.coins.map((coin) => [coin.name, coin.id]));
  const falls = new Map(t.drawdowns.map((row) => [row.coin, row.fall] as const));
  const named = new RegExp(alternation(t.coins.map((coin) => coin.name)), 'gu');
  // Both arms print the id by code point: a row's coin is any non-empty text (schema/drawdown.ts). The no-row arm
  // closes its clause with a comma, since a word always follows it in a detail.
  const fallOf = (id: string) => {
    const fall = falls.get(id);
    const coin = printedText(id, []);
    return fall === undefined ? `${coin}, which has no drawdown row,` : `${coin}'s fall of ${fall} %`;
  };
  const problems: Problem[] = [];
  for (const sentence of sentencesOf(t.explanation)) {
    const report = (code: string, what: string, rule: number, data = '') => {
      const after = data === '' ? '' : ` (${data})`;
      const detail = `explanation: ${what} in ${quote(sentence)}${after}; R${rule} (docs/CONTENT-STYLE.md §4)`;
      problems.push({ path, code, detail });
    };
    const written = [...sentence.matchAll(WRITTEN)].map(([figure]) => quote(figure));
    const figures = serial(written);
    const dated = DATED.test(sentence);
    const fall = all.F1.exec(sentence) ?? all.F2.exec(sentence);
    if (dated && fall?.groups === undefined) {
      const rows = serial([...new Set([...sentence.matchAll(PLACEHOLDER)].map(([, id = '']) => id))].map(fallOf));
      const what =
        written.length === 0
          ? `the dates of ${rows} sit in no F1 or F2 sentence`
          : `${figures} beside the dates of ${rows} ${written.length === 1 ? 'matches' : 'match'} neither F1 nor F2`;
      report('figure-form', what, 1);
    } else if (fall?.groups !== undefined) {
      const { coin = '', more, fig = '', n = '', x = '' } = fall.groups;
      const row = falls.get(x);
      if (row === undefined) report('figure-form', `${quote(fig)} carries the dates of ${fallOf(x)}`, 1);
      else if (idOf.get(coin) !== x) {
        report('figure-form', `${quote(coin)} is named in the sentence that dates ${fallOf(x)}`, 2);
      } else if (more !== undefined && compare(n, row) >= 0) {
        report('figure-mismatch', `${quote(fig)} is not below ${fallOf(x)}`, 2);
      } else if (more === undefined && compare(n, row) !== 0) {
        report(
          'figure-mismatch',
          `${quote(fig)} is neither ${fallOf(x)} nor a bound below it written "more than N %"`,
          2,
        );
      }
    } else if (PERCENT.test(sentence)) {
      const share = (['S1', 'S2', 'S3', 'S4'] as const).find((name) => all[name].test(sentence));
      if (share === undefined) {
        const ids = [...new Set([...sentence.matchAll(named)].map(([name]) => idOf.get(name) ?? ''))];
        const data = ids.map((id) => {
          const parts = [falls.has(id) ? `fall ${falls.get(id)} %` : '', id in t.split ? `share ${t.split[id]} %` : ''];
          return `${printedText(id, [])}: ${parts.filter(Boolean).join(', ')}`;
        });
        const quoted = figures || quote(PERCENT.exec(sentence)?.[0] ?? '');
        report('figure-unclassed', `${quoted} matches no shape of a fall or a share`, 4, data.join('; '));
        continue;
      }
      // S2 and S3 name a coin before its figure; the pairs after it, and S1's and S4's, write the figure first.
      const tokens = [...sentence.matchAll(new RegExp(`${N}|${named.source}`, 'gu'))].map(([token]) => token);
      // A coin's name in the fixed words would shift the pairs; the shapes hold none, so the tokens alternate.
      const pairs: [string, string][] = [];
      if (share === 'S2' || share === 'S3') pairs.push([tokens.shift() ?? '', tokens.shift() ?? '']);
      for (let i = 0; i + 1 < tokens.length; i += 2) pairs.push([tokens[i + 1] ?? '', tokens[i] ?? '']);
      const seen = new Set<string>();
      for (const [name, figure] of pairs) {
        const id = idOf.get(name) ?? '';
        const split = t.split[id];
        const coin = printedText(id, []);
        const share = split === undefined ? `${coin}, which has no share` : `${coin}'s share of ${split} %`;
        if (seen.has(id))
          report('figure-form', `${quote(figure)} gives ${quote(name)} a second share beside ${share}`, 3);
        else if (split === undefined || compare(figure.replace(/\D/g, ''), split) !== 0) {
          report('figure-mismatch', `${quote(figure)} is not ${share}`, 3);
        }
        seen.add(id);
      }
    }
  }
  // Each paragraph is read alone, so a trigger split across two sits in neither: it is read on the whole text too.
  // A match never holds `.`, `!` or `?`, so the only break it can span is a paragraph break.
  for (const [match] of t.explanation.matchAll(PERCENTS)) {
    if (paragraphsOf(match).length < 2) continue;
    const what = `${quote(match)} spans a paragraph break and matches no shape`;
    const detail = `explanation: ${what} of a fall or a share; R4 (docs/CONTENT-STYLE.md §4)`;
    problems.push({ path, code: 'figure-unclassed', detail });
  }
  return problems;
}
