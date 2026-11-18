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

  it("3: reads a pt-PT chart section in pt-PT's shapes and list, and refuses one figure off", () => {
    // Fixed bodies, so that no review of the live module or its translation changes what this pins.
    const translated = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
    const english = readFileSync(at(MODULE), 'utf8');
    const had = existsSync(at(translated)) ? readFileSync(at(translated), 'utf8') : null;
    const [, front = ''] = english.split(/^---\n/mu);
    const kept = front
      .split('\n')
      .filter((line) => /^(?:slug|title|idea|caveat): /u.test(line))
      .join('\n');
    const pt = (solana: string, after = '') =>
      `---\n${kept}\n---\n<Chart />\n\nNo gráfico, a bitcoin teve 4 quedas de mais de 75 % entre 2011 e 2022. O ether caiu 94 % e 82 %,\na Chainlink 89 % e 91 % e a Solana ${solana} %.${after}\n`;
    writeFileSync(
      at(MODULE),
      `---\n${front}---\nA monthly plan sets when you buy. It does not limit how far a price can fall.\n\n<Chart />\n\nIn the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2022. Ether fell 94 % and 82 %,\nChainlink 89 % and 91 %, and Solana 97 %.\n`,
    );
    try {
      writeFileSync(at(translated), pt('97'));
      const passed = run();
      expect(passed.lines).toEqual([]);
      expect(passed.status).toBe(0);
      // One figure off, and a sentence pt-PT does not list: exactly two figure lines (the number tie adds its own).
      writeFileSync(at(translated), pt('96', ' A queda durou três anos.'));
      const { status, lines } = run();
      const sentence = 'O ether caiu 94 % e 82 %, a Chainlink 89 % e 91 % e a Solana 96 %.';
      expect(lines.filter((line) => line.includes(': figure-'))).toEqual([
        `${translated}: figure-chart: body: "A queda durou três anos." is not a sentence pt-PT's list holds and matches neither shape of a chart's section; R5 (docs/CONTENT-STYLE.md §4)`,
        `${translated}: figure-chart: body: "96 %" in "${sentence}" is not Solana's fall at that place in the chart's order; R5 (docs/CONTENT-STYLE.md §4)`,
      ]);
      expect(status).toBe(1);
    } finally {
      writeFileSync(at(MODULE), english);
      if (had === null) rmSync(at(translated));
      else writeFileSync(at(translated), had);
    }
  });
}, 30_000);
