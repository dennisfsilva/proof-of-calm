// The build's closed-body check on every Learn module (ADR-0048): the same MDX compiler and the same element
// list as the hosts, so `pnpm validate:content` refuses a module before a build does. Apart from validate.ts,
// which runs on import, so that a test can call it.
import { checkModuleBody, MODULE_BODY_ELEMENTS, type ModuleBodyCheck } from '@proofofcalm/config/vite';
import { hyphenProblems } from '../src/hyphen-validate.ts';
import type { TranslationFile } from '../src/i18n/module-overlay-validate.ts';
import { numbersIn } from '../src/i18n/overlay-validate.ts';
import { type LearnModule, parseModule } from '../src/loaders/modules.ts';
import { bannedProblems, type Problem } from '../src/problem.ts';

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

const listed = (elements: readonly string[]) => elements.join(', ') || 'none';

// The page's words with each line end a space, so a phrase cannot hide across a line.
const spaced = (text: string) => text.replace(/\s+/g, ' ');
const numbers = (text: string, language: string) => numbersIn(spaced(text), language).join(' ') || 'none';

/**
 * A translation's compiled body, as the page shows it: the ban list and the no-break hyphen on its words, and,
 * against its English module's compiled body, its elements in order and its numbers. A body English's compiler
 * refuses gives the ban list and the hyphen check only; English's own run reports that body.
 */
async function translationProblems(path: string, language: string, mine: ModuleBodyCheck, english?: LearnModule) {
  const words = spaced(mine.text);
  const own = [...bannedProblems(path, 'body', words), ...hyphenProblems(path, 'body', words)];
  if (english === undefined) return own;
  const theirs = await checkModuleBody(
    english.body,
    `packages/content/learn/${english.slug}.mdx`,
    MODULE_BODY_ELEMENTS,
  );
  if (theirs.problem !== null) return own;
  const problems: Problem[] = [];
  if (listed(theirs.elements) !== listed(mine.elements)) {
    const detail = `English ${listed(theirs.elements)}; translation ${listed(mine.elements)}`;
    problems.push({ path, code: 'module-overlay-elements', detail });
  }
  const [ours, others] = [numbers(mine.text, language), numbers(theirs.text, 'en')];
  if (ours !== others)
    problems.push({ path, code: 'overlay-number-mismatch', detail: `body: ${ours}, English ${others}` });
  return [...problems, ...own];
}

/**
 * One `module-closed-body` problem per module the build would refuse, and one `module-chart-element` problem
 * per module that compiles with a chart count its chart does not name; the empty list is a pass. With
 * `english`, every file is a translation of one of them, also held to its elements (`module-overlay-elements`)
 * and numbers, and read by the ban list and the hyphen check, on the text its compiled page shows.
 */
export function closedBodyProblems(modules: readonly ModuleFile[]): Promise<Problem[]>;
export function closedBodyProblems(
  translations: readonly TranslationFile[],
  english: readonly LearnModule[],
): Promise<Problem[]>;
export async function closedBodyProblems(
  modules: readonly (ModuleFile & { readonly language?: string })[],
  english?: readonly LearnModule[],
): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const { path, source, language } of modules) {
    const read = await checkModuleBody(source, path, MODULE_BODY_ELEMENTS);
    const { problem, flow } = read;
    if (problem === null) {
      const chart = chartOf(path, source, english);
      if (chart !== undefined) problems.push(...chartElementProblems(path, chart, flow));
      if (english !== undefined && language !== undefined)
        problems.push(...(await translationProblems(path, language, read, englishOf(path, english))));
      continue;
    }
    // The compiler's message opens with `<path>:<line>: `; the report already names the path.
    const detail = problem.startsWith(`${path}:`) ? `line ${problem.slice(path.length + 1)}` : problem;
    problems.push({ path, code: 'module-closed-body', detail });
  }
  return problems;
}
