import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../src/validate.ts';
import { overlayPaths } from './overlay-paths.ts';

const root = mkdtempSync(join(tmpdir(), 'overlay-paths-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (path: string, json: unknown) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), JSON.stringify(json));
};
const english = 'packages/content/templates/two-coins.json';
const englishJson: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL('../templates/two-coins.json', import.meta.url)), 'utf8'),
);

describe('overlayPaths: pnpm validate:content reads every file under i18n/ (ADR-0057)', () => {
  it('reports a folder that is not a content language and a misspelled kind, and validates a pt-PT template', () => {
    put('packages/content/i18n/pt-PT/templates/two-coins.json', { id: 'duas-moedas' });
    put('packages/content/i18n/pt-BR/templates/two-coins.json', { name: 'Duas moedas' });
    put('packages/content/i18n/pt-PT/template/two-coins.json', { name: 'Duas moedas' });
    writeFileSync(join(root, 'packages/content/i18n/pt-PT/README.md'), '# pt-PT\n');
    const files = overlayPaths(root).map((absolute) => ({
      path: relative(root, absolute).replaceAll('\\', '/'),
      json: JSON.parse(readFileSync(absolute, 'utf8')) as unknown,
    }));
    expect(files.map(({ path }) => path)).toEqual([
      'packages/content/i18n/pt-BR/templates/two-coins.json',
      'packages/content/i18n/pt-PT/template/two-coins.json',
      'packages/content/i18n/pt-PT/templates/two-coins.json',
    ]);
    const problems = validateContent([{ path: english, json: englishJson }, ...files], {
      today: '2026-11-15',
      allow: {},
    })
      .filter((problem) => problem.path.includes('/i18n/'))
      .map((problem) => `${problem.path.split('/i18n/')[1]}: ${problem.code}: ${problem.detail}`);
    expect(problems).toEqual([
      'pt-BR/templates/two-coins.json: overlay-orphan: pt-BR is not a content language',
      'pt-PT/template/two-coins.json: unknown-file: not a content or message file',
      'pt-PT/templates/two-coins.json: overlay-not-translatable: id',
    ]);
  });

  it('gives nothing when there is no i18n folder', () => {
    expect(overlayPaths(join(root, 'none'))).toEqual([]);
  });
});
