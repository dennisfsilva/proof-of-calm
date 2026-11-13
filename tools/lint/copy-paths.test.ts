// The content roles (counsel, brand) review a branch only when a changed file matches a glob of
// `.claude/crew.json`'s `roles.copyPaths` (`**/` matches any depth). The tax-year export writes copy a
// person reads in its headers, columns and cells, so its code, fixtures and expected files are copy
// paths: the list is derived from every file that writes the copy, never from where it is first seen
// (docs/BUILD-PROMPT.md). This test reads the tracked files, so a new export file named `tax-year-*`
// outside the globs fails it.
//
// Left out on purpose: `apps/web/e2e/tax-year.spec.ts` asserts the export's copy and writes none, and
// `docs/` has its own copy paths. Both prefixes are skipped below.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const crew = JSON.parse(readFileSync(new URL('../../.claude/crew.json', import.meta.url), 'utf8')) as {
  roles?: { copyPaths?: string[] };
};
const copyPaths = crew.roles?.copyPaths ?? [];
const isCopyPath = (file: string) => copyPaths.some((glob) => posix.matchesGlob(file, glob));

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((file) => file !== '');

/** The tax-year export's files: the core's export module and every path naming the tax year. */
const exportFiles = tracked.filter(
  (file) =>
    file.startsWith('packages/core/src/export/') ||
    (file.includes('tax-year') && !file.startsWith('apps/web/e2e/') && !file.startsWith('docs/')),
);

const fixtureFolders = ['packages/app/src/features/settings/fixtures/', 'packages/core/test/tax-year/'];
const fixtures = tracked.filter((file) => file.endsWith('.csv') && fixtureFolders.some((dir) => file.startsWith(dir)));

describe('.claude/crew.json roles.copyPaths', () => {
  it('finds the export files and their fixtures among the tracked files', () => {
    expect(exportFiles.length).toBeGreaterThan(0);
    expect(fixtures.map((file) => posix.dirname(file) + '/')).toEqual(expect.arrayContaining(fixtureFolders));
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
    expect(tracked).toContain(file);
    expect(isCopyPath(file), `${file} matches no copyPaths glob`).toBe(true);
  });
});
