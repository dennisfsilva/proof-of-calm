import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesToLint, lintText } from './styles.ts';

const rules = (text: string) => lintText('file.tsx', text).map((finding) => finding.rule);

describe('lintText', () => {
  it.each([
    ['a CSS hex colour', 'a { color: #1c1a18; }'],
    ['a short hex colour', "const c = '#fff';"],
    ['a hex colour with alpha', 'fill="#1c1a1880"'],
    ['a Tailwind arbitrary hex', '<p className="bg-[#f7f4ef]" />'],
  ])('flags %s', (_, text) => {
    expect(rules(text)).toEqual(['hex-colour']);
  });

  it.each([
    ['an anchor', '<a href="#main">'],
    ['an HTML entity', 'Tom &#123; Jerry'],
    ['a fragment word', "router.push('/log#added')"],
  ])('leaves %s alone', (_, text) => {
    expect(rules(text)).toEqual([]);
  });

  it.each([
    ['a CSS px size', 'p { font-size: 13px; }'],
    ['a React style number', 'style={{ fontSize: 12 }}'],
    ['a React style string', "style={{ fontSize: '12px' }}"],
    ['an SVG attribute', '<text fontSize="12">'],
    ['a Tailwind arbitrary size', '<p className="text-[13px]" />'],
  ])('flags %s', (_, text) => {
    expect(rules(text)).toEqual(['px-font-size']);
  });

  it('accepts the type tokens', () => {
    expect(rules('<p className="text-13 text-ink-2" />')).toEqual([]);
  });

  it.each([
    ['a CSS family', 'body { font-family: Inter, sans-serif; }'],
    ['a React style family', "style={{ fontFamily: 'Inter' }}"],
    ['a Tailwind arbitrary family', `<p className="font-['Inter']" />`],
  ])('flags %s', (_, text) => {
    expect(rules(text)).toEqual(['font-family']);
  });

  it('accepts the family utilities', () => {
    expect(rules('<code className="font-mono" />')).toEqual([]);
  });

  it.each([
    ['the Tailwind utility', '<button className="outline-none" />'],
    ['a CSS declaration', 'button:focus { outline: none; }'],
    ['a zero outline', 'button:focus { outline: 0 }'],
  ])('flags removing the focus outline with %s', (_, text) => {
    expect(rules(text)).toEqual(['outline-none']);
  });

  it('honours an explained opt-out on the line above, and only that line', () => {
    const text =
      "// styles-lint-ignore: the manifest needs literal colours\nconst theme = '#f7f4ef';\nconst x = '#fff';";
    expect(lintText('manifest.ts', text).map((finding) => finding.line)).toEqual([3]);
    expect(rules("// styles-lint-ignore:\nconst theme = '#f7f4ef';")).toEqual(['hex-colour']);
  });
});

describe('filesToLint', () => {
  it('reads product source and skips tests, e2e, build output and the token stylesheets', () => {
    const root = mkdtempSync(join(tmpdir(), 'styles-lint-'));
    const files = [
      'apps/web/app/page.tsx',
      'apps/web/e2e/today.spec.ts',
      'apps/web/.next/server/page.js',
      'apps/web/lib/x.test.ts',
      'packages/app/src/features/today/today.tsx',
      'packages/ui/src/components/button.tsx',
      'packages/ui/src/styles/tokens.css',
      'packages/ui/src/fonts/README.md',
    ];
    for (const file of files) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), '');
    }
    const found = filesToLint(root)
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();
    expect(found).toEqual([
      'apps/web/app/page.tsx',
      'packages/app/src/features/today/today.tsx',
      'packages/ui/src/components/button.tsx',
    ]);
  });
});
