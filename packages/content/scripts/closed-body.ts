// The build's closed-body check on every Learn module (ADR-0048): the same MDX compiler and the same element
// list as the hosts, so `pnpm validate:content` refuses a module before a build does. Apart from validate.ts,
// which runs on import, so that a test can call it.
import { checkModuleBody, MODULE_BODY_ELEMENTS, type ModuleBodyCheck } from '@proofofcalm/config/vite';
import { hyphenProblems } from '../src/hyphen-validate.ts';
import type { TranslationFile } from '../src/i18n/module-overlay-validate.ts';
import { numbersIn } from '../src/i18n/overlay-validate.ts';
import { type LearnModule, parseModule, readFields } from '../src/loaders/modules.ts';
import { isCountLanguage, moduleCountProblems, moduleCountTexts } from '../src/module-counts.ts';
import { type FigureContext, moduleContext, moduleFigureProblems } from '../src/module-figures.ts';
import { bodyFindings } from '../src/modules-validate.ts';
import { findingProblems, type Problem } from '../src/problem.ts';
import { type Finding, findBanned } from '../src/style/banned.ts';

type ModuleFile = { readonly path: string; readonly source: string };

const CHART = 'Chart';

/**
 * The front matter's chart against the flow `<Chart />` elements of the compiled tree (docs/EDUCATION.md §10):
 * one exactly when it names a chart. An escaped element or a code span is text, so it counts as none.
 */
function chartElementProblems(path: string, chart: LearnModule['chart'], flow: readonly string[]): Problem[] {
  const count = flow.filter((name) => name === CHART).length;
  if (chart === 'none') {
    if (count === 0) return [];
    return [{ path, code: 'module-chart-element', detail: 'remove <Chart />: the front matter says chart: none' }];
  }
  if (count === 1) return [];
  const detail = `write <Chart /> once, on a line of its own, where the ${chart} chart stands`;
  return [{ path, code: 'module-chart-element', detail }];
}

const englishOf = (path: string, english: readonly LearnModule[]) =>
  english.find(({ slug }) => path.endsWith(`/${slug}.mdx`));

/**
 * The chart a file is held to: its own front matter's, or with `english`, the file being a translation with no
 * chart key (ADR-0048 Deviations), the chart of the English module it is named after. A file whose front matter
 * does not parse, or a translation named after no English module, is skipped: `moduleProblems` and
 * `moduleTranslationProblems` report it.
 */
function chartOf(path: string, source: string, english?: readonly LearnModule[]) {
  if (english !== undefined) return englishOf(path, english)?.chart;
  const parsed = parseModule(path, source);
  return parsed.ok ? parsed.value.chart : undefined;
}

// The front matter's fields as written, whether or not they parse, so the count rule reads the title, idea and caveat
// of any module the compiler reads (`moduleProblems` reports a field that does not parse).
function frontOf(path: string, source: string) {
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  return lines[0] === '---' && close !== -1 ? Object.fromEntries(readFields(path, lines.slice(1, close)).fields) : {};
}

// The body exactly as parseModule takes it, the lines after the front matter joined by \n, whether or not its fields
// parse; a file with no front matter is all body (`moduleTranslationProblems` reports it).
function bodyOf(source: string) {
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  return lines.slice(lines[0] === '---' && close !== -1 ? close + 1 : 0).join('\n');
}

// A finding's words, its letters and digits, in order.
const wordsOf = ({ match }: Finding) => match.match(/[\p{L}\p{N}]+/gu) ?? [];
// Whether every word of `part` stands in `whole` in the same order, other words between them allowed.
const within = (part: readonly string[], whole: readonly string[]) =>
  part.length === whole.reduce((found, word) => found + Number(word === part[found]), 0);
// Two reads of one line: the same rule, and one quote's words within the other's. The block read quotes its block,
// a list marker and a list item's number included; English's module reads quote the line or its joined lines.
const sameLine = (shown: Finding, read: Finding) =>
  shown.rule === read.rule && (within(wordsOf(shown), wordsOf(read)) || within(wordsOf(read), wordsOf(shown)));

/**
 * A maximum matching between `left` and `right` by augmenting paths (Kuhn), with an edge wherever `pairs` holds. Each
 * item is in at most one pair, and the matching takes as many pairs as the edges allow in any order of either side. It
 * returns the indices of the `left` items it pairs.
 */
function matched(
  left: readonly Finding[],
  right: readonly Finding[],
  pairs: (a: Finding, b: Finding) => boolean,
): ReadonlySet<number> {
  const edges = left.map((a) => right.flatMap((b, to) => (pairs(a, b) ? [to] : [])));
  const owner = new Map<number, number>();
  const augment = (from: number, seen: Set<number>): boolean =>
    (edges[from] ?? []).some((to) => {
      if (seen.has(to)) return false;
      seen.add(to);
      const held = owner.get(to);
      if (held !== undefined && !augment(held, seen)) return false;
      owner.set(to, from);
      return true;
    });
  for (const from of left.keys()) augment(from, new Set());
  return new Set(owner.values());
}

/**
 * English's module reads of a translation's source body, less those a maximum matching pairs with the block read's
 * findings. Each block finding pairs with at most one source finding, so a line both reads refuse is reported once,
 * in the block read's quote, and a phrase refused on two lines is reported twice.
 */
function sourceOnly(shown: readonly Finding[], source: string): Finding[] {
  const reads = bodyFindings(bodyOf(source));
  const paired = matched(reads, shown, (read, finding) => sameLine(finding, read));
  return reads.filter((_, index) => !paired.has(index));
}

const listed = (elements: readonly string[]) => elements.join(', ') || 'none';

// A block's words with each line end a space, so a phrase cannot hide across a line inside one block.
const spaced = (block: string) => block.replace(/\s+/g, ' ');
// Each block's figures, read on their own so none runs into the next block's, and the number the page shows for each
// ordered list item (`listNumbers`, which no block's text holds), pooled into one sorted list.
const numbers = (page: ModuleBodyCheck['page'], language: string) =>
  page
    .flatMap((block) => [
      ...(block.kind === 'element' ? [] : numbersIn(spaced(block.text), language)),
      ...(block.listNumbers ?? []).flatMap((shown) => numbersIn(String(shown), 'en')),
    ])
    .sort()
    .join(' ') || 'none';

/**
 * A translation's compiled body, as the page shows it, block by block: the ban list and the no-break hyphen on each
 * block's words, and, against its English module's compiled body, its elements and depth-2 headings in order and
 * its numbers. The ban list also reads the source body with English's three module reads (`bodyFindings`), so a line
 * the page starts inside a block and a phrase across a source wrap are refused as in English (ADR-0048 Deviations).
 * A body English's compiler refuses gives the ban list and the hyphen check only; English's own run reports that body.
 */
async function translationProblems(
  path: string,
  language: string,
  source: string,
  mine: ModuleBodyCheck,
  english?: LearnModule,
) {
  const blocks = mine.blocks.map(spaced);
  const shown = blocks.map((words) => findBanned(words));
  const own = [
    ...blocks.flatMap((words, index) => [
      ...findingProblems(path, 'body', shown[index] ?? []),
      ...hyphenProblems(path, 'body', words),
    ]),
    ...findingProblems(path, 'body', sourceOnly(shown.flat(), source)),
  ];
  if (english === undefined) return own;
  const theirs = await checkModuleBody(
    english.body,
    `packages/content/learn/${english.slug}.mdx`,
    MODULE_BODY_ELEMENTS,
  );
  if (theirs.problem !== null) return own;
  const problems: Problem[] = [];
  if (listed(theirs.elements) !== listed(mine.elements)) {
    const detail = `English ${listed(theirs.elements)}; translation ${listed(mine.elements)}; write English's elements and ## headings in English's order, a flow element on a line of its own and a text element inside its sentence`;
    problems.push({ path, code: 'module-overlay-elements', detail });
  }
  const [ours, others] = [numbers(mine.page, language), numbers(theirs.page, 'en')];
  if (ours !== others)
    problems.push({ path, code: 'overlay-number-mismatch', detail: `body: ${ours}, English ${others}` });
  return [...problems, ...own];
}

/**
 * One `module-closed-body` problem per module the build would refuse, and one `module-chart-element` problem
 * per module that compiles with a chart count its chart does not name; the empty list is a pass. With
 * `english`, every file is a translation of one of them, also held to its elements (`module-overlay-elements`)
 * and numbers, and read by the ban list and the hyphen check, on the text its compiled page shows, and by the ban
 * list's module reads on its source body. Every module
 * that compiles has its chart's section read against `figures` (`figure-chart`, `figure-unstated`), and every English,
 * pt-PT or German module that compiles has its counts read in the title, idea, caveat and body (`figure-join`,
 * src/module-counts.ts).
 */
export function closedBodyProblems(
  modules: readonly ModuleFile[],
  options: { readonly figures: FigureContext },
): Promise<Problem[]>;
export function closedBodyProblems(
  translations: readonly TranslationFile[],
  options: { readonly english: readonly LearnModule[]; readonly figures: FigureContext },
): Promise<Problem[]>;
export async function closedBodyProblems(
  modules: readonly (ModuleFile & { readonly language?: string })[],
  { english, figures }: { readonly english?: readonly LearnModule[]; readonly figures: FigureContext },
): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const { path, source, language } of modules) {
    const read = await checkModuleBody(source, path, MODULE_BODY_ELEMENTS);
    const { problem, flow } = read;
    if (problem === null) {
      const chart = chartOf(path, source, english);
      if (chart !== undefined) {
        problems.push(...chartElementProblems(path, chart, flow));
        const context = moduleContext({ chart }, language ?? 'en', figures);
        problems.push(...moduleFigureProblems(path, read.page, context));
      }
      const counted = language ?? 'en';
      if (isCountLanguage(counted))
        problems.push(...moduleCountProblems(path, moduleCountTexts(frontOf(path, source), read.page), counted));
      if (english !== undefined && language !== undefined)
        problems.push(...(await translationProblems(path, language, source, read, englishOf(path, english))));
      continue;
    }
    // The compiler's message opens with `<path>:<line>: `; the report already names the path.
    const detail = problem.startsWith(`${path}:`) ? `line ${problem.slice(path.length + 1)}` : problem;
    problems.push({ path, code: 'module-closed-body', detail });
  }
  return problems;
}
