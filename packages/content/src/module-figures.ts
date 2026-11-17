// The sentences of a Learn module's chart section, on the page the build's compiler gives (`pageOf`), read against the
// chart's rows (docs/CONTENT-STYLE.md §4, R5 and R6; docs/research/review-safe-figures.md, amendment 8).
import type { LearnModule } from './loaders/modules.ts';
import { MODULE_PERCENT_JOINERS } from './percent-token.ts';
import type { Problem } from './problem.ts';
import type { ContentCoin } from './schema/coin.ts';
import type { CycleDrawdown } from './schema/cycles.ts';
import { PERCENTS, sentencesOf } from './template-figures.ts';

/** A block of the page `pageOf` gives (packages/config/vite/page-blocks.ts), which the product may not import. */
type PageBlock =
  | { readonly kind: 'heading' | 'code'; readonly text: string; readonly marks?: undefined }
  | { readonly kind: 'paragraph'; readonly text: string; readonly marks?: readonly string[] }
  | { readonly kind: 'element'; readonly name: string };
type Coin = Readonly<Pick<ContentCoin, 'id' | 'name'>>;
type Row = Readonly<Pick<CycleDrawdown, 'coin' | 'high' | 'low' | 'fall'>>;
/** The chart's rows and the coin catalogue; null when a file did not load. */
export type FigureContext = { readonly rows: readonly Row[] | null; readonly coins: readonly Coin[] | null };
/** What one module's chart section is read against. */
export type ModuleFigures = FigureContext & { readonly chart: LearnModule['chart']; readonly language: string };

export const moduleContext = ({ chart }: Pick<LearnModule, 'chart'>, language: string, all: FigureContext) =>
  ({ chart, language, ...all }) satisfies ModuleFigures;

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
const MONTHS =
  'january|february|april|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sept?|oct|nov|dec';
const SIGNS = '[%٪﹪％‰‱]';
const NUMERAL = '\\p{N}+(?:[.,]\\p{N}+)*';
const KINDS: readonly (readonly [string, RegExp])[] = [
  ['a figure', new RegExp(`${NUMERAL}(?:\\s?${SIGNS})?`, 'u')],
  ['a percentage sign or word', new RegExp(`${PERCENTS.source}|[‰‱]`, 'iu')],
  [
    'a number word',
    word([...CARDINALS.map((w) => `${w}(?:s|fold)?`), ...ORDINALS.map((w) => `${w}s?`), ...OTHERS].join('|'), 'iu'),
  ],
  ['a month', word(MONTHS, 'iu')],
  ['a month', word('May|March|Mar', 'u')],
  ['a currency sign', /\p{Sc}/u],
];
// Each mark a paragraph's `marks` names, in §4's words; no detail prints a parser name.
const MARKS: Readonly<Record<string, string>> = {
  emphasis: 'emphasis',
  strong: 'strong text',
  inlineCode: 'a code span',
  break: 'a hard break',
  mdxJsxTextElement: 'a text element',
  ignorable: 'a hidden character',
};

// The shapes, as docs/CONTENT-STYLE.md §4 writes them. Only English has them; a translation's section fails closed.
const N = '(?:100|[1-9][0-9]?)';
const J = `(?:${MODULE_PERCENT_JOINERS.map(esc).join('|')})`;
const L = `${N}${J}%(?: and ${N}${J}%|(?:, ${N}${J}%)+, and ${N}${J}%)?`;
const Y = '[12][0-9]{3}';
const shapesOf = (language: string, C: string) =>
  language === 'en'
    ? {
        b: new RegExp(
          `^In the chart, (?<c>${C}) had (?<k>[1-9][0-9]?) (?<falls>falls?) of more than (?<n>${N})${J}% between (?<y1>${Y}) and (?<y2>${Y})\\.$`,
          'u',
        ),
        e: new RegExp(`^(?:${C}) fell ${L}(?:(?:, (?:${C}) ${L})*, and (?:${C}) ${L})?\\.$`, 'u'),
      }
    : undefined;

/** Each catalogue coin by the names a shape reads: as written, with a lower-case first letter, and Ether for ETH. */
const spellings = (coins: readonly Coin[]) =>
  new Map(
    coins.flatMap(({ id, name }) =>
      [name, name.charAt(0).toLowerCase() + name.slice(1), ...(id === 'ETH' ? ['Ether', 'ether'] : [])].map(
        (spelling) => [spelling, id] as const,
      ),
    ),
  );

const year = (date: string) => Number(date.slice(0, 4));
const quote = (text: string) => JSON.stringify(text).slice(1, -1);
/** Items as an English list: `a and b`, or `a, b, and c` with the serial comma. */
const list = (items: readonly string[]) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

export function moduleFigureProblems(path: string, page: readonly PageBlock[], context: ModuleFigures): Problem[] {
  const problems: Problem[] = [];
  const report = (what: string, rule = 'R5', code = 'figure-chart') =>
    problems.push({ path, code, detail: `body: ${what}; ${rule} ${RULE}` });
  const at = page.findIndex((block) => block.kind === 'element' && block.name === 'Chart');
  // No chart, or no element (module-chart-element reports that one).
  if (context.chart === 'none' || at === -1) return problems;
  const { rows, coins, language } = context;
  if (rows === null || coins === null) {
    report("the chart's rows or the coin catalogue did not load, so the chart's section cannot be read");
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
  const shapes = shapesOf(language, C);
  const mine = coins.filter(({ id }) => chartIds.includes(id));
  const coinNames = [...mine.map(({ name }) => name), ...(chartIds.includes('ETH') ? ['ether'] : [])];
  const kinds: readonly (readonly [string, RegExp])[] = [
    ...KINDS,
    ['a coin', coinNames.length > 0 ? word(`(?:${alt(coinNames)})s?`, 'iu') : NEVER],
    ['a coin', mine.length > 0 ? word(alt(mine.map(({ id }) => id)), 'u') : NEVER],
  ];
  const triggerIn = (text: string) => {
    for (const [kind, pattern] of kinds) {
      const token = pattern.exec(text)?.[0];
      if (token !== undefined) return { kind, token };
    }
    return null;
  };
  const bounds: { sentence: string; id: string; name: string; k: number; n: string; y1: number; y2: number }[] = [];
  const exacts: { sentence: string; clauses: { name: string; id: string; figures: string[] }[] }[] = [];
  for (const block of page.slice(start, end)) {
    if (block.kind === 'element') continue;
    const shown = block.text.replace(/\s+/gu, ' ').trim();
    if (block.kind === 'code') {
      report(`the code block "${shown}" sits in the chart's section, which holds no code block`);
      continue;
    }
    const hit = triggerIn(block.text);
    if (hit === null) continue;
    if (block.kind === 'heading') {
      report(`the heading "${shown}" holds ${hit.kind} "${hit.token}" in the chart's section`);
      continue;
    }
    if (block.marks !== undefined) {
      const marks = list(block.marks.map((mark) => MARKS[mark] ?? mark));
      report(`the paragraph "${shown}" holds ${marks} beside ${hit.kind} "${hit.token}" in the chart's section, which \
reads plain text only`);
      continue;
    }
    // The app formats N % only with one joiner it knows, in one string (withJoiner); sentencesOf collapses white space.
    for (const [written, joiner = '', sign] of block.text.matchAll(new RegExp(`${NUMERAL}(\\s*)(${SIGNS})`, 'gu'))) {
      if (!MODULE_PERCENT_JOINERS.includes(joiner) || sign !== '%')
        report(`"${quote(written)}" in "${shown}" joins a figure to a sign other than by one space and %`);
    }
    for (const sentence of sentencesOf(block.text)) {
      const found = triggerIn(sentence);
      if (found === null) continue;
      const b = shapes?.b.exec(sentence)?.groups;
      if (b?.c !== undefined && (b.k === '1') === (b.falls === 'fall')) {
        const [k, n, y1, y2] = [Number(b.k), b.n ?? '', Number(b.y1), Number(b.y2)];
        bounds.push({ sentence, id: names.get(b.c) ?? '', name: b.c, k, n, y1, y2 });
      } else if (shapes?.e.test(sentence) === true) {
        const clauses: (typeof exacts)[number]['clauses'] = [];
        for (const { groups } of sentence.matchAll(new RegExp(`(?<c>${C})(?= )|(?<f>${N})(?=${J}%)`, 'gu'))) {
          if (groups?.c !== undefined) clauses.push({ name: groups.c, id: names.get(groups.c) ?? '', figures: [] });
          else if (groups?.f !== undefined) clauses.at(-1)?.figures.push(groups.f);
        }
        exacts.push({ sentence, clauses });
      } else {
        const where = shapes === undefined ? `, and ${language} has no shapes for a chart's section yet` : '';
        report(`"${sentence}" holds ${found.kind} "${quote(found.token)}" and matches neither shape of a chart's \
section${where}`);
      }
    }
  }
  // The rows are whole percents (drawdown-fall-not-whole), so a number compares them.
  const rowsOf = (id: string) => own.filter((row) => row.coin === id);
  const noFall = (name: string, sentence: string, rule: string) =>
    report(`"${name}" in "${sentence}" names a coin the chart draws no fall of`, rule);
  const counted = new Set<Row>();
  for (const b of bounds) {
    const between = `between ${b.y1} and ${b.y2}`;
    const hits = rowsOf(b.id).filter(
      (r) => Number(r.fall) > Number(b.n) && year(r.high) >= b.y1 && year(r.low) <= b.y2,
    );
    for (const row of hits) counted.add(row);
    if (rowsOf(b.id).length === 0) noFall(b.name, b.sentence, 'R6');
    else if (hits.length === 0)
      report(
        `"more than ${b.n} %" in "${b.sentence}" holds for none of ${b.name}'s falls in the chart ${between}`,
        'R6',
      );
    else {
      if (hits.length !== b.k)
        report(
          `"${b.k} fall${b.k === 1 ? '' : 's'}" in "${b.sentence}" is not how many of ${b.name}'s falls in the \
chart are more than ${b.n} % ${between}`,
          'R6',
        );
      if (Math.min(...hits.map((r) => year(r.high))) !== b.y1 || Math.max(...hits.map((r) => year(r.low))) !== b.y2)
        report(
          `"${between}" in "${b.sentence}" does not run from the year of the first high to the year of the last low \
of the falls it counts`,
          'R6',
        );
    }
  }
  // E states each coin's falls in the chart's order; a wrong figure still uses its place, so one fault is one problem.
  const used = new Map<string, number>();
  for (const { sentence, clauses } of exacts) {
    for (const { name, id, figures } of clauses) {
      const free = rowsOf(id).filter((row) => !counted.has(row));
      if (rowsOf(id).length === 0) noFall(name, sentence, 'R5');
      else
        for (const figure of figures) {
          const place = used.get(id) ?? 0;
          const fall = free[place]?.fall;
          used.set(id, place + 1);
          if (fall === undefined)
            report(`"${figure} %" in "${sentence}" names a fall of ${name} that the chart does not draw or a B \
sentence already counts`);
          else if (Number(fall) !== Number(figure))
            report(`"${figure} %" in "${sentence}" is not ${name}'s fall at that place in the chart's order`);
        }
    }
  }
  for (const id of chartIds) {
    if ((used.get(id) ?? 0) < rowsOf(id).filter((row) => !counted.has(row)).length) {
      const name = coins.find((coin) => coin.id === id)?.name ?? id;
      report(`the chart draws a fall of ${name} that no sentence of its section states`, 'R5', 'figure-unstated');
    }
  }
  return problems;
}
