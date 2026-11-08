import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commandProblem,
  type Finding,
  type Git,
  inlineTokens,
  isPathToken,
  lintDocs,
  pathIndex,
  proseLines,
  resolvesPath,
  summary,
} from './docs.ts';
import { fixedPart, lintAdrEdits, tableCells } from './docs-adr.ts';

const specifiers = new Set(['react', '@base-ui/react', '@x/app']);

describe('isPathToken', () => {
  it.each([
    ['a path with a slash', 'packages/core/src/index.ts'],
    ['a bare file name', 'tokens.css'],
    ['a folder', 'docs/research/'],
    ['a workflow file', 'ci.yml'],
  ])('treats %s as a path', (_, token) => {
    expect(isPathToken(token, { specifiers })).toBe(true);
  });

  it.each([
    ['a URL', 'https://vercel.com/docs'],
    ['a route', '/today'],
    ['a git range', 'origin/main..HEAD'],
    ['a remote ref', 'origin/main'],
    ['a placeholder', 'packages/<name>/src'],
    ['a glob', 'src/**/*.test.ts'],
    ['a suffix pattern', '*.stories.tsx'],
    ['a single-character glob', 'lib/adapters/idb?.ts'],
    ['an ADR template name', 'docs/ADR/NNNN-title.md'],
    ['a dated file name', 'backup-YYYY-MM-DD.json'],
    ['a dependency', 'react/compiler-runtime'],
    ['a scoped dependency', '@base-ui/react/field'],
    ['a scoped package not installed yet', '@capacitor/preferences'],
    ['a workspace package', '@x/app'],
    ['a time zone', 'Europe/Lisbon'],
    ['a date', '16/10/2026'],
    ['a flag', '--filter=@x/app'],
    ['a command', 'pnpm --filter @x/app test'],
    ['a home path', '~/.claude/CLAUDE.md'],
    ['a word', 'turbo'],
    ['an allow-listed path', 'apps/web/.env.local'],
  ])('leaves %s alone', (_, token) => {
    expect(isPathToken(token, { specifiers })).toBe(false);
  });
});

describe('inlineTokens and proseLines', () => {
  it('reads single-backtick spans', () => {
    expect(inlineTokens('run `pnpm test` then open `docs/README.md`')).toEqual(['pnpm test', 'docs/README.md']);
  });

  it('skips fenced code', () => {
    const text = 'a\n```\n`not/this.ts`\n```\nb';
    expect(proseLines(text).map((line) => `${line.line}:${line.content}`)).toEqual(['1:a', '5:b']);
  });
});

describe('fixedPart', () => {
  it('ignores the Status line and everything from the first history heading', () => {
    const before = '# ADR-0001: A\n\nStatus: Accepted · Date: 2026-10-16\n\n## Context\nx\n';
    const after = `${before.replace('Accepted', 'Accepted; amended by ADR-0002')}\n## Corrections recorded on 2026-10-18\n\ny\n`;
    expect(fixedPart(after)).toBe(fixedPart(before));
    expect(fixedPart(before.replace('x', 'z'))).not.toBe(fixedPart(before));
  });
});

describe('lintAdrEdits', () => {
  const onMain = (status: string) => `# ADR-0007: G\n\nStatus: ${status} · Date: 2026-10-16\n\n## Context\n\nx\n`;
  const edits = (previous: string, current: string) => {
    const findings: Finding[] = [];
    const main: Git = () => previous;
    lintAdrEdits('docs/ADR/0007-g.md', current, main, findings);
    return findings.map((finding) => finding.check);
  };

  it('reads the Status word from origin/main, so a branch cannot free the text by changing it', () => {
    const current = onMain('Superseded by ADR-0008').replace('x', 'edited above the heading');
    expect(edits(onMain('Accepted'), current)).toEqual(['adr-edit']);
  });

  it('leaves a proposed ADR free to change while the branch accepts it', () => {
    expect(edits(onMain('Proposed'), onMain('Accepted').replace('x', 'z'))).toEqual([]);
  });
});

describe('tableCells', () => {
  it('splits a row and skips the rule and prose', () => {
    expect(tableCells('| 0001 | A `b|c` | Accepted | core |')).toEqual(['0001', 'A `b', 'c`', 'Accepted', 'core']);
    expect(tableCells('|---|---|:--:|')).toBeNull();
    expect(tableCells('text | with a bar')).toBeNull();
  });
});

describe('resolvesPath', () => {
  const paths = new Set(['packages/app/src/features', 'apps/web/src/lib/a.ts', 'tools/lint']);

  it('tries the token with src/ after the package or app folder', () => {
    expect(resolvesPath('packages/app/features', paths)).toBe(true);
    expect(resolvesPath('apps/web/lib/a.ts', paths)).toBe(true);
    expect(resolvesPath('tools/lint/', paths)).toBe(true);
    expect(resolvesPath('packages/app/lib', paths)).toBe(false);
    expect(resolvesPath('tools/src/lint', paths)).toBe(false);
  });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'docs-lint-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const ADR_1 = '# ADR-0001: A\n\nStatus: Accepted · Date: 2026-10-16\n\n## Context\n\nx\n';
const ADR_2 = '# ADR-0002: B\n\nStatus: Accepted · Date: 2026-10-16\n\n## Context\n\ny\n';

const fixture = {
  'package.json': JSON.stringify({ name: 'root', scripts: { lint: '', test: '' }, devDependencies: { react: '1' } }),
  'pnpm-workspace.yaml': 'catalog:\n  zod: 4.0.0\n',
  'packages/app/package.json': JSON.stringify({ name: '@x/app', scripts: { test: '' } }),
  'packages/app/src/lib/navigation/index.ts': '',
  'apps/web/lighthouserc.json': '{}',
  '.github/workflows/ci.yml': '',
  'tools/lint/docs.ts': '',
  'README.md': 'Status (2026-10-19): M1 in progress.\n\nSee `docs/ROADMAP.md`.\n',
  'CLAUDE.md': [
    'Run `pnpm test` and `pnpm --filter @x/app test`, never `pnpm --filter @x/app build` or `pnpm deploy:prod`.',
    'Routes in `lib/navigation`; the adapter `lib/adapters/api-client` (planned: M2).',
    'The sync adapter `lib/adapters/sync.ts` (planned: M0) and the store `lib/store/missing.ts`.',
    'Run `node tools/lint/docs.ts` and `node tools/lint/gone.ts`; dispatch `gh workflow run ci.yml`.',
    'The budget is 163,840 bytes of script; branch names at most 34 characters.',
    'The export will move to `lib/export` soon.',
    '```',
    'echo `not/checked.ts`',
    '```',
    'ADR-0001 and ADR-0009 decide this; `zod` and `react` are dependencies.',
    'Quoted copy beside a path: "money you will not need for years" sits in `packages/app/src/lib/navigation/index.ts`.',
    'The "Why?" sheet ships later (planned: session 19).',
    '',
  ].join('\n'),
  'docs/README.md': '| Document | What |\n|---|---|\n| `ROADMAP.md` | Milestones |\n',
  'docs/ROADMAP.md': '# Roadmap\n',
  'docs/ENGINEERING.md': 'The budget is 163840 bytes.\n',
  'docs/LOST.md': 'Not in the table.\n',
  'docs/ADR/README.md': [
    '| # | Title | Status | Applies to |',
    '|---|---|---|---|',
    '| 0001 | A | Accepted; amended by 0002 | core |',
    '| 0002 | B | Proposed | app |',
    '| 0003 | C | Accepted | web |',
    '',
  ].join('\n'),
  'docs/ADR/0001-a.md': `${ADR_1}\n## Corrections recorded on 2026-10-18\n\nnew text below the heading\n`,
  'docs/ADR/0002-b.md': ADR_2.replace('y', 'edited above the heading'),
  'docs/ADR/0004-d.md': '# ADR-0004: D\n\nStatus: Accepted\n\nNew on this branch; mentions ADR-0001.\n',
  '.claude/rules/core.md': 'Read `docs/DOMAIN.md` first.\n',
};

const fakeGit: Git = (args) => {
  if (args[0] === 'rev-parse') return 'abc\n';
  const file = String(args[1]).replace('origin/main:', '');
  if (file === 'docs/ADR/0001-a.md') return ADR_1;
  if (file === 'docs/ADR/0002-b.md') return ADR_2;
  throw new Error(`fatal: path '${file}' does not exist in 'origin/main'`);
};

const lines = (findings: Finding[]) => findings.map((finding) => `${finding.file}:${finding.line}:${finding.check}`);

describe('lintDocs', () => {
  const findings = lintDocs(repo(fixture), fakeGit);

  it('reports every check once, sorted by file and line', () => {
    expect(lines(findings)).toEqual([
      '.claude/rules/core.md:1:path',
      'CLAUDE.md:1:command',
      'CLAUDE.md:1:command',
      'CLAUDE.md:3:path',
      'CLAUDE.md:3:path',
      'CLAUDE.md:4:command',
      'CLAUDE.md:5:literal',
      'CLAUDE.md:6:path',
      'CLAUDE.md:6:planned',
      'CLAUDE.md:10:adr',
      'CLAUDE.md:12:planned',
      'docs/ADR/0002-b.md:1:adr-edit',
      'docs/ADR/README.md:1:index',
      'docs/ADR/README.md:4:index',
      'docs/ADR/README.md:5:index',
      'docs/README.md:1:index',
      'docs/README.md:1:index',
    ]);
  });

  it('says what is wrong', () => {
    const messages = findings.map((finding) => finding.message);
    expect(messages).toContain('`pnpm --filter @x/app build`: @x/app has no script "build"');
    expect(messages).toContain('`pnpm deploy:prod`: the root package.json has no script "deploy:prod"');
    expect(messages).toContain('`lib/adapters/sync.ts` does not exist and its planned milestone M0 is done');
    expect(messages).toContain('`lib/store/missing.ts` does not exist and its planned milestone M0 is done');
    expect(messages).toContain('`lib/export` does not exist');
    expect(messages).toContain('`node tools/lint/gone.ts`: tools/lint/gone.ts does not exist');
    expect(messages).toContain('163,?840 is owned by docs/ENGINEERING.md: point there instead');
    expect(messages).toContain('ADR-0009 has no file in docs/ADR');
    expect(messages).toContain(
      'name the milestone: (planned: M<n>); session numbers change when sessions are inserted',
    );
    expect(messages).toContain('status "Proposed" but docs/ADR/0002-b.md says "Accepted"');
    expect(messages).toContain('ADR-0003 is listed but has no file');
    expect(messages).toContain('docs/ADR/0004-d.md is not in the table');
    expect(messages).toContain('the table does not name `LOST.md`');
    expect(messages).toContain('the table does not name `ENGINEERING.md`');
  });

  it('skips the ADR comparison without origin/main', () => {
    const noRemote: Git = () => {
      throw new Error('fatal: Needed a single revision');
    };
    expect(lines(lintDocs(repo(fixture), noRemote))).not.toContain('docs/ADR/0002-b.md:1:adr-edit');
  });

  it('summarises by check', () => {
    expect(summary(findings)).toBe(
      '17 docs finding(s): path 4, command 3, literal 1, planned 2, adr 1, adr-edit 1, index 5',
    );
    expect(summary([])).toBe('0 docs finding(s)');
  });
});

describe('commandProblem', () => {
  const minimal = { root: '/nowhere', scripts: { '': new Set(['test']) }, workflows: new Set(['ci.yml']) };

  it('passes pnpm built-ins, unknown shapes and commands with a placeholder', () => {
    expect(commandProblem('pnpm install --frozen-lockfile', minimal)).toBeNull();
    expect(commandProblem('pnpm --filter @x/web exec playwright install', minimal)).toBeNull();
    expect(commandProblem('git switch main', minimal)).toBeNull();
    expect(commandProblem('gh workflow run <file> --ref <branch>', minimal)).toBeNull();
    expect(commandProblem('pnpm --filter @x/none shadcn add <name> --dry-run', minimal)).toBeNull();
  });

  it('names the missing package or workflow', () => {
    expect(commandProblem('pnpm --filter @x/none test', minimal)).toBe('no workspace package is named @x/none');
    expect(commandProblem('gh workflow run gone.yml --ref x', minimal)).toBe(
      '.github/workflows/gone.yml does not exist',
    );
  });
});

describe('pathIndex', () => {
  it('holds every suffix at a segment boundary and skips dependencies', () => {
    const root = repo({ 'packages/app/src/lib/a.ts': '', 'node_modules/x/b.ts': '' });
    const index = pathIndex(root);
    expect(index.has('packages/app/src/lib/a.ts')).toBe(true);
    expect(index.has('lib/a.ts')).toBe(true);
    expect(index.has('app/src/lib')).toBe(true);
    expect(index.has('b.ts')).toBe(false);
    expect(index.has('ib/a.ts')).toBe(false);
  });
});
