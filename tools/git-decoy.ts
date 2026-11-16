// Test-only: a decoy repository whose GIT_DIR and GIT_INDEX_FILE a suite that runs the real git puts into
// process.env for its run, as a git hook would (./git-env.ts). A git that ignores GIT_FREE_ENV or its cwd
// reads or writes the decoy instead of the repository it meant; the suite's last hook fails when the decoy
// gained a ref or an index entry. Each test file runs in its own worker (vitest's isolation), and the hook
// restores the two variables, so the setting stays inside the file that asks for it.
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
      expect(decoy.left(), 'a git in this file ignored GIT_FREE_ENV or its cwd').toEqual({ refs: '', index: '' });
    } finally {
      decoy.remove();
    }
  });
}
