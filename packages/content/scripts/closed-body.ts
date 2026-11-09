// The build's closed-body check on every Learn module (ADR-0048): the same MDX compiler and the same element
// list as the hosts, so `pnpm validate:content` refuses a module before a build does. Apart from validate.ts,
// which runs on import, so that a test can call it.
import { checkModuleBody, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { parseModule } from '../src/loaders/modules.ts';
import type { Problem } from '../src/problem.ts';

type ModuleFile = { readonly path: string; readonly source: string };

const CHART = 'Chart';

/**
 * The front matter's chart against the flow `<Chart />` elements of the compiled tree (docs/EDUCATION.md §10):
 * one exactly when it names a chart. An escaped element or a code span is text, so it counts as none. A module
 * whose front matter does not parse is skipped: `moduleProblems` reports it.
 */
function chartElementProblems(path: string, source: string, flow: readonly string[]): Problem[] {
  const parsed = parseModule(path, source);
  if (!parsed.ok) return [];
  const { chart } = parsed.value;
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
 * One `module-closed-body` problem per module the build would refuse, and one `module-chart-element` problem
 * per module that compiles with a chart count its front matter does not name; the empty list is a pass.
 */
export async function closedBodyProblems(modules: readonly ModuleFile[]): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const { path, source } of modules) {
    const { problem, flow } = await checkModuleBody(source, path, MODULE_BODY_ELEMENTS);
    if (problem === null) {
      problems.push(...chartElementProblems(path, source, flow));
      continue;
    }
    // The compiler's message opens with `<path>:<line>: `; the report already names the path.
    const detail = problem.startsWith(`${path}:`) ? `line ${problem.slice(path.length + 1)}` : problem;
    problems.push({ path, code: 'module-closed-body', detail });
  }
  return problems;
}
