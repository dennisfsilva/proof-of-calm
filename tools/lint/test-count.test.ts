import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { count, countTests } from './test-count.ts';

describe('countTests', () => {
  it('counts it, test and their modifiers, not stories or helpers', () => {
    const text = [
      "it('a', () => {});",
      "test('b', () => {});",
      "it.each([1])('c %s', () => {});",
      "test.skip('d', () => {});",
      'const play = async () => {};',
      'expect(unit(1)).toBe(2);',
    ].join('\n');
    expect(countTests(text)).toBe(4);
  });

  it('does not count a method or a longer name', () => {
    expect(countTests('/x/.test(s)')).toBe(0);
    expect(countTests('TEST_FILE.test(entry); unit(1); $it(2); limit(3)')).toBe(0);
  });
});

describe('count', () => {
  it('reads test and spec files under apps, packages and tools, skipping dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'test-count-'));
    const files: Record<string, string> = {
      'packages/core/src/a.test.ts': "it('x', () => {});\nit('y', () => {});",
      'apps/web/e2e/today.spec.ts': "test('z', () => {});",
      'tools/lint/b.test.ts': '',
      'tools/lint/b.ts': "it('not a test file', () => {});",
      'packages/ui/node_modules/dep/c.test.ts': "it('skipped', () => {});",
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    expect(count(root)).toEqual({ files: 3, tests: 3 });
  });
});
