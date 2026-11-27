// The store workflow's commit step (closes-store.yml) run as the runner runs it, with bash and git in a scratch
// folder: a bare repository stands for the private store, the job's checkout is made the way actions/checkout
// makes it (fetch depth 1, the branch tracking origin's), and another clone pushes between that checkout and
// the commit, as a backfill or the same-day copy of a changed workflow does (backfill.md, Run it).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GIT_FREE_ENV } from '../git-env.ts';

const template = readFileSync(new URL('./closes-store.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
// The step's script, with no wait between tries so the test takes no time to wait.
const script = (() => {
  const body = /- name: Commit the closes\n(?: {8}.*\n)*? {8}run: \|\n((?: {10}.*\n)+)/.exec(template)?.[1];
  if (body === undefined) throw new Error('closes-store.yml has no commit step');
  return body.replaceAll(/^ {10}/gm, '').replaceAll(/^( *)sleep \d+$/gm, '$1sleep 0');
})();

// GitHub's bash for a run step; Git for Windows carries the bash of a Windows machine.
const bash =
  process.platform === 'win32'
    ? join(
        dirname(dirname(dirname(execFileSync('git', ['--exec-path'], { env: GIT_FREE_ENV, encoding: 'utf8' }).trim()))),
        'bin',
        'bash.exe',
      )
    : 'bash';

let scratch: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'closes-commit-'));
  // No system or user configuration reaches these repositories: the runner has none of this machine's.
  writeFileSync(join(scratch, 'gitconfig'), '');
  env = { ...GIT_FREE_ENV, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(scratch, 'gitconfig') };
});
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const put = (dir: string, path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const commit = (dir: string, subject: string) => {
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '--message', subject);
};

// The store with one seeded file, a full clone that pushes meanwhile, and the job's depth-1 checkout.
function repositories() {
  const bare = join(scratch, 'store.git');
  git(scratch, 'init', '--quiet', '--bare', '--initial-branch=main', bare);
  const url = pathToFileURL(bare).href;
  const other = join(scratch, 'other');
  git(scratch, 'init', '--quiet', '--initial-branch=main', other);
  put(other, 'closes/kraken/BTC-EUR.csv', 'date,close\n2026-11-25,1.5\n');
  commit(other, 'seed');
  git(other, 'remote', 'add', 'origin', url);
  git(other, 'push', '--quiet', '--set-upstream', 'origin', 'main');
  put(other, 'closes/kraken/ETH-EUR.csv', 'date,close\n2026-11-25,2.5\n');
  commit(other, 'backfill');
  const job = join(scratch, 'job');
  git(scratch, 'init', '--quiet', job);
  git(job, 'remote', 'add', 'origin', url);
  git(job, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', '+refs/heads/main:refs/remotes/origin/main');
  git(job, 'checkout', '--quiet', '--force', '-B', 'main', 'refs/remotes/origin/main');
  expect(git(job, 'rev-parse', '--is-shallow-repository')).toBe('true');
  return { bare, other, job };
}

const step = (job: string) =>
  spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd: job, env, encoding: 'utf8' });
const subjects = (bare: string) => git(bare, 'log', '--format=%s', 'main').split('\n');
const day = (exchange: string) => expect.stringMatching(new RegExp(`^data: ${exchange} closes of \\d{4}-\\d{2}-\\d{2}$`));
const rebasing = (job: string) =>
  existsSync(join(job, '.git', 'rebase-merge')) || existsSync(join(job, '.git', 'rebase-apply'));
// Every file the store's main holds, none of them carrying a conflict marker.
const markers = (bare: string) =>
  git(bare, 'ls-tree', '-r', '--name-only', 'main')
    .split('\n')
    .filter((path) => /^(<{7}|={7}|>{7})/m.test(git(bare, 'show', `main:${path}`)));

describe('the commit step', { timeout: 30_000 }, () => {
  it('pulls a push that came after the checkout and pushes each exchange’s day on top of it', () => {
    const { bare, other, job } = repositories();
    put(job, 'closes/bitstamp/BTC-EUR.csv', 'date,close\n2026-11-26,1.5\n');
    put(job, 'closes/kraken/BTC-EUR.csv', 'date,close\n2026-11-25,1.5\n2026-11-26,1.5\n');
    git(other, 'push', '--quiet');
    const result = step(job);
    expect(result.status).toBe(0);
    expect(subjects(bare)).toEqual([day('kraken'), day('bitstamp'), 'backfill', 'seed']);
    expect(git(bare, 'show', 'main:closes/bitstamp/BTC-EUR.csv')).toBe('date,close\n2026-11-26,1.5');
    expect(git(bare, 'show', 'main:closes/kraken/BTC-EUR.csv')).toBe('date,close\n2026-11-25,1.5\n2026-11-26,1.5');
    expect(git(bare, 'show', 'main:closes/kraken/ETH-EUR.csv')).toBe('date,close\n2026-11-25,2.5');
  });

  it('drops a Kraken day that conflicts, pushes Bitstamp’s and fails so the run is red', () => {
    const { bare, other, job } = repositories();
    put(job, 'closes/bitstamp/BTC-EUR.csv', 'date,close\n2026-11-26,1.5\n');
    put(job, 'closes/kraken/BTC-EUR.csv', 'date,close\n2026-11-25,1.5\n2026-11-26,1.5\n');
    put(other, 'closes/kraken/BTC-EUR.csv', 'date,close\n2026-11-25,1.5\n2026-11-26,9.5\n');
    commit(other, 'backfill again');
    git(other, 'push', '--quiet');
    const result = step(job);
    expect(result.status).toBe(1);
    expect(subjects(bare)).toEqual([day('bitstamp'), 'backfill again', 'backfill', 'seed']);
    expect(git(bare, 'show', 'main:closes/bitstamp/BTC-EUR.csv')).toBe('date,close\n2026-11-26,1.5');
    expect(git(bare, 'show', 'main:closes/kraken/BTC-EUR.csv')).toBe('date,close\n2026-11-25,1.5\n2026-11-26,9.5');
    expect(markers(bare)).toEqual([]);
    expect(rebasing(job)).toBe(false);
  });

  it('aborts a rebase that conflicts on a Bitstamp file and fails, leaving the store as the other push left it', () => {
    const { bare, other, job } = repositories();
    put(job, 'closes/bitstamp/BTC-EUR.csv', 'date,close\n2026-11-26,1.5\n');
    put(job, 'closes/kraken/BTC-EUR.csv', 'date,close\n2026-11-25,1.5\n2026-11-26,1.5\n');
    put(other, 'closes/bitstamp/BTC-EUR.csv', 'date,close\n2026-11-26,9.5\n');
    commit(other, 'backfill again');
    git(other, 'push', '--quiet');
    const result = step(job);
    expect(result.status).not.toBe(0);
    expect(subjects(bare)).toEqual(['backfill again', 'backfill', 'seed']);
    expect(git(bare, 'show', 'main:closes/bitstamp/BTC-EUR.csv')).toBe('date,close\n2026-11-26,9.5');
    expect(markers(bare)).toEqual([]);
    expect(rebasing(job)).toBe(false);
  });

  it('fails after its last try while every push is refused', () => {
    const { bare, job } = repositories();
    writeFileSync(join(bare, 'hooks', 'pre-receive'), '#!/bin/sh\necho try >> tries\nexit 1\n', { mode: 0o755 });
    put(job, 'closes/bitstamp/BTC-EUR.csv', 'date,close\n2026-11-26,1.5\n');
    const result = step(job);
    expect(result.status).not.toBe(0);
    // The first push and three retries, each after a pull with rebase.
    expect(readFileSync(join(bare, 'tries'), 'utf8')).toBe('try\n'.repeat(4));
    expect(subjects(bare)).toEqual(['seed']);
  });
});
