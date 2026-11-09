// The build's closed-body check on every Learn module (ADR-0048): the same MDX compiler and the same element
// list as the hosts, so `pnpm validate:content` refuses a module before a build does. Apart from validate.ts,
// which runs on import, so that a test can call it.
import { checkModuleBody, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import type { Problem } from '../src/problem.ts';

type ModuleFile = { readonly path: string; readonly source: string };

/** One `module-closed-body` problem per module the build would refuse; the empty list is a pass. */
export async function closedBodyProblems(modules: readonly ModuleFile[]): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const { path, source } of modules) {
    const message = await checkModuleBody(source, path, MODULE_BODY_ELEMENTS);
    if (message === null) continue;
    // The compiler's message opens with `<path>:<line>: `; the report already names the path.
    const detail = message.startsWith(`${path}:`) ? `line ${message.slice(path.length + 1)}` : message;
    problems.push({ path, code: 'module-closed-body', detail });
  }
  return problems;
}
