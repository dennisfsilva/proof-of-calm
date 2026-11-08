// The size lint of docs/ENGINEERING.md §1.7: a source file stays under 400 lines, so a reviewer reads
// it whole and a change touches one responsibility. Tests, stories, e2e specs and generated files are
// exempt; any other file opts out with `size-lint-allow: <reason>` in its first 10 lines, a sentence
// that says why the file is one piece.
//
// Usage: node tools/lint/size.ts   (from the repository root; exits 1 on a finding)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 400;
const ROOTS = ['apps', 'packages', 'tools'];
const SKIPPED = [
  'node_modules',
  '.next',
  'dist',
  'server-dist',
  'out',
  'storybook-static',
  'coverage',
  'playwright-report',
  'test-results',
];
const SOURCE = /\.(?:ts|tsx|mjs|cjs|js)$/;
const EXEMPT = /\.(?:test|spec|stories)\.(?:ts|tsx|mjs)$|\.d\.ts$|\.gen\.ts$|\.generated\./;
const ALLOW = /size-lint-allow:\s*\S/;
const HEADER_LINES = 10;

export type Finding = { file: string; lines: number };

/** The line count as `wc -l` gives it: the number of newline-terminated lines, plus an unterminated last one. */
export function countLines(text: string): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

/** Whether the file's header carries an explained opt-out. */
export function isAllowed(text: string): boolean {
  return ALLOW.test(text.split(/\r?\n/).slice(0, HEADER_LINES).join('\n'));
}

/** The files the lint reads: product and tool source, without tests, stories, build output or generated files. */
export function filesToLint(root: string): string[] {
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
      else if (SOURCE.test(entry) && !EXEMPT.test(entry)) files.push(path);
    }
  };
  for (const start of ROOTS) walk(join(root, start));
  return files;
}

export function lintSizes(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of filesToLint(root)) {
    const text = readFileSync(file, 'utf8');
    const lines = countLines(text);
    if (lines > MAX_LINES && !isAllowed(text))
      findings.push({ file: relative(root, file).replaceAll('\\', '/'), lines });
  }
  return findings;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const findings = lintSizes(process.cwd());
  for (const finding of findings) {
    console.error(
      `${finding.file}: ${finding.lines} lines, over ${MAX_LINES}: split it, or add size-lint-allow: <reason> in its header`,
    );
  }
  if (findings.length > 0) {
    console.error(`\n${findings.length} file(s) over ${MAX_LINES} lines (docs/ENGINEERING.md §1.7).`);
    process.exit(1);
  }
  console.log(`Size lint: every source file within ${MAX_LINES} lines.`);
}
