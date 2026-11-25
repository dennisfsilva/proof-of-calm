// daily-rebuild.yml (docs/RELEASE.md, docs/OWNER-SETUP.md §3): the schedule, the permissions, the secret kept
// out of every run line, and the hook step run as the runner runs it (bash), with and without the secret.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { useGitDecoy } from '../git-decoy.ts';
import { GIT_FREE_ENV } from '../git-env.ts';

useGitDecoy();
const here = fileURLToPath(new URL('.', import.meta.url));
const text = readFileSync(new URL('../../.github/workflows/daily-rebuild.yml', import.meta.url), 'utf8').replaceAll(
  '\r\n',
  '\n',
);

describe('daily-rebuild.yml', () => {
  it('runs at 00:17 UTC and by dispatch, never on a pull request', () => {
    expect(text).toMatch(/^on:\n {2}schedule:\n {4}- cron: "17 0 \* \* \*"\n {2}workflow_dispatch:\n\n/m);
    expect(text).not.toContain('pull_request');
  });

  it('grants nothing at the top and contents: read to its one job, which never overlaps another run', () => {
    expect(text).toMatch(/^permissions: \{\}$/m);
    expect(text.match(/permissions:/g)).toHaveLength(2);
    expect(text).toMatch(/^ {4}permissions:\n {6}contents: read\n {4}steps:$/m);
    expect(text).toMatch(/^concurrency:\n {2}group: daily-rebuild\n {2}cancel-in-progress: false$/m);
    expect(text).toMatch(/^ {4}timeout-minutes: 30$/m);
  });

  it('pins every action by its full SHA with the version beside it', () => {
    const uses = text.match(/uses: .*/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/^uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it('reads the hook URL only through a step’s env, never in a run line', () => {
    const references = text.split('\n').filter((line) => line.includes('secrets.'));
    expect(references.length).toBeGreaterThan(0);
    const envLine = `          VERCEL_DEPLOY_HOOK_URL: $\{{ secrets.VERCEL_DEPLOY_HOOK_URL }}`;
    for (const line of references) expect(line).toBe(envLine);
    expect(text).not.toMatch(/^ {4}env:/m);
  });
});

// The hook step's script, run with GitHub's bash for a run step. Git for Windows carries the bash of a Windows
// machine.
const hookStep = (() => {
  const body = /- name: Look for the deploy hook\n(?: {8}.*\n)*? {8}run: \|\n((?: {10}.*\n)+)/.exec(text)?.[1];
  if (body === undefined) throw new Error('daily-rebuild.yml has no deploy hook step');
  return body.replaceAll(/^ {10}/gm, '');
})();
const bash =
  process.platform === 'win32'
    ? join(
        dirname(
          dirname(
            dirname(execFileSync('git', ['--exec-path'], { cwd: here, env: GIT_FREE_ENV, encoding: 'utf8' }).trim()),
          ),
        ),
        'bin',
        'bash.exe',
      )
    : 'bash';
const scratch = mkdtempSync(join(tmpdir(), 'daily-rebuild-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const runHookStep = (hook: string, name: string) => {
  const output = join(scratch, name).replaceAll('\\', '/');
  const result = spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', hookStep], {
    encoding: 'utf8',
    env: { ...process.env, VERCEL_DEPLOY_HOOK_URL: hook, GITHUB_OUTPUT: output },
  });
  return { status: result.status, stdout: result.stdout, written: readFileSync(output, 'utf8') };
};

describe('the deploy hook step', () => {
  it('ends the run with a notice while the secret is absent', () => {
    const { status, stdout, written } = runHookStep('', 'absent');
    expect(status).toBe(0);
    expect(stdout).toMatch(/^::notice::No VERCEL_DEPLOY_HOOK_URL secret/);
    expect(written).toBe('present=false\n');
  });

  it('goes on without printing the URL when the secret is set', () => {
    const hook = 'https://api.vercel.com/v1/integrations/deploy/prj_x/secret-token';
    const { status, stdout, written } = runHookStep(hook, 'present');
    expect(status).toBe(0);
    expect(stdout).not.toContain('secret-token');
    expect(written).toBe('present=true\n');
  });
});
