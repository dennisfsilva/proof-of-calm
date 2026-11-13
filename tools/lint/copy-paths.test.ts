// The content roles (counsel, brand) review a branch only when a changed file matches a glob of
// `.claude/crew.json`'s `roles.copyPaths` (`**/` matches any depth). The tax-year export writes copy a
// person reads in its headers, columns and cells, so its code, fixtures and expected files are copy
// paths: the list is derived from every file that writes the copy, never from where it is first seen
// (docs/BUILD-PROMPT.md). This test reads the tracked files that `copy-paths-scan.ts` names, so a new
// export file named `tax-year-*` outside the globs fails it.
//
// Left out on purpose: `apps/web/e2e/tax-year.spec.ts` asserts the export's copy and writes none, and
// `docs/` has its own copy paths. The scan's constant leaves both out.
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyPathScan, isScanned, trackedFiles } from './copy-paths-scan.ts';

const crew = JSON.parse(readFileSync(new URL('../../.claude/crew.json', import.meta.url), 'utf8')) as {
  roles?: { copyPaths?: string[] };
};
const copyPaths = crew.roles?.copyPaths ?? [];
const isCopyPath = (file: string) => copyPaths.some((glob) => posix.matchesGlob(file, glob));

/** The tax-year export's files: the scan's folders and every path naming the tax year. */
const exportFiles = trackedFiles().filter(isScanned);

const fixtureFolders = ['packages/app/src/features/settings/fixtures/', 'packages/core/test/tax-year/'];
const fixtures = exportFiles.filter(
  (file) => file.endsWith('.csv') && fixtureFolders.some((dir) => file.startsWith(dir)),
);

describe('.claude/crew.json roles.copyPaths', () => {
  it('finds the export files and their fixtures among the tracked files', () => {
    expect(exportFiles.length).toBeGreaterThan(0);
    expect(copyPathScan.folders).toEqual(expect.arrayContaining(fixtureFolders));
    expect(fixtures.map((file) => `${posix.dirname(file)}/`)).toEqual(expect.arrayContaining(fixtureFolders));
  });

  it.each(exportFiles)('%s is a copy path', (file) => {
    expect(isCopyPath(file), `${file} matches no copyPaths glob`).toBe(true);
  });

  it.each([
    ...fixtures,
    'packages/app/src/features/settings/tax-year.ts',
    'packages/app/src/features/settings/components/tax-year-export.tsx',
    'packages/core/src/export/tax-year.ts',
  ])('names %s', (file) => {
    expect(exportFiles).toContain(file);
    expect(isCopyPath(file), `${file} matches no copyPaths glob`).toBe(true);
  });
});
