import { readFileSync } from 'node:fs';
import { checkModuleBody, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import coins from '../../coins.json' with { type: 'json' };
import drawdowns from '../../cycles/drawdowns.json' with { type: 'json' };
import { parseModule } from '../loaders/modules.ts';
import { moduleContext, moduleFigureProblems } from '../module-figures.ts';
import { findBanned } from '../style/banned.ts';
import { readTranslatedModule, translatedModuleProblems } from './module-overlay-validate.ts';

// The pt-PT Risk honestly over the real files (ADR-0057; docs/CONTENT-STYLE.md §4 R5 and §9). It pins structure only:
// the chart section in pt-PT's shapes against the chart's rows, the no-break spaces English keeps, the front matter
// against English's. The words are the content review's.
const path = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
const englishPath = 'packages/content/learn/risk-honestly.mdx';
const read = (file: string) => readFileSync(new URL(`../../${file.slice('packages/content/'.length)}`, import.meta.url), 'utf8');

function english() {
  const parsed = parseModule(englishPath, read(englishPath));
  if (!parsed.ok) throw new Error(englishPath);
  return parsed.value;
}

function translated() {
  const parsed = readTranslatedModule(path, read(path));
  if (!parsed.ok) throw new Error(parsed.error.map(({ detail }) => detail).join('; '));
  return parsed.value;
}

const MONTHS = 'janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
// Each place where English joins a figure to its unit, sign or date part, read in pt-PT: an ordinary space or a line
// end there lets the line break (lesson 579; the English module's BREAKS).
const BREAKS = [
  /[ \n]%/gu,
  /\d[ \n](?:meses|anos|dias|mil)/gu,
  /mil[ \n]milhões/gu,
  /\d[ \n]\d{3}(?!\d)/gu,
  new RegExp(`\\d{1,2}[ \\n]de\\s(?:${MONTHS})`, 'gu'),
  new RegExp(`\\d{1,2}\\sde[ \\n](?:${MONTHS})`, 'gu'),
  new RegExp(`(?:${MONTHS})[ \\n]de\\s\\d{4}`, 'gu'),
  new RegExp(`(?:${MONTHS})\\sde[ \\n]\\d{4}`, 'gu'),
];

describe('the pt-PT Risk honestly module', () => {
  it("states its chart section in pt-PT's shapes, against the chart's rows", async () => {
    const { problem, page } = await checkModuleBody(read(path), path, MODULE_BODY_ELEMENTS);
    expect(problem).toBeNull();
    const context = moduleContext(english(), 'pt-PT', { rows: drawdowns.drawdowns, coins });
    expect(moduleFigureProblems(path, page, context)).toEqual([]);
  });

  it('keeps each figure with its unit and each date whole, wherever English does', () => {
    const { body } = translated();
    expect(BREAKS.flatMap((rule) => body.match(rule) ?? [])).toEqual([]);
    // The rules see a date at all: the module writes its dates in pt-PT's long form.
    expect(body).toMatch(new RegExp(`\\d{1,2}\\u00a0de\\u00a0(?:${MONTHS})\\u00a0de\\u00a0\\d{4}`, 'u'));
  });

  it("holds English's name, limits and numbers in its front matter", () => {
    expect(translatedModuleProblems(path, english(), translated(), 'pt-PT')).toEqual([]);
  });

  it('holds only the 4 texts a reader reads, with no banned word', () => {
    const { front } = translated();
    expect(Object.keys(front)).toEqual(['slug', 'title', 'idea', 'caveat']);
    expect([front.title, front.idea, front.caveat].flatMap((text) => findBanned(text ?? ''))).toEqual([]);
  });
});
