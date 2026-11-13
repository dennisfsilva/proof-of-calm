// What lint/copy-paths.test.ts reads among the tracked files, in one place: turbo/inputs.test.ts derives
// its probes from the same constant, so a scan widened without tools/turbo.json's inputs fails there
// (docs/BUILD-PROMPT.md: a test that scans by a name pattern gets inputs that hash its whole scan).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const copyPathScan = {
  /**
   * The prefixes the scan reads under: what the copy roles own and tools/turbo.json hashes. Outside
   * them on purpose: `apps/web/e2e/tax-year.spec.ts` asserts the export's copy and writes none, and
   * `docs/` has its own copy paths.
   */
  roots: ['packages/'],
  /** A path under a root that holds one of these names belongs to the export. */
  names: ['tax-year'],
  /** Folders under a root whose every file the scan reads, whatever its name. */
  folders: [
    'packages/core/src/export/',
    'packages/app/src/features/settings/fixtures/',
    'packages/core/test/tax-year/',
  ],
} as const;

/** Whether lint/copy-paths.test.ts reads a path, relative to the repository root. */
export function isScanned(file: string): boolean {
  const { roots, names, folders } = copyPathScan;
  return (
    roots.some((root) => file.startsWith(root)) &&
    (names.some((name) => file.includes(name)) || folders.some((folder) => file.startsWith(folder)))
  );
}

/** The repository's tracked files, relative to its root. */
export function trackedFiles(): string[] {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file !== '');
}
