// The gate on one Learn module (docs/EDUCATION.md §10, ADR-0048): what the parser refuses, the file name, the
// 400 words, its facts, its age, the owner's review, the syntax, its chart element, the banned words, and the no-break
// hyphen between a number and its unit. Pure, like validate.ts.
import { hyphenProblems } from './hyphen-validate.ts';
import { type LearnModule, parseModule, plainText } from './loaders/modules.ts';
import { monthsBefore } from './months.ts';
import { bannedProblems, findingProblems, type Problem } from './problem.ts';
import { type Finding, findBanned } from './style/banned.ts';

type ModuleFile = { readonly path: string; readonly source: string };
type ModuleContext = {
  /** Each fact's `lastReviewed` by its key. */
  readonly facts: ReadonlyMap<string, string>;
  /** YYYY-MM-DD, the build's day. */
  readonly today: string;
};

const MAX_WORDS = 400;
const FACT_STALE_MONTHS = 12; // docs/CONTENT-OPS.md §7
const MODULE_STALE_MONTHS = 18; // docs/CONTENT-STYLE.md §5
const REVIEW = 'the owner reviews it and sets lastReviewed';
// A statement's shape at column 1 is refused wherever the line stands: `import` then a quote, `{`, `*`, or a name and
// `from` with a quote; `export` then `{`, `*`, or a declaring word. This reads no block structure, so it may refuse
// too much, a statement in a fence or wrapped into a paragraph: the compiler's tree walk is the exact reader and fails
// the build, this only reports early, and a false refusal costs an author one re-wrap.
const STATEMENT =
  /^(?:import +(?:["'{*]|[\w$]+ +from *["'])|export +(?:[{*]|(?:default|const|let|var|function|class|async)\b))/;
// At the start of a block, prose with these words is code to the compiler too.
const BLOCK_STATEMENT = /^(?:import|export) /;
// A newline with no blank line on either side, with the spaces and the hard-break backslash around it.
const SINGLE_NEWLINE = /(?<!\n[ \t]*)[ \t\\]*\n(?![ \t]*\n)[ \t]*/g;
// The hard-break backslash at a line end: a mark, no part of what a person reads or of a finding.
const HARD_BREAK = /\\$/gm;
// An even run of backslashes escapes nothing: \{ is text, \\{ is a backslash and an expression.
const UNESCAPED = /(?<!\\)(?:\\\\)*([{<])/g;
const BRACE = 'write \\{ to show a brace; a module carries text, never an expression';
const ANGLE = 'write \\< to show a less-than sign; the elements a body holds are <PastPerformance /> and <Chart />';
// The inline link's and image's mark; a reference link has none and falls to the compiler's tree walk.
const INLINE_LINK = '](';
const LINK = 'a module holds no link; the screen that shows it links to it (ADR-0048)';
// The elements a body holds: the past-performance sentence and the Risk link as one (docs/LEGAL.md §4), and the place
// of the front matter's chart (docs/EDUCATION.md §10).
const ELEMENT = '<PastPerformance />';
const CHART = '<Chart />';
// So a module never writes those words itself: in any case, across marks, a line end, a dash, an escape or an entity.
const PAST_PERFORMANCE = /past(?:[\s\p{Pd}\\]|&#?\w+;)+performance/iu;

// Where the page starts a line (docs/CONTENT-STYLE.md §2, German item 2), from each source line with its quote and
// list marks taken off: a block at a heading, an item, a fence, a rule or underline or a quote that opens, and after a
// heading, a rule or an empty item; a line inside a block after a hard break, on each line of a fence, and at an item
// number other than 1 or a line of `=`, which may go on with the paragraph above (CommonMark), so the dash keeps the
// block's asset in reach and stands in for the dot plainText drops. Any other single newline is a source wrap. It
// reads no tree and may start a line the compiler goes on with: a capital there is refused, which costs a re-wrap.
const QUOTES = /^(?:[ \t]*>)+/;
const MARKS = /^(?:[ \t]*(?:>|(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)))*[ \t]*/;
const ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const ORDERED = /^[ \t]*\d{1,9}[.)](?:[ \t]|$)/;
const NOT_ONE = /^[ \t]*(?!0*1[.)])\d{1,9}[.)](?:[ \t]|$)/;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const RULE = /^(?:[-*_][ \t]*)+$/;
const EQUALS = /^=+[ \t]*$/;
// 3 or more backticks (none after them) or tildes; a fence closes on a bare run of its mark, at least as long.
const FENCE = /^(`{3,}(?=[^`]*$)|~{3,})(.*)$/;
const BREAK_END = /(?:\\| {2,})$/;
// A dash opens and closes a clause for the German rule (directive-de.ts), and shows where the page breaks the line.
const LINE_START = ' — ';

const unquoted = (line: string) => line.replace(QUOTES, '');
const inner = (line: string) => line.replace(MARKS, '');
const depth = (line: string) => (QUOTES.exec(line)?.[0].split('>').length ?? 1) - 1;
const shown = (line: string) =>
  plainText(line.trim() === ELEMENT ? line : line.replaceAll(ELEMENT, LINE_START))
    .replace(HARD_BREAK, '')
    .trim();

/** What the page sets before each source line: a line's end, a dash inside a block, or a space (a source wrap). */
function breaks(source: readonly string[]): string[] {
  let open = '';
  const code = source.map((line) => {
    const [, marks, rest = ''] = FENCE.exec(inner(line)) ?? [];
    if (open === '') {
      if (marks === undefined) return '';
      open = marks;
      return 'fence';
    }
    if (marks === undefined || marks[0] !== open[0] || marks.length < open.length || rest.trim() !== '') return 'code';
    open = '';
    return 'fence';
  });
  return source.map((line, index) => {
    const above = source[index - 1] ?? '';
    const [before, here] = [inner(above), inner(line)];
    if (code[index] === 'code' && code[index - 1] === 'code') return LINE_START;
    if (index === 0 || shown(above) === '' || shown(line) === '' || code[index] !== '' || code[index - 1] !== '')
      return '\n';
    if (HEADING.test(before) || RULE.test(before) || (ITEM.test(unquoted(above)) && before === '')) return '\n';
    const lazy = depth(line) <= depth(above) && NOT_ONE.test(unquoted(line)) && !ORDERED.test(unquoted(above));
    if (lazy || EQUALS.test(before) || EQUALS.test(here)) return LINE_START;
    if (ITEM.test(unquoted(line)) || HEADING.test(here) || RULE.test(here) || depth(line) > depth(above)) return '\n';
    return BREAK_END.test(above) ? LINE_START : ' ';
  });
}

/** The body as its page sets the lines: one per block, a source wrap a space, a line started inside a block a dash. */
function pageLines(body: string): string {
  const source = body.split('\n');
  const between = breaks(source);
  return source.map((line, index) => `${index === 0 ? '' : between[index]}${shown(line)}`).join('');
}

const words = (match: string) => match.replaceAll(LINE_START, ' ');

/**
 * Three reads: as it stands, for the rule imperative alone, so a line that opens with an English or Portuguese
 * imperative fires; with each single newline as a space for every rule, so a phrase cannot hide across a line and an
 * allow-listed phrase holds across one; and the German line rule alone on the page's lines (pageLines), where a source
 * wrap opens no clause and a line the page starts opens one (docs/CONTENT-STYLE.md §2). An imperative of the second
 * read that holds one of the first is that same finding, and so is a finding of the third that a finding before it
 * holds. The first two drop the hard-break backslash at a line end. scripts/closed-body.ts runs them on a translation's
 * source body as well, beside its block read (ADR-0048 Deviations).
 */
export function bodyFindings(body: string): Finding[] {
  const text = plainText(body).replace(HARD_BREAK, '');
  const imperatives = findBanned(text, { germanLines: false }).filter(({ rule }) => rule === 'imperative');
  const isNew = ({ rule, match }: Finding) =>
    rule !== 'imperative' || !imperatives.some((seen) => match.includes(seen.match));
  const found = [...imperatives, ...findBanned(text.replace(SINGLE_NEWLINE, ' ')).filter(isNew)];
  const unseen = (finding: Finding) =>
    isNew(finding) &&
    !found.some(({ rule, match }) => rule === finding.rule && words(match).includes(words(finding.match)));
  return [...found, ...findBanned(pageLines(body), { germanOnly: true }).filter(unseen)];
}

/** From each line alone, and whether the line above is blank; `offset` is the lines above the body in the file. */
function syntaxProblems(path: string, body: string, offset: number): Problem[] {
  const lines = body.split('\n');
  return lines.flatMap((line, index) => {
    const report = (detail: string): Problem => ({
      path,
      code: 'module-syntax',
      detail: `line ${offset + index + 1}: ${detail}`,
    });
    const opensBlock = (lines[index - 1] ?? '').trim() === '';
    const statement = STATEMENT.test(line) || (opensBlock && BLOCK_STATEMENT.test(line));
    return [
      ...(statement ? [report('this line is code in MDX. Reword it or remove it')] : []),
      // Reports early, and may refuse more than the compiler (a code span, plain brackets): `closedBody` is the gate.
      ...(line.includes(INLINE_LINK) ? [report(LINK)] : []),
      ...[...line.replaceAll(ELEMENT, '').replaceAll(CHART, '').matchAll(UNESCAPED)].map((match) =>
        report(match[1] === '{' ? BRACE : ANGLE),
      ),
    ];
  });
}

/** A module shows the sentence only through the element, so the sentence cannot stand without its link. */
function pastPerformanceProblems(path: string, module: LearnModule): Problem[] {
  const read = [module.title, module.idea, module.caveat, plainText(module.body)];
  if (!read.some((text) => PAST_PERFORMANCE.test(text))) return [];
  const detail = `write ${ELEMENT} in place of these words: it sets the sentence and the Risk link together (docs/LEGAL.md §4)`;
  return [{ path, code: 'module-past-performance', detail }];
}

/**
 * The renderer draws the front matter's chart where the body writes the element: one exactly when it names a chart.
 * Reports early from the words alone; the gate is `module-chart-element` in scripts/closed-body.ts, which counts the
 * flow elements of the compiled tree, so an escaped element, a code span or one inside a sentence is its case.
 */
function chartProblems(path: string, module: LearnModule): Problem[] {
  const count = module.body.split(CHART).length - 1;
  if (module.chart === 'none') {
    if (count === 0) return [];
    return [{ path, code: 'module-chart', detail: `remove ${CHART}: the front matter says chart: none` }];
  }
  if (count === 1) return [];
  const detail = `write ${CHART} once, on a line of its own, where the ${module.chart} chart stands`;
  return [{ path, code: 'module-chart', detail }];
}

function factProblems(path: string, keys: readonly string[], context: ModuleContext): Problem[] {
  const oldest = monthsBefore(context.today, FACT_STALE_MONTHS);
  return keys.flatMap((key): Problem[] => {
    const lastReviewed = context.facts.get(key);
    if (lastReviewed === undefined) {
      const detail = `${key}: no fact has this key; use a key from packages/content/facts or remove it`;
      return [{ path, code: 'module-fact-unknown', detail }];
    }
    if (lastReviewed >= oldest) return [];
    const detail = `${key}: last reviewed ${lastReviewed}, more than ${FACT_STALE_MONTHS} months ago; ${REVIEW}`;
    return [{ path, code: 'module-fact-stale', detail }];
  });
}

function metadataProblems(path: string, module: LearnModule, today: string): Problem[] {
  const problems: Problem[] = [];
  if (path.slice(path.lastIndexOf('/') + 1) !== `${module.slug}.mdx`) {
    problems.push({ path, code: 'file-name', detail: `rename the file to ${module.slug}.mdx` });
  }
  if (module.words > MAX_WORDS) {
    const detail = `${module.words} words; cut the body to ${MAX_WORDS} words`;
    problems.push({ path, code: 'module-too-long', detail });
  }
  if (module.lastReviewed < monthsBefore(today, MODULE_STALE_MONTHS)) {
    const detail = `last reviewed ${module.lastReviewed}, more than ${MODULE_STALE_MONTHS} months ago; ${REVIEW}`;
    problems.push({ path, code: 'module-stale', detail });
  }
  if (module.reviewedBy !== 'owner') {
    problems.push({ path, code: 'agent-draft', detail: 'the owner sets reviewedBy to owner after the review' });
  }
  return problems;
}

/** Every problem of one module file; the empty list is a pass. */
export function moduleProblems(file: ModuleFile, context: ModuleContext): Problem[] {
  const { path, source } = file;
  const parsed = parseModule(path, source);
  if (!parsed.ok) return parsed.error;
  const module = parsed.value;
  const linesAbove = source.split(/\r?\n/).length - module.body.split('\n').length;
  return [
    ...metadataProblems(path, module, context.today),
    ...factProblems(path, module.facts, context),
    ...syntaxProblems(path, module.body, linesAbove),
    ...pastPerformanceProblems(path, module),
    ...chartProblems(path, module),
    ...(['title', 'idea', 'caveat'] as const).flatMap((field) => bannedProblems(path, field, module[field])),
    ...findingProblems(path, 'body', bodyFindings(module.body)),
    ...(['title', 'idea', 'caveat'] as const).flatMap((field) => hyphenProblems(path, field, module[field])),
    ...hyphenProblems(path, 'body', plainText(module.body)),
  ];
}
