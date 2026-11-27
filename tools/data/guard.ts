// The private store never lives in this repository (ADR-0036, Reading of 2026-11-27), however its
// path is written. Strings cannot settle that: realpath leaves a loopback UNC path into the repository
// (`\\localhost\P$\…`, `\\?\UNC\127.0.0.1\P$\…`) as it is. So this compares identities: the store's
// nearest existing folder, as written and with every link followed, and each of their ancestors, against
// the repository root's device and inode. Anything it cannot settle is refused too.
import { realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

function inside(store: string, root: string): boolean {
  const repository = identity(root);
  // The nearest existing ancestor stands for a store whose last parts do not exist yet.
  const written = chain(resolve(store)).find((path) => identity(path) !== undefined);
  if (repository === undefined || written === undefined) return true;
  const candidates = [...chain(written), ...chain(realpathSync.native(written))];
  return candidates.some((path) => identity(path) === repository);
}

/** Throws when `store`, or any folder it would be created in, is this repository or inside it. */
export function refuseInsideRepository(store: string, root: string = REPOSITORY): void {
  let refused: boolean;
  try {
    refused = inside(store, root);
  } catch {
    refused = true;
  }
  if (refused) throw new Error('--store is inside this repository');
}
