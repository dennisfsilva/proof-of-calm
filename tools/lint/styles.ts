// The styling lint of docs/DESIGN.md §10: outside packages/ui/src/styles there are no hex colours, no
// px font sizes and no font-family declarations, and nothing removes the focus outline (§6). Biome's
// noHexColors covers CSS only; this also reads TS, TSX and MDX, inline styles, SVG attributes and
// Tailwind arbitrary values. A line may opt out with `styles-lint-ignore: <reason>` on the line above.
//
// Usage: node tools/lint/styles.ts   (from the repository root; exits 1 on a finding)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Rule = { id: string; pattern: RegExp; message: string };

export const RULES: readonly Rule[] = [
  {
    id: 'hex-colour',
    // `&#123;` is an HTML entity and `#main` an anchor, not colours.
    pattern: /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i,
    message: 'a hex colour: use a colour token from packages/ui/src/styles/tokens.css',
  },
  {
    id: 'px-font-size',
    pattern: /font-size\s*:\s*[\d.]+px|fontSize\s*[:=]\s*[{'"]*\s*[\d.]+(?:px)?\b|\btext-\[(?:length:)?[\d.]+px\]/i,
    message: 'a px font size: use a type token (text-12 to text-40)',
  },
  {
    id: 'font-family',
    pattern: /font-family\s*[:=]|fontFamily\s*[:=]|\bfont-\[(?:family-name:)?['"a-z]/i,
    message: 'a font-family declaration: the families are set once, in packages/ui/src/styles',
  },
  {
    id: 'outline-none',
    pattern: /\boutline-none\b|\boutline\s*:\s*(?:none|0)\b/i,
    message: 'the focus outline removed: the global :focus-visible ring is never turned off (docs/DESIGN.md §6)',
  },
];

export type Finding = { file: string; line: number; rule: string; message: string; text: string };

const IGNORE = /styles-lint-ignore:\s*\S/;

export function lintText(file: string, text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  lines.forEach((content, index) => {
    if (index > 0 && IGNORE.test(lines[index - 1] ?? '')) return;
    for (const rule of RULES) {
      if (rule.pattern.test(content)) {
        findings.push({ file, line: index + 1, rule: rule.id, message: rule.message, text: content.trim() });
      }
    }
  });
  return findings;
}

const SCANNED = /\.(tsx?|css|mdx)$/;
const ROOTS = ['apps', 'packages/app/src', 'packages/ui/src', 'packages/content'];
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
  'e2e',
  join('packages', 'ui', 'src', 'styles'),
];

/** The files the lint reads: product source, without tests, build output or the token stylesheets. */
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
      const relativePath = relative(root, path);
      if (SKIPPED.some((skip) => relativePath === skip || relativePath.split(sep).includes(skip))) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (SCANNED.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(path);
    }
  };
  for (const start of ROOTS) walk(join(root, start));
  return files;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = process.cwd();
  const findings = filesToLint(root).flatMap((file) => lintText(relative(root, file), readFileSync(file, 'utf8')));
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}  ${finding.rule}: ${finding.message}\n    ${finding.text}`);
  }
  if (findings.length > 0) {
    console.error(`\n${findings.length} styling finding(s); tokens only (docs/DESIGN.md §10).`);
    process.exit(1);
  }
  console.log('Styles lint: tokens only.');
}
