// The private store never lives in this repository (ADR-0036, Reading of 2026-11-27), however its
// path is written and whichever checkout the script runs from: a store inside any working tree of the
// repository could be staged by a later `git add` there. Strings cannot settle that: realpath leaves a
// loopback UNC path into the repository (`\\localhost\P$\…`, `\\?\UNC\127.0.0.1\P$\…`) as it is. So this
// compares identities: the store's nearest existing folder, as written and with every link followed,
// and each of their ancestors, against the device and inode of every root of the repository. The roots
// come from git's own records, read as files so that no child process runs: the checkout, the common
// git folder, the main working tree and each linked worktree. Anything it cannot settle is refused too.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../..', import.meta.url));

const identity = (path: string): string | undefined => {
  const stats = statSync(path, { bigint: true, throwIfNoEntry: false });
  return stats === undefined ? undefined : `${stats.dev}:${stats.ino}`;
};

// The path and its ancestors, from the path up to its root (dirname climbs a UNC path to its share).
function chain(path: string): string[] {
  const paths = [path];
  for (let parent = dirname(path); parent !== paths.at(-1); parent = dirname(parent)) paths.push(parent);
  return paths;
}

// A one-line record git writes (`.git` in a linked worktree, `commondir`, `gitdir`), as an absolute path:
// a relative one is relative to the record's folder. Undefined when the record does not exist.
function record(file: string, prefix = ''): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    throw error;
  }
  const line = text.trim();
  if (!line.startsWith(prefix) || line.length === prefix.length) throw new Error(`unreadable ${file}`);
  return resolve(dirname(file), line.slice(prefix.length).trim());
}

// Every folder of the repository that `root` is a working tree of (git-worktree(1), DETAILS). Throws
// when the checkout's own records cannot be read.
function roots(root: string): string[] {
  const dotGit = join(root, '.git');
  const stats = statSync(dotGit);
  const gitDir = stats.isDirectory() ? dotGit : record(dotGit, 'gitdir:');
  if (gitDir === undefined) throw new Error(`no ${dotGit}`);
  const common = record(join(gitDir, 'commondir')) ?? gitDir;
  // Git's own rule for the main working tree: the common folder without its `/.git`; a bare
  // repository, or a git folder kept apart from its tree, lists the common folder itself.
  const main = basename(common) === '.git' ? dirname(common) : common;
  // Each linked worktree's `gitdir` names its `.git` file; a record without one is git's to prune.
  const worktrees = entries(join(common, 'worktrees'))
    .map((name) => record(join(common, 'worktrees', name, 'gitdir')))
    .flatMap((file) => (file === undefined ? [] : [dirname(file)]));
  return [root, common, main, ...worktrees];
}

// The names in a folder, none when it does not exist (a repository that never had a linked worktree).
function entries(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function inside(store: string, root: string): boolean {
  // A listed worktree whose folder is gone has no identity, and nothing can be inside it.
  const repository = new Set(roots(root).flatMap((path) => identity(path) ?? []));
  // The nearest existing ancestor stands for a store whose last parts do not exist yet.
  const written = chain(resolve(store)).find((path) => identity(path) !== undefined);
  if (identity(root) === undefined || written === undefined) return true;
  const candidates = [...chain(written), ...chain(realpathSync.native(written))];
  return candidates.some((path) => {
    const id = identity(path);
    return id !== undefined && repository.has(id);
  });
}

/** Throws when `store`, or any folder it would be created in, is inside a working tree of this repository. */
export function refuseInsideRepository(store: string, root: string = REPOSITORY): void {
  let refused: boolean;
  try {
    refused = inside(store, root);
  } catch {
    refused = true;
  }
  if (refused) throw new Error('--store is inside this repository');
}
