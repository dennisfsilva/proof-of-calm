// The sentences of a Learn module's chart section, read against the chart's rows (docs/CONTENT-STYLE.md §4, R5 and
// R6; docs/research/review-safe-figures.md, amendment 8). The section is read on the page the build's compiler gives
// (`pageOf`). A sentence there that holds a figure, a percentage, a number word, a month, a currency sign or a chart
// coin passes only when it matches one of two closed shapes as a whole, so a wording one step past them fails.
import type { PageBlock } from '@proofofcalm/config/vite';
import type { LearnModule } from './loaders/modules.ts';
import { MODULE_PERCENT_JOINERS } from './percent-token.ts';
import type { Problem } from './problem.ts';
import type { ContentCoin } from './schema/coin.ts';
import type { CycleDrawdown } from './schema/cycles.ts';
import { PERCENTS, sentencesOf } from './template-figures.ts';

type Coin = Readonly<Pick<ContentCoin, 'id' | 'name'>>;
type Row = Readonly<Pick<CycleDrawdown, 'coin' | 'high' | 'low' | 'fall'>>;
/** The chart's rows and the coin catalogue; null when a file did not load. */
export type FigureContext = { readonly rows: readonly Row[] | null; readonly coins: readonly Coin[] | null };
/** What one module's chart section is read against. */
export type ModuleFigures = FigureContext & { readonly chart: LearnModule['chart']; readonly language: string };

export const moduleContext = (
  module: Pick<LearnModule, 'chart'>,
  language: string,
  all: FigureContext,
): ModuleFigures => ({
  chart: module.chart,
  language,
  ...all,
});

const RULE = '(docs/CONTENT-STYLE.md §4)';
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const alt = (names: readonly string[]) =>
  [...new Set(names)]
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join('|');
const word = (body: string, flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${body})(?![\\p{L}\\p{M}\\p{N}])`, flags);
const NEVER = /(?!)/u;

// The closed trigger: the first kind that occurs names the detail, a numeral before a word.
const CARDINALS = 'zero two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen \
seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion \
trillion dozen'.split(' ');
const ORDINALS = 'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth \
fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth \
seventieth eightieth ninetieth hundredth thousandth millionth billionth'.split(' ');
const OTHERS = 'once twice thrice half halves halved double doubled doubles triple tripled triples quadruple \
quadrupled quarter quarters twenties thirties forties fifties sixties seventies eighties nineties couple couples pair \
pairs'.split(' ');
const SIGNS = '[%٪﹪％‰‱]';
const NUMERAL = '\\p{N}+(?:[.,]\\p{N}+)*';
const KINDS: readonly (readonly [string, RegExp])[] = [
  ['a figure', new RegExp(`${NUMERAL}(?:\\s?${SIGNS})?`, 'u')],
  ['a percentage sign or word', new RegExp(`${PERCENTS.source}|[‰‱]`, 'iu')],
  [
    'a number word',
    word([...CARDINALS.map((w) => `${w}(?:s|fold)?`), ...ORDINALS.map((w) => `${w}s?`), ...OTHERS].join('|'), 'iu'),
  ],
  [
    'a month',
    word(
      'january|february|april|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sept?|oct|nov|dec',
      'iu',
    ),
  ],
  ['a month', word('May|March|Mar', 'u')],
  ['a currency sign', /\p{Sc}/u],
];
const MARKS: Readonly<Record<string, string>> = {
  emphasis: 'emphasis',
  strong: 'strong',
  inlineCode: 'a code span',
  break: 'a hard break',
  mdxJsxTextElement: 'a text element',
  ignorable: 'a hidden character',
};

// The shapes, as docs/CONTENT-STYLE.md §4 writes them. Only English has them; a translation's section fails closed.
const N = '(?:100|[1-9][0-9]?)';
const J = `(?:${MODULE_PERCENT_JOINERS.map(esc).join('|')})`;
const P = `${N}${J}%`;
const L = `${P}(?: and ${P}|(?:, ${P})+, and ${P})?`;
const Y = '[12][0-9]{3}';
const SHAPES: Readonly<Record<string, (c: string) => { readonly b: RegExp; readonly e: RegExp }>> = {
  en: (C) => ({
    b: new RegExp(
      `^In the chart, (?<c>${C}) had (?<k>[1-9][0-9]?) (?<falls>falls?) of more than (?<n>${N})${J}% between (?<y1>${Y}) and (?<y2>${Y})\\.$`,
      'u',
    ),
    e: new RegExp(`^(?:${C}) fell ${L}(?:(?:, (?:${C}) ${L})*, and (?:${C}) ${L})?\\.$`, 'u'),
  }),
};

/** Each catalogue coin by the names a shape reads: as written, with a lower-case first letter, and Ether for ETH. */
function spellings(coins: readonly Coin[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const { id, name } of coins) {
    for (const spelling of [name, name.charAt(0).toLowerCase() + name.slice(1)]) names.set(spelling, id);
    if (id === 'ETH') for (const spelling of ['Ether', 'ether']) names.set(spelling, id);
  }
  return names;
}

const year = (date: string) => Number(date.slice(0, 4));
const quote = (text: string) => JSON.stringify(text).slice(1, -1);
type Bound = { sentence: string; id: string; name: string; k: number; n: string; y1: number; y2: number };
type Clause = { name: string; id: string; figures: string[] };

export function moduleFigureProblems(path: string, page: readonly PageBlock[], context: ModuleFigures): Problem[] {
  const problems: Problem[] = [];
  const report = (code: string, what: string, rule: string) =>
    problems.push({ path, code, detail: `body: ${what}; ${rule} ${RULE}` });
  const at = page.findIndex((block) => block.kind === 'element' && block.name === 'Chart');
  // No chart, or no element (module-chart-element reports that one).
  if (context.chart === 'none' || at === -1) return problems;
  const { rows, coins, language } = context;
  if (rows === null || coins === null) {
    report(
      'figure-chart',
      "the chart's rows or the coin catalogue did not load, so the chart's section cannot be read",
      'R5',
    );
    return problems;
  }
  const headings = page.flatMap((block, index) => (block.kind === 'heading' ? [index] : []));
  const start = headings.filter((index) => index < at).at(-1) ?? 0;
  const end = headings.find((index) => index > at) ?? page.length;
  // Only the drawdowns chart has rows, so any figure in another chart's section fails.
  const own = context.chart === 'drawdowns-bar' ? rows : [];
  const chartIds = [...new Set(own.map((row) => row.coin))];
  const names = spellings(coins);
  const C = alt([...names.keys()]);
  const shapes = SHAPES[language]?.(C);
  const mine = coins.filter(({ id }) => chartIds.includes(id));
  const coinNames = [...mine.map(({ name }) => name), ...(chartIds.includes('ETH') ? ['ether'] : [])];
  const kinds: readonly (readonly [string, RegExp])[] = [
    ...KINDS,
    ['a coin', coinNames.length > 0 ? word(`(?:${alt(coinNames)})s?`, 'iu') : NEVER],
    ['a coin', mine.length > 0 ? word(alt(mine.map(({ id }) => id)), 'u') : NEVER],
  ];
  const triggerIn = (text: string) => {
    for (const [kind, pattern] of kinds) {
      const found = pattern.exec(text);
      if (found !== null) return { kind, token: found[0] };
    }
    return null;
  };
  const bounds: Bound[] = [];
  const exacts: { sentence: string; clauses: Clause[] }[] = [];
  for (const block of page.slice(start, end)) {
    if (block.kind === 'element') continue;
    const shown = block.text.replace(/\s+/gu, ' ').trim();
    if (block.kind === 'code') {
      report('figure-chart', `the code block "${shown}" sits in the chart's section, which holds no code block`, 'R5');
      continue;
    }
    const hit = triggerIn(block.text);
    if (block.kind === 'heading') {
      if (hit !== null)
        report('figure-chart', `the heading "${shown}" holds ${hit.kind} "${hit.token}" in the chart's section`, 'R5');
      continue;
    }
    if (hit === null) continue;
    if (block.marks !== undefined) {
      const marks = block.marks.map((mark) => MARKS[mark] ?? mark).join(', ');
      report(
        'figure-chart',
        `the paragraph "${shown}" holds ${marks} beside ${hit.kind} "${hit.token}" in the chart's section, which reads plain text only`,
        'R5',
      );
      continue;
    }
    // The app formats N % only with one joiner it knows, in one string (withJoiner); sentencesOf collapses white space.
    for (const [written, joiner = '', sign] of block.text.matchAll(new RegExp(`${NUMERAL}(\\s*)(${SIGNS})`, 'gu'))) {
      if (MODULE_PERCENT_JOINERS.includes(joiner) && sign === '%') continue;
      report('figure-chart', `"${quote(written)}" joins a figure to a sign other than as N %`, 'R5');
    }
    for (const sentence of sentencesOf(block.text)) {
      const found = triggerIn(sentence);
      if (found === null) continue;
      const b = shapes?.b.exec(sentence)?.groups;
      if (b !== undefined && (b.k === '1') === (b.falls === 'fall')) {
        const [name, k, n, y1, y2] = [b.c ?? '', b.k ?? '', b.n ?? '', b.y1 ?? '', b.y2 ?? ''];
        bounds.push({ sentence, id: names.get(name) ?? '', name, k: Number(k), n, y1: Number(y1), y2: Number(y2) });
        continue;
      }
      if (shapes?.e.test(sentence) === true) {
        const clauses: Clause[] = [];
        for (const { groups } of sentence.matchAll(new RegExp(`(?<c>${C})(?= )|(?<f>${N})(?=${J}%)`, 'gu'))) {
          if (groups?.c !== undefined) clauses.push({ name: groups.c, id: names.get(groups.c) ?? '', figures: [] });
          else if (groups?.f !== undefined) clauses.at(-1)?.figures.push(groups.f);
        }
        exacts.push({ sentence, clauses });
        continue;
      }
      const where = shapes === undefined ? `, and ${language} has no shapes for a chart's section yet` : '';
      report(
        'figure-chart',
        `"${sentence}" holds ${found.kind} "${quote(found.token)}" and matches neither shape of a chart's section${where}`,
        'R5',
      );
    }
  }
  // The rows are whole percents (drawdown-fall-not-whole), so a number compares them.
  const rowsOf = (id: string) => own.filter((row) => row.coin === id);
  const counted = new Set<Row>();
  for (const b of bounds) {
    const theirs = rowsOf(b.id);
    if (theirs.length === 0) {
      report('figure-chart', `"${b.name}" in "${b.sentence}" names a coin the chart draws no fall of`, 'R6');
      continue;
    }
    const hits = theirs.filter(
      (row) => Number(row.fall) > Number(b.n) && year(row.high) >= b.y1 && year(row.low) <= b.y2,
    );
    for (const row of hits) counted.add(row);
    const between = `between ${b.y1} and ${b.y2}`;
    if (hits.length === 0) {
      report(
        'figure-chart',
        `"more than ${b.n} %" in "${b.sentence}" holds for none of ${b.name}'s falls in the chart ${between}`,
        'R6',
      );
      continue;
    }
    const falls = `${b.k} fall${b.k === 1 ? '' : 's'}`;
    if (hits.length !== b.k)
      report(
        'figure-chart',
        `"${falls}" in "${b.sentence}" is not how many of ${b.name}'s falls in the chart are more than ${b.n} % ${between}`,
        'R6',
      );
    const first = Math.min(...hits.map((row) => year(row.high)));
    const last = Math.max(...hits.map((row) => year(row.low)));
    if (first !== b.y1 || last !== b.y2)
      report(
        'figure-chart',
        `"${between}" in "${b.sentence}" is not the year of the first high and the year of the last low of the falls it counts`,
        'R6',
      );
  }
  // E states each coin's falls in the chart's order; a wrong figure still uses its place, so one fault is one problem.
  const used = new Map<string, number>();
  for (const { sentence, clauses } of exacts) {
    for (const clause of clauses) {
      const theirs = rowsOf(clause.id);
      if (theirs.length === 0) {
        report('figure-chart', `"${clause.name}" in "${sentence}" names a coin the chart draws no fall of`, 'R5');
        continue;
      }
      const free = theirs.filter((row) => !counted.has(row));
      let place = used.get(clause.id) ?? 0;
      for (const figure of clause.figures) {
        const row = free[place];
        if (row === undefined)
          report(
            'figure-chart',
            `"${figure} %" in "${sentence}" names a fall of ${clause.name} that the chart does not draw or a bound already counts`,
            'R5',
          );
        else if (Number(row.fall) !== Number(figure))
          report(
            'figure-chart',
            `"${figure} %" in "${sentence}" is not ${clause.name}'s fall at that place in the chart's order`,
            'R5',
          );
        place += 1;
      }
      used.set(clause.id, place);
    }
  }
  for (const id of chartIds) {
    if ((used.get(id) ?? 0) < rowsOf(id).filter((row) => !counted.has(row)).length) {
      const name = coins.find((coin) => coin.id === id)?.name ?? id;
      report('figure-unstated', `the chart draws a fall of ${name} that no sentence of its section states`, 'R5');
    }
  }
  return problems;
}
