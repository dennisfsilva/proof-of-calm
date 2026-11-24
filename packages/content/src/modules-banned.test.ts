import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import facts from '../facts/education.json' with { type: 'json' };
import { moduleProblems } from './modules-validate.ts';
import { findBanned } from './style/banned.ts';

// The ban lint's three reads of a Learn module's body (modules-validate.ts, docs/CONTENT-STYLE.md §2): a source wrap
// is neither a German line nor a clause opening, the raw read keeps every English and Portuguese refusal, and the page
// lines start a German line at each block and open a clause at a line the page starts inside one.
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

describe('the German line rule on the lines a module’s page starts', () => {
  it.each([
    '- Ein ruhiger Plan\n- Kauft BTC jeden Monat',
    '## Ein ruhiger Plan\nKauf jeden Monat BTC',
    '1. Ein ruhiger Plan\n2. Kauf BTC jeden Monat',
    '> Ein ruhiger Plan\n> - Kauf jeden Monat BTC',
    'Ein ruhiger Plan\n> Kauf jeden Monat BTC',
    'Ein ruhiger Plan\n===\nKauf jeden Monat BTC',
    '- ## Ein ruhiger Plan\nKauf jeden Monat BTC',
    '-\nKauf jeden Monat BTC',
  ])('refuses a form that opens a block the page starts: %j', (paragraph) => {
    expect(banned(paragraph)).toContain('banned-imperative');
  });

  it.each([
    'Ein ruhiger Plan\\\nKauf jeden Monat BTC',
    'Ein Plan für Bitcoin\\\nKauft jeden Monat',
    'Ein ruhiger Plan  \nKauf jeden Monat BTC',
    'Ein Plan für Bitcoin  \nKauft jeden Monat',
    'Ein ruhiger Plan <PastPerformance /> Kauf jeden Monat BTC',
    'Bitcoin fiel stark <PastPerformance />\nKauft jeden Monat',
    '```\nEin ruhiger Plan\nKauft BTC jeden Monat\n```',
    '```\nBTC fällt\n\nKauft jeden Monat\n```',
    'Der Kurs fiel am\n3. Kauf von BTC folgte.',
    '- Legen Sie Ihr Geld in Bitcoin an\n- Ein ruhiger Plan',
  ])('refuses a form at a line the page starts inside a block, the block its line: %j', (paragraph) => {
    expect(banned(paragraph).length).toBeGreaterThan(0);
  });

  it.each([
    '- Ein Rückgang ist kein Grund für einen\n  Verkauf von Bitcoin.',
    '> Ein Rückgang ist kein Grund für einen\nVerkauf von Bitcoin.',
    '1. Bitcoin seit 2009\n2. Kauf: einmal im Monat',
    '## Bitcoin und Ether\nKauf: einmal im Monat.',
    'Ein Plan hält fest:\n- Coins und Anteile: BTC 70 %, ETH 30 %\n- Kauftag: der 5. jedes Monats\n- Verkauf: ab dem Datum, das Sie wählen',
    '| Plan | Betrag |\n|---|---|\n| Kauft BTC | 100 € |',
    'Ein Text.\n\n    Ein ruhiger Plan\n    Kauf jeden Monat BTC',
  ])('passes a capital noun at a wrap, or at a block whose own line names no asset: %j', (paragraph) => {
    expect(banned(paragraph)).toEqual([]);
  });

  it('reports one finding where the joined read and the page lines refuse the same line', () => {
    expect(banned('Kaufen Sie jeden Monat Bitcoin.')).toEqual(['banned-imperative']);
    expect(banned('Kaufen Sie Bitcoin\\\njeden Monat.')).toEqual(['banned-imperative']);
  });
});
