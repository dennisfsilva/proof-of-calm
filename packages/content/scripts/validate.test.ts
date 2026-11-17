// `pnpm validate:content` itself, run on a copy of every file it reads, so that a test fails when the script stops
// passing the chart's rows to the figure rule (docs/CONTENT-STYLE.md §4, R5 and R6) or stops reading the root it is
// given. packages/content/turbo.json lists the message files outside this package among the test task's inputs.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = fileURLToPath(new URL('validate.ts', import.meta.url));
const CONTENT = ['coins.json', 'sources.allow.json', 'cycles', 'jurisdictions', 'templates', 'facts', 'learn', 'i18n'];
const MODULE = 'packages/content/learn/risk-honestly.mdx';

/** Every path scripts/validate.ts reads, at the same relative paths. */
const readPaths = () => [
  ...CONTENT.map((name) => `packages/content/${name}`),
  ...['features', 'lib'].flatMap((kind) =>
    readdirSync(join(root, 'packages/app/src', kind))
      .map((name) => `packages/app/src/${kind}/${name}/messages`)
      .filter((path) => existsSync(join(root, path))),
  ),
  'apps/web/messages',
];

let copy = '';
const at = (path: string) => join(copy, path);
const run = () => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, copy], { encoding: 'utf8' });
  return { status, stdout, lines: stderr.split('\n').filter((line) => line !== '') };
};

describe('scripts/validate.ts on a copy of the files it reads', () => {
  beforeAll(() => {
    copy = mkdtempSync(join(tmpdir(), 'validate-'));
    for (const path of readPaths()) cpSync(join(root, path), at(path), { recursive: true });
  });
  afterAll(() => rmSync(copy, { recursive: true, force: true }));

  it('1: passes the files unchanged', () => {
    const { status, stdout, lines } = run();
    expect(lines).toEqual([]);
    expect(stdout).toContain(', 0 problems');
    expect(status).toBe(0);
  });

  it("2: refuses the module's figure once the copy's chart moves Solana's fall", () => {
    const file = at('packages/content/cycles/drawdowns.json');
    const before = readFileSync(file, 'utf8');
    const chart = JSON.parse(before);
    for (const row of chart.drawdowns) if (row.coin === 'SOL') row.fall = '96';
    writeFileSync(file, JSON.stringify(chart));
    try {
      const { status, lines } = run();
      const sentence = 'Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, and Solana 97 %.';
      expect(lines).toContain(
        `${MODULE}: figure-chart: body: "97 %" in "${sentence}" is not Solana's fall at that place in the chart's order; R5 (docs/CONTENT-STYLE.md §4)`,
      );
      expect(status).toBe(1);
    } finally {
      writeFileSync(file, before);
    }
  });

  it('3: fails a translated chart section closed until its language has shapes', () => {
    const translated = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
    const english = readFileSync(at(MODULE), 'utf8');
    const kept = /^(?:slug|title|idea|caveat): /u;
    const [, front = '', body = ''] = english.split(/^---\n/mu);
    const translation = `---\n${front
      .split('\n')
      .filter((line) => kept.test(line))
      .join('\n')}\n---\n${body}`;
    writeFileSync(at(translated), translation);
    try {
      const { status, lines } = run();
      expect(lines.filter((line) => line.startsWith(`${translated}: figure-chart: `)).length).toBeGreaterThan(0);
      expect(lines.filter((line) => line.startsWith(`${translated}: figure-unstated: `)).length).toBeGreaterThan(0);
      expect(status).toBe(1);
    } finally {
      rmSync(at(translated));
    }
  });
}, 30_000);
