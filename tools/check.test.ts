import { describe, expect, it } from 'vitest';
import { QUIET_ENV, type Result, runSteps, STEPS, type Step, tail } from './check.ts';

const fakeSteps: Step[] = STEPS.map((step) => ({ ...step, command: `fake ${step.name}` }));

function collect() {
  const lines: string[] = [];
  return { lines, print: (line: string) => lines.push(line) };
}

const clock = () => {
  let t = 0;
  return () => (t += 1500);
};

describe('runSteps', () => {
  it('prints one line per step and a summary, under 2 KB for a green run', () => {
    const { lines, print } = collect();
    const noisy: Result = { status: 0, output: 'x'.repeat(50_000) };
    const status = runSteps(fakeSteps, () => noisy, print, clock());
    expect(status).toBe(0);
    expect(lines).toHaveLength(fakeSteps.length + 1);
    expect(lines[0]).toBe('ok    typecheck, lint, test, validate (1.5 s)');
    expect(lines.at(-1)).toMatch(/^check: 6 steps green in \d+\.\d s$/);
    expect(Buffer.byteLength(lines.join('\n'), 'utf8')).toBeLessThan(2048);
  });

  it('stops at the first failure with its exit code and the last 40 lines of its output', () => {
    const { lines, print } = collect();
    const ran: string[] = [];
    const output = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    const run = (command: string): Result => {
      ran.push(command);
      return command.includes('styles') ? { status: 3, output } : { status: 0, output: '' };
    };
    const status = runSteps(fakeSteps, run, print, clock());
    expect(status).toBe(3);
    expect(ran).toEqual(['fake typecheck, lint, test, validate', 'fake dependency rule', 'fake styles lint']);
    expect(lines[2]).toBe('FAIL  styles lint (1.5 s, exit 3)');
    expect(lines[3]).toBe('      fake styles lint');
    const printed = lines[4]?.split('\n') ?? [];
    expect(printed).toHaveLength(40);
    expect(printed[0]).toBe('line 21');
    expect(printed.at(-1)).toBe('line 60');
  });
});

describe('tail', () => {
  it('drops blank lines and keeps the end', () => {
    expect(tail('a\n\n\nb\r\nc\n', 2)).toBe('b\nc');
  });
});

describe('the step list', () => {
  it('runs turbo with errors only, then the root lints, the commit subjects last', () => {
    expect(STEPS[0]?.command).toContain('--output-logs=errors-only');
    expect(STEPS.map((step) => step.command).slice(1)).toEqual([
      'pnpm lint:deps',
      'pnpm lint:styles',
      'pnpm lint:docs',
      'pnpm lint:size',
      'pnpm lint:commits',
    ]);
  });

  it('turns colour off and vitest quiet', () => {
    expect(QUIET_ENV).toEqual({ NO_COLOR: '1', FORCE_COLOR: '0', CREW_QUIET: '1' });
  });
});
