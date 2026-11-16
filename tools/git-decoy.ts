// Test-only: a decoy repository whose GIT_DIR and GIT_INDEX_FILE a suite that runs the real git puts into
// process.env for its run, as a git hook would (./git-env.ts). It catches a git that inherits GIT_DIR or
// GIT_INDEX_FILE (a run whose GIT_FREE_ENV was reverted): that git reads or writes the decoy instead of the
// repository it meant, and the suite's last hook fails when the decoy gained a ref or an index entry. It does
// not catch a git run without its cwd (a cwd reverted): on GIT_FREE_ENV that git runs in the test process's
// folder, inside this same repository, and never reaches the decoy. Each test file runs in its own worker
// (vitest's isolation), and the hook restores the two variables, so the setting stays inside the file that
// asks for it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect } from 'vitest';
import { GIT_FREE_ENV } from './git-env.ts';

const NAMES = ['GIT_DIR', 'GIT_INDEX_FILE'] as const;

/** A fresh decoy repository; `set` aims this process's GIT_DIR and GIT_INDEX_FILE at it, `restore` undoes that. */
export function gitDecoy() {
  const dir = mkdtempSync(join(tmpdir(), 'git-decoy-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: GIT_FREE_ENV, encoding: 'utf8' });
  git('init', '--quiet');
  const saved = NAMES.map((name) => [name, process.env[name]] as const);
  return {
    dir,
    set() {
      process.env.GIT_DIR = join(dir, '.git');
      process.env.GIT_INDEX_FILE = join(dir, '.git', 'index');
    },
    restore() {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
    /** What a stray git left in the decoy: its refs and its index entries, both empty when none reached it. */
    left: () => ({ refs: git('for-each-ref'), index: git('ls-files', '--stage') }),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Sets the decoy now, for the rest of the calling test file, and checks and removes it after the file's tests. */
export function useGitDecoy(): void {
  const decoy = gitDecoy();
  decoy.set();
  afterAll(() => {
    decoy.restore();
    try {
      const message = 'a git in this file inherited GIT_DIR or GIT_INDEX_FILE, not GIT_FREE_ENV';
      expect(decoy.left(), message).toEqual({ refs: '', index: '' });
    } finally {
      decoy.remove();
    }
  });
}
