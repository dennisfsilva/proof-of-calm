// The quiet check an agent runs before handing a branch back: the gate's fast half (types, lint, unit
// tests, content validation and the root lints, without the builds and the browser runs), one line per
// step, and only a failing step's last 40 lines. Colour is off (NO_COLOR, FORCE_COLOR=0) and vitest
// uses its dot reporter (CREW_QUIET), so a green run prints under 2 KB whatever the terminal.
//
// Usage: pnpm check   (from the repository root; exits with the first failing step's code)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export type Step = { name: string; command: string };

export const STEPS: readonly Step[] = [
  {
    name: 'typecheck, lint, test, validate',
    command: 'pnpm exec turbo run typecheck lint test validate --output-logs=errors-only',
  },
  { name: 'dependency rule', command: 'pnpm lint:deps' },
  { name: 'styles lint', command: 'pnpm lint:styles' },
  { name: 'docs lint', command: 'pnpm lint:docs' },
  { name: 'size lint', command: 'pnpm lint:size' },
  { name: 'commit subjects', command: 'pnpm lint:commits' },
];

/** The environment the steps run in: colour off, vitest quiet, everything else inherited. */
export const QUIET_ENV = { NO_COLOR: '1', FORCE_COLOR: '0', CREW_QUIET: '1' } as const;

export const TAIL_LINES = 40;

export type Result = { status: number; output: string };
/** Runs one command through the shell and returns its exit status with stdout and stderr interleaved. */
export type Runner = (command: string) => Result;

const shellRunner: Runner = (command) => {
  const child = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...QUIET_ENV },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  if (child.error) return { status: 1, output: `${output}${child.error.message}\n` };
  return { status: child.status ?? 1, output };
};

/** The last `count` non-empty lines of a step's output. */
export function tail(output: string, count = TAIL_LINES): string {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.slice(-count).join('\n');
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Runs the steps in order and prints one line each; stops at the first failure, prints that step's
 * tail and returns its exit status. Returns 0 when every step passed.
 */
export function runSteps(
  steps: readonly Step[],
  run: Runner,
  print: (line: string) => void,
  now: () => number = Date.now,
): number {
  const started = now();
  for (const step of steps) {
    const stepStarted = now();
    const result = run(step.command);
    const took = seconds(now() - stepStarted);
    if (result.status === 0) {
      print(`ok    ${step.name} (${took})`);
      continue;
    }
    print(`FAIL  ${step.name} (${took}, exit ${result.status})`);
    print(`      ${step.command}`);
    print(tail(result.output));
    return result.status;
  }
  print(`check: ${steps.length} steps green in ${seconds(now() - started)}`);
  return 0;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  Object.assign(process.env, QUIET_ENV);
  process.exit(runSteps(STEPS, shellRunner, (line) => console.log(line)));
}
