import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { gitDecoy } from './git-decoy.ts';
import { GIT_FREE_ENV } from './git-env.ts';

it('catches a git that inherits the decoy and passes one that runs on GIT_FREE_ENV with its cwd', () => {
  const decoy = gitDecoy();
  const repo = mkdtempSync(join(tmpdir(), 'git-decoy-repo-'));
  const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];
  // The stray run skips init: a `git init` under a GIT_DIR from elsewhere marks that repository bare.
  const commit = (env?: NodeJS.ProcessEnv) => {
    const git = (...args: string[]) => execFileSync('git', [...identity, ...args], { cwd: repo, env, stdio: 'pipe' });
    if (env !== undefined) git('init', '--quiet');
    git('add', 'a.txt');
    git('commit', '--quiet', '--message', 'a');
  };
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  const before = process.env.GIT_DIR;
  decoy.set();
  try {
    expect(process.env.GIT_DIR).toBe(join(decoy.dir, '.git'));
    commit(GIT_FREE_ENV);
    expect(decoy.left()).toEqual({ refs: '', index: '' });
    commit();
    expect(decoy.left()).toEqual({
      refs: expect.stringContaining('refs/heads/'),
      index: expect.stringContaining('a.txt'),
    });
  } finally {
    decoy.restore();
    decoy.remove();
    rmSync(repo, { recursive: true, force: true });
  }
  expect(process.env.GIT_DIR).toBe(before);
}, 60_000);
