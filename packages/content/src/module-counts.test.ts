import { describe, expect, it } from 'vitest';
import { COUNT_NOUNS, moduleCountProblems, moduleCountTexts } from './module-counts.ts';

// docs/CONTENT-STYLE.md §4: a Learn module joins a count to a listed noun with one U+00A0, so that a line never ends
// between them (the 25z probe, Chromium and WebKit, 240 to 400 px). Every hidden character here is built from its
// code point, so that no editor turns it into another.
const at = 'packages/content/learn/noise.mdx';
const cp = (...points: number[]) => String.fromCodePoint(...points);
const NBSP = cp(0xa0);
const NOUNS = {
  en: [
    'blocks',
    'data points',
    'inputs',
    'components',
    'indexes',
    'bitcoins',
    'episodes',
    'start months',
    'countries',
    'cycles',
    'completed cycles',
    'parts',
    'signs',
  ],
  'pt-PT': ['blocos', 'observações', 'componentes', 'índices', 'bitcoins', 'países', 'ciclos', 'partes', 'sinais'],
} as const;
// Each gap that is not exactly one U+00A0: a space, a thin space, a tab, U+00A0 with a space on either side, a format
// character (U+0600), a control character (U+0085) and a source line break.
const GAPS: readonly (readonly [string, string])[] = [
  [' ', 'U+0020'],
  [cp(0x2009), 'U+2009'],
  ['\t', 'U+0009'],
  [cp(0xa0, 0x20), 'U+00A0 U+0020'],
  [cp(0x20, 0xa0), 'U+0020 U+00A0'],
  [cp(0x600), 'U+0600'],
  [cp(0x85), 'U+0085'],
  ['\n', 'U+000A'],
];
const codes = (text: string, language: 'en' | 'pt-PT', field = 'body') =>
  moduleCountProblems(at, [[field, text]], language).map(({ code }) => code);

describe('moduleCountProblems: a count and its listed noun, joined by one U+00A0 (docs/CONTENT-STYLE.md §4)', () => {
  for (const language of ['en', 'pt-PT'] as const) {
    it(`refuses every gap but one U+00A0 before each ${language} noun`, () => {
      for (const noun of NOUNS[language]) {
        const reported = GAPS.map(([gap]) => codes(`It holds 6${gap}${noun}, as written.`, language));
        expect([noun, reported]).toEqual([noun, GAPS.map(() => ['figure-join'])]);
        expect([noun, codes(`It holds 6${NBSP}${noun}, as written.`, language)]).toEqual([noun, []]);
      }
    });
  }

  it('lists exactly the nouns the probe joined', () => {
    for (const language of ['en', 'pt-PT'] as const)
      for (const noun of NOUNS[language])
        expect([language, noun, COUNT_NOUNS[language].test(noun)]).toEqual([language, noun, true]);
    expect(['falls', 'quedas', 'years', 'anos'].filter((noun) => COUNT_NOUNS.en.test(noun))).toEqual([]);
  });

  it('prints the gap by code point, the field and the noun as the page shows it', () => {
    const report = (text: string, field: string, language: 'en' | 'pt-PT') =>
      moduleCountProblems(at, [[field, text]], language).map(({ detail }) => detail);
    expect(report('It mixes 6 inputs, as published.', 'body', 'en')).toEqual([
      'body: the count "6" and its noun "inputs" are joined by U+0020, not U+00A0; write one U+00A0 between them; ' +
        'R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report(`about 750${NBSP}000${cp(0x85)}bitcoins`, 'idea', 'pt-PT')).toEqual([
      `idea: the count "750${NBSP}000" and its noun "bitcoins" are joined by U+0085, not U+00A0; write one U+00A0 ` +
        'between them; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report('Every plan, 118 start\nmonths from Jan 2013', 'body', 'en')).toEqual([
      'body: the count "118" and its noun "start months" are joined by U+0020, not U+00A0; write one U+00A0 between ' +
        'them; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
  });

  it("leaves B's falls and quedas to R6, and years, dates and unlisted nouns alone", () => {
    expect(codes('In the chart, bitcoin had 4 falls of more than 70 % between 2011 and 2025.', 'en')).toEqual([]);
    expect(codes('No gráfico, a bitcoin teve 4 quedas de mais de 70 % entre 2011 e 2025.', 'pt-PT')).toEqual([]);
    expect(codes('From 2013 the highs came about 4 years apart, on 28 Nov 2012 and 9 Jul 2016.', 'en')).toEqual([]);
    expect(
      codes('A partir de 2013, os máximos chegaram com 4 anos de intervalo, a 8 de junho de 2011.', 'pt-PT'),
    ).toEqual([]);
    expect(codes('It has 2 indexed sources and 12 inputsless rows.', 'en')).toEqual([]);
    expect(codes('2021 blocks', 'pt-PT')).toEqual([]);
  });

  it('reads every text it is given, each on its own', () => {
    const texts = [
      ['idea', '4 cycles are 4 data points, not a law.'],
      ['body', `It mixes 6${NBSP}inputs.`],
      ['caveat', `Mistura 6${NBSP}componentes e 5 componentes.`],
    ] as const;
    expect(moduleCountProblems(at, texts, 'en').map(({ detail }) => detail.split(':')[0])).toEqual(['idea', 'idea']);
    expect(moduleCountProblems(at, texts, 'pt-PT').map(({ detail }) => detail.split(':')[0])).toEqual(['caveat']);
  });
});

describe('moduleCountTexts: every text the Learn sheet shows', () => {
  it("reads the title, idea and caveat, and every block's text, a list item's and a heading's included", () => {
    const page = [
      { kind: 'heading', text: '6 signs of a scam' },
      { kind: 'paragraph', text: 'It mixes 6 inputs.', container: 'listItem', listNumbers: [3] },
      { kind: 'paragraph', text: 'Most moves are noise.', container: 'blockquote' },
      { kind: 'code', text: '2 indexes' },
      { kind: 'element', name: 'Chart' },
    ] as const;
    const front = { title: 'Noise', idea: '4 cycles are 4 data points.', caveat: 'A plan can lose money.' };
    const texts = moduleCountTexts(front, page);
    expect(texts).toEqual([
      ['title', 'Noise'],
      ['idea', '4 cycles are 4 data points.'],
      ['caveat', 'A plan can lose money.'],
      ['body', '6 signs of a scam'],
      ['body', '3. It mixes 6 inputs.'],
      ['body', 'Most moves are noise.'],
      ['body', '2 indexes'],
    ]);
    expect(moduleCountProblems(at, texts, 'en').map(({ detail }) => detail.split(' are ')[0])).toEqual([
      'idea: the count "4" and its noun "cycles"',
      'idea: the count "4" and its noun "data points"',
      'body: the count "6" and its noun "signs"',
      'body: the count "6" and its noun "inputs"',
      'body: the count "2" and its noun "indexes"',
    ]);
    expect(moduleCountTexts({}, [])).toEqual([]);
  });
});
