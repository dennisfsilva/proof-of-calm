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
/** What one module's chart section is read against; `listed` is its language's list (LISTED). */
export type ModuleFigures = FigureContext & {
  readonly chart: LearnModule['chart'];
  readonly language: string;
  readonly listed: readonly string[];
};

// A translation's chart section is closed (§9): each sentence and heading there is its language's B or E, or one listed
// here as the page shows it, compared character for character. Each was listed in a reviewed pull request whose fact
// check found in it no figure, count, date, amount or coin. A language with no entry lists nothing.
const LISTED: Readonly<Record<string, readonly string[]>> = {
  'pt-PT': [
    'Um plano mensal define o dia de cada compra.',
    'Não limita até onde um preço pode cair, e uma moeda pode perder quase todo o seu valor.',
    'Cada barra abaixo é uma queda de uma moeda, desde um máximo de ciclo até ao preço mais baixo depois desse máximo.',
  ],
};

export const moduleContext = ({ chart }: Pick<LearnModule, 'chart'>, language: string, all: FigureContext) =>
  ({ chart, language, listed: LISTED[language] ?? [], ...all }) satisfies ModuleFigures;

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
type Kinds = readonly (readonly [kind: string, pattern: RegExp])[];
const KINDS: Kinds = [
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

// The shapes, as docs/CONTENT-STYLE.md §4 and §9 write them, for English and pt-PT; any other language's section
// fails closed. `one` is the word for one fall; C1 is a coin with its article capitalised, which opens pt-PT's E.
type Shapes = { readonly b: RegExp; readonly e: RegExp; readonly clause: RegExp; readonly one: string };
const N = '(?:100|[1-9][0-9]?)';
const J = `(?:${MODULE_PERCENT_JOINERS.map(esc).join('|')})`;
const F = `${N}${J}%`;
const Y = '[12][0-9]{3}';
const K = '(?<k>[1-9][0-9]?)';
const B = (C: string) => `(?<c>${C})`;
const clause = (C: string) => new RegExp(`(?<c>${C})(?= )|(?<f>${N})(?=${J}%)`, 'gu');
function shapesOf(language: string, C: string, C1: string): Shapes | undefined {
  if (language === 'en') {
    const L = `${F}(?: and ${F}|(?:, ${F})+, and ${F})?`;
    return {
      b: new RegExp(
        `^In the chart, ${B(C)} had ${K} (?<falls>falls?) of more than (?<n>${N})${J}% between (?<y1>${Y}) and (?<y2>${Y})\\.$`,
        'u',
      ),
      e: new RegExp(`^(?:${C}) fell ${L}(?:(?:, (?:${C}) ${L})*, and (?:${C}) ${L})?\\.$`, 'u'),
      clause: clause(C),
      one: 'fall',
    };
  }
  if (language !== 'pt-PT') return undefined;
  // No comma before `e`, in a list of figures or between clauses (§9).
  const L = `${F}(?: e ${F}|(?:, ${F})+ e ${F})?`;
  return {
    b: new RegExp(
      `^No gráfico, ${B(C)} teve ${K} (?<falls>quedas?) de mais de (?<n>${N})${J}% entre (?<y1>${Y}) e (?<y2>${Y})\\.$`,
      'u',
    ),
    e: new RegExp(`^(?:${C1}) caiu ${L}(?:(?:, (?:${C}) ${L})* e (?:${C}) ${L})?\\.$`, 'u'),
    clause: clause(`${C1}|${C}`),
    one: 'queda',
  };
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/**
 * Each catalogue coin by the names a shape reads, spelling to id. English: as written, with a lower-case first
 * letter, and Ether for ETH. pt-PT (§9): `a` before either spelling of every coin and `o ether` for ETH, each also
 * with its article capitalised; no other article agrees.
 */
function spellings(coins: readonly Coin[], language: string): Map<string, string> {
  if (language !== 'pt-PT')
    return new Map(
      coins.flatMap(({ id, name }) =>
        [name, lowerFirst(name), ...(id === 'ETH' ? ['Ether', 'ether'] : [])].map(
          (spelling) => [spelling, id] as const,
        ),
      ),
    );
  return new Map(
    coins.flatMap(({ id, name }) =>
      [`a ${name}`, `a ${lowerFirst(name)}`, ...(id === 'ETH' ? ['o ether'] : [])].flatMap((spelling) => [
        [spelling, id] as const,
        [upperFirst(spelling), id] as const,
      ]),
    ),
  );
}

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
  const closed = language !== 'en';
  const listed = new Set(context.listed);
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
  const names = spellings(coins, language);
  const opens = (spelling: string) => language === 'pt-PT' && /^[AO] /u.test(spelling);
  const keys = [...names.keys()];
  const shapes = shapesOf(language, alt(keys.filter((key) => !opens(key))), alt(keys.filter(opens)));
  // A detail names the coin without its article.
  const bare = (spelling: string) => (language === 'pt-PT' ? spelling.slice(2) : spelling);
  const mine = coins.filter(({ id }) => chartIds.includes(id));
  const coinNames = [...mine.map(({ name }) => name), ...(chartIds.includes('ETH') ? ['ether'] : [])];
  const kinds: Kinds = [
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
  type Bound = {
    sentence: string;
    id: string;
    name: string;
    k: number;
    falls: string;
    n: string;
    y1: number;
    y2: number;
  };
  const bounds: Bound[] = [];
  const exacts: { sentence: string; clauses: { name: string; id: string; figures: string[] }[] }[] = [];
  for (const block of page.slice(start, end)) {
    if (block.kind === 'element') continue;
    const shown = block.text.replace(/\s+/gu, ' ').trim();
    if (block.kind === 'code') {
      report(`the code block "${shown}" sits in the chart's section, which holds no code block`);
      continue;
    }
    // English's section is open: a block with no trigger is prose. A translation's is closed: such a block is prose
    // only when its language lists each of its sentences and it holds no mark.
    const hit = triggerIn(block.text);
    const allListed = sentencesOf(block.text).every((sentence) => listed.has(sentence));
    if (hit === null && (!closed || (allListed && block.marks === undefined))) continue;
    const holds = hit === null ? '' : ` ${hit.kind} "${hit.token}"`;
    if (block.kind === 'heading') {
      report(
        hit === null
          ? `the heading "${shown}" in the chart's section is not a sentence ${language}'s list holds`
          : `the heading "${shown}" holds${holds} in the chart's section`,
      );
      continue;
    }
    if (block.marks !== undefined) {
      const marks = list(block.marks.map((mark) => MARKS[mark] ?? mark));
      report(`the paragraph "${shown}" holds ${marks}${hit === null ? '' : ` beside${holds}`} in the chart's section, \
which reads plain text only`);
      continue;
    }
    // The app formats N % only with one joiner it knows, in one string (withJoiner); sentencesOf collapses white space.
    for (const [written, joiner = '', sign] of block.text.matchAll(new RegExp(`${NUMERAL}(\\s*)(${SIGNS})`, 'gu'))) {
      if (!MODULE_PERCENT_JOINERS.includes(joiner) || sign !== '%')
        report(`"${quote(written)}" in "${shown}" joins a figure to a sign other than by one space and %`);
    }
    for (const sentence of sentencesOf(block.text)) {
      const found = triggerIn(sentence);
      if (found === null && (!closed || listed.has(sentence))) continue;
      const b = shapes?.b.exec(sentence)?.groups;
      if (shapes !== undefined && b?.c !== undefined && (b.k === '1') === (b.falls === shapes.one)) {
        const [k, falls, n, y1, y2] = [Number(b.k), b.falls ?? '', b.n ?? '', Number(b.y1), Number(b.y2)];
        bounds.push({ sentence, id: names.get(b.c) ?? '', name: bare(b.c), k, falls, n, y1, y2 });
      } else if (shapes?.e.test(sentence) === true) {
        const clauses: (typeof exacts)[number]['clauses'] = [];
        for (const { groups } of sentence.matchAll(shapes.clause)) {
          if (groups?.c !== undefined)
            clauses.push({ name: bare(groups.c), id: names.get(groups.c) ?? '', figures: [] });
          else if (groups?.f !== undefined) clauses.at(-1)?.figures.push(groups.f);
        }
        exacts.push({ sentence, clauses });
      } else {
        const where = shapes === undefined ? `, and ${language} has no shapes for a chart's section yet` : '';
        const what =
          found === null
            ? `is not a sentence ${language}'s list holds`
            : `holds ${found.kind} "${quote(found.token)}"`;
        report(`"${sentence}" ${what} and matches neither shape of a chart's section${where}`);
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
          `"${b.k} ${b.falls}" in "${b.sentence}" is not how many of ${b.name}'s falls in the \
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
