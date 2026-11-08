import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countLines, filesToLint, isAllowed, lintSizes } from './size.ts';

const lines = (count: number, header = '') => `${header}${'const x = 1;\n'.repeat(count)}`;

describe('countLines', () => {
  it('counts as wc -l does', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('isAllowed', () => {
  it('needs the marker with a reason within the first 10 lines', () => {
    expect(isAllowed('// size-lint-allow: one server, one file\n')).toBe(true);
    expect(isAllowed('// size-lint-allow:\n')).toBe(false);
    expect(isAllowed(`${'//\n'.repeat(10)}// size-lint-allow: too late\n`)).toBe(false);
  });
});

describe('filesToLint and lintSizes', () => {
  it('reads source, skips tests, stories, specs, generated and dependency files', () => {
    const root = mkdtempSync(join(tmpdir(), 'size-lint-'));
    const files: Record<string, string> = {
      'packages/core/src/big.ts': lines(401),
      'packages/core/src/fine.ts': lines(400),
      'packages/core/src/allowed.ts': lines(500, '// size-lint-allow: the format in one place\n'),
      'packages/core/src/big.test.ts': lines(600),
      'packages/ui/src/components/big.stories.tsx': lines(600),
      'apps/web/e2e/big.spec.ts': lines(600),
      'apps/web/next-env.d.ts': lines(600),
      'apps/web/node_modules/dep/index.js': lines(600),
      'tools/serve/server.mjs': lines(402),
      'apps/web/.next/types/routes.ts': lines(600),
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    const found = filesToLint(root)
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();
    expect(found).toEqual([
      'packages/core/src/allowed.ts',
      'packages/core/src/big.ts',
      'packages/core/src/fine.ts',
      'tools/serve/server.mjs',
    ]);
    expect(lintSizes(root)).toEqual([
      { file: 'packages/core/src/big.ts', lines: 401 },
      { file: 'tools/serve/server.mjs', lines: 402 },
    ]);
  });
});
