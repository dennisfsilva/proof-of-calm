// Counts the test files and the `it(` / `test(` cases of the repository, so the pre-PR check can see
// whether a branch removed tests (a drop needs a `Tests removed:` line in the PR body).
//
// Usage: pnpm testCount   (from the repository root; prints `files=<n> tests=<n>`)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['apps', 'packages', 'tools'];
const SKIPPED = [
  'node_modules',
  '.next',
  'dist',
  'out',
  'storybook-static',
  'coverage',
  'playwright-report',
  'test-results',
];
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mjs)$/;
// `it(`, `test(`, `it.each(`, `test.skip(` and so on; stories' play functions are not tests here, nor
// is a method call such as `regex.test(x)`: the name must not follow a dot or an identifier character.
const TEST_CASE = /(?<![.\w$])(?:it|test)(?:\.\w+)*\(/g;

export type Count = { files: number; tests: number };

/** Counts the cases in one file's text. */
export function countTests(text: string): number {
  return text.match(TEST_CASE)?.length ?? 0;
}

/** The test files under the roots, skipping dependencies and build output. */
export function testFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry);
      if (
        relative(root, path)
          .split(sep)
          .some((part) => SKIPPED.includes(part))
      )
        continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (TEST_FILE.test(entry)) files.push(path);
    }
  };
  for (const start of ROOTS) walk(join(root, start));
  return files;
}

export function count(root: string): Count {
  const files = testFiles(root);
  const tests = files.reduce((sum, file) => sum + countTests(readFileSync(file, 'utf8')), 0);
  return { files: files.length, tests };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = count(process.cwd());
  console.log(`files=${result.files} tests=${result.tests}`);
}
