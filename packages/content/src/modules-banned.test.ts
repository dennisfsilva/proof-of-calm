import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import facts from '../facts/education.json' with { type: 'json' };
import { moduleProblems } from './modules-validate.ts';
import { findBanned } from './style/banned.ts';

// The ban lint's two reads of a Learn module's body (modules-validate.ts, docs/CONTENT-STYLE.md §2): a source wrap
// is neither a German line nor a clause opening, and the raw read keeps every English and Portuguese refusal.
const path = 'packages/content/learn/noise.mdx';
const source = readFileSync(new URL('../learn/noise.mdx', import.meta.url), 'utf8');
const context = { facts: new Map(facts.map((fact) => [fact.key, fact.lastReviewed])), today: '2026-11-09' };
const banned = (paragraph: string) =>
  moduleProblems({ path, source: `${source}\n${paragraph}\n` }, context)
    .filter(({ code }) => code.startsWith('banned-'))
    .map(({ code }) => code);

describe('the ban lint on a wrapped paragraph of a Learn module', () => {
  it('reads a German paragraph as one line, so a wrapped noun opens no clause', () => {
    const paragraph = 'Ein Rückgang allein ist kein Grund für einen\nVerkauf von Bitcoin.';
    expect(findBanned(paragraph.replace('\n', ' '))).toEqual([]);
    expect(banned(paragraph)).toEqual([]);
  });

  it.each([
    'Nach einem Rückgang legen Sie Ihr Geld\nin Bitcoin an.',
    'Ein Rückgang ist kein Grund zur Eile.\nKaufen Sie trotzdem Bitcoin.',
    'Nach einem Rückgang\nverkaufen Sie Ihre Coins.',
  ])('still refuses a German directive that names an asset across a wrap: %j', (paragraph) => {
    expect(banned(paragraph)).toContain('banned-imperative');
  });

  it.each(['Some people say:\nBuy Bitcoin every month.', 'Há quem diga:\nCompre Bitcoin todos os meses.'])(
    'keeps the raw read’s English and Portuguese refusal: %j',
    (paragraph) => {
      expect(banned(paragraph)).toContain('banned-imperative');
    },
  );
});
