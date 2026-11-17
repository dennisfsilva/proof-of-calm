// The build's closed-body check on every Learn module (ADR-0048): the same MDX compiler and the same element
// list as the hosts, so `pnpm validate:content` refuses a module before a build does. Apart from validate.ts,
// which runs on import, so that a test can call it.
import { checkModuleBody, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { type LearnModule, parseModule } from '../src/loaders/modules.ts';
import type { Problem } from '../src/problem.ts';

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

/**
 * The chart a file is held to: its own front matter's, or with `english`, the file being a translation with no
 * chart key (ADR-0048 Deviations), the chart of the English module it is named after. A file whose front matter
 * does not parse, or a translation named after no English module, is skipped: `moduleProblems` and
 * `moduleTranslationProblems` report it.
 */
function chartOf(path: string, source: string, english?: readonly LearnModule[]) {
  if (english !== undefined) return english.find(({ slug }) => path.endsWith(`/${slug}.mdx`))?.chart;
  const parsed = parseModule(path, source);
  return parsed.ok ? parsed.value.chart : undefined;
}

/**
 * One `module-closed-body` problem per module the build would refuse, and one `module-chart-element` problem
 * per module that compiles with a chart count its chart does not name; the empty list is a pass. With
 * `english`, every file is a translation of one of them.
 */
export async function closedBodyProblems(
  modules: readonly ModuleFile[],
  english?: readonly LearnModule[],
): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const { path, source } of modules) {
    const { problem, flow } = await checkModuleBody(source, path, MODULE_BODY_ELEMENTS);
    if (problem === null) {
      const chart = chartOf(path, source, english);
      if (chart !== undefined) problems.push(...chartElementProblems(path, chart, flow));
      continue;
    }
    // The compiler's message opens with `<path>:<line>: `; the report already names the path.
    const detail = problem.startsWith(`${path}:`) ? `line ${problem.slice(path.length + 1)}` : problem;
    problems.push({ path, code: 'module-closed-body', detail });
  }
  return problems;
}
