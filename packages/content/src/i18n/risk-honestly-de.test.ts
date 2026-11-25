import { readFileSync } from 'node:fs';
import { checkModuleBody, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import coins from '../../coins.json' with { type: 'json' };
import drawdowns from '../../cycles/drawdowns.json' with { type: 'json' };
import { parseModule } from '../loaders/modules.ts';
import { moduleContext, moduleFigureProblems } from '../module-figures.ts';
import { findBanned } from '../style/banned.ts';
import { sentencesOf } from '../template-figures.ts';
import { readTranslatedModule, translatedModuleProblems } from './module-overlay-validate.ts';

// The German Risk honestly over the real files (ADR-0057; docs/CONTENT-STYLE.md §4 R5 and §10), the twin of
// risk-honestly-pt.test.ts. It pins structure only: the chart section in German's shapes against the chart's rows,
// the no-break spaces English keeps, the front matter against English's. The words are the content review's.
const path = 'packages/content/i18n/de/learn/risk-honestly.mdx';
const englishPath = 'packages/content/learn/risk-honestly.mdx';
const read = (file: string) =>
  readFileSync(new URL(`../../${file.slice('packages/content/'.length)}`, import.meta.url), 'utf8');

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

const MONTHS = 'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember';
// The nouns the module writes after a count: B's, the time units and the §10 count nouns it uses.
const NOUNS = 'Rückgänge|Rückgang|Monaten?|Monate|Jahren?|Jahre|Tagen?|Tage|Bitcoins|Anzeichen';
// Each place where English joins a figure to its unit, sign or date part, read in German: an ordinary space or a line
// end there lets the line break (lesson 579; the English module's BREAKS).
const BREAKS = [
  /[ \n]%/gu,
  new RegExp(`\\d[ \\n](?:${NOUNS})(?!\\p{L})`, 'gu'),
  /\d[ \n]Mrd\./gu,
  /Mrd\.[ \n]US-Dollar/gu,
  /\d[ \n]\d{3}(?!\d)/gu,
  new RegExp(`\\d{1,2}\\.[ \\n](?:${MONTHS})`, 'gu'),
  new RegExp(`(?:${MONTHS})[ \\n]\\d{4}`, 'gu'),
];

describe('the German Risk honestly module', () => {
  it("states its chart section in German's shapes, against the chart's rows", async () => {
    const { problem, page } = await checkModuleBody(read(path), path, MODULE_BODY_ELEMENTS);
    expect(problem).toBeNull();
    const context = moduleContext(english(), 'de', { rows: drawdowns.drawdowns, coins });
    expect(moduleFigureProblems(path, page, context)).toEqual([]);
  });

  // Each sentence German lists is one the live section holds, and none holds a trigger, read listed beside B and E.
  it('lists only live sentences of its chart section, none with a trigger', async () => {
    const { problem, page } = await checkModuleBody(read(path), path, MODULE_BODY_ELEMENTS);
    expect(problem).toBeNull();
    const at = page.findIndex((block) => block.kind === 'element' && block.name === 'Chart');
    const end = page.findIndex((block, index) => index > at && block.kind === 'heading');
    const start = page.findLastIndex((block, index) => index < at && block.kind === 'heading') + 1;
    const live = page
      .slice(start, end === -1 ? page.length : end)
      .flatMap((block) => (block.kind === 'paragraph' ? sentencesOf(block.text) : []));
    const context = moduleContext(english(), 'de', { rows: drawdowns.drawdowns, coins });
    expect(context.listed.length).toBeGreaterThan(0);
    expect(context.listed.filter((sentence) => !live.includes(sentence))).toEqual([]);
    // Alone in the section, an entry leaves each coin's falls unstated: it holds no trigger and counts no fall as B or E.
    const unstated = new Set(drawdowns.drawdowns.map(({ coin }) => coin)).size;
    for (const sentence of context.listed) {
      const probe = await checkModuleBody(`<Chart />\n\n${sentence}\n`, path, MODULE_BODY_ELEMENTS);
      const codes = moduleFigureProblems(path, probe.page, context).map(({ code }) => code);
      expect([sentence, codes]).toEqual([sentence, Array<string>(unstated).fill('figure-unstated')]);
    }
  });

  it('keeps each figure with its unit and each date whole, wherever English does', () => {
    const { body } = translated();
    expect(BREAKS.flatMap((rule) => body.match(rule) ?? [])).toEqual([]);
    // The rules see a date at all: the module writes its dates in German's long form.
    expect(body).toMatch(new RegExp(`\\d{1,2}\\.\\u00a0(?:${MONTHS})\\u00a0\\d{4}`, 'u'));
  });

  it("holds English's name, limits and numbers in its front matter", () => {
    expect(translatedModuleProblems(path, english(), translated(), 'de')).toEqual([]);
  });

  it('holds only the 4 texts a reader reads, with no banned word', () => {
    const { front } = translated();
    expect(Object.keys(front)).toEqual(['slug', 'title', 'idea', 'caveat']);
    expect([front.title, front.idea, front.caveat].flatMap((text) => findBanned(text ?? ''))).toEqual([]);
  });
});
