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
      'body: the count "6" and its noun "inputs" are joined by U+0020, not U+00A0; replace the gap with one U+00A0; ' +
        'R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report(`about 750${NBSP}000${cp(0x85)}bitcoins`, 'idea', 'pt-PT')).toEqual([
      `idea: the count "750${NBSP}000" and its noun "bitcoins" are joined by U+0085, not U+00A0; replace the gap ` +
        'with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report('Every plan, 118 start\nmonths from Jan 2013', 'body', 'en')).toEqual([
      'body: the count "118" and its noun "start months" are joined by U+0020, not U+00A0; replace the gap with one ' +
        'U+00A0; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
  });

  it('prints a hidden character inside a noun by code point, and a source line break there as one space', () => {
    const report = (text: string) => moduleCountProblems(at, [['body', text]], 'en').map(({ detail }) => detail);
    const tail = 'are joined by U+0020, not U+00A0; replace the gap with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
    expect(report(`It read 40 data${cp(0x2009)}points in a row.`)).toEqual([
      `body: the count "40" and its noun "dataU+2009 points" ${tail}`,
    ]);
    expect(report('It read 40 data\npoints in a row.')).toEqual([
      `body: the count "40" and its noun "data points" ${tail}`,
    ]);
  });

  it('finds the pair across a hidden character and quotes the count, the noun and the gap as written', () => {
    const report = (text: string) => moduleCountProblems(at, [['body', text]], 'en').map(({ detail }) => detail);
    expect(report(`It mixes 6${cp(0x200b)}0 inputs.`)).toEqual([
      'body: the count "6U+200B 0" and its noun "inputs" are joined by U+0020, not U+00A0; replace the gap with one ' +
        'U+00A0; R7 (docs/CONTENT-STYLE.md §4)',
      'body: the count "6U+200B 0" before its noun "inputs" holds U+200B; delete it; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report(`It mixes 6${cp(0xe0001)} inputs.`)).toEqual([
      'body: the count "6" and its noun "inputs" are joined by U+E0001 U+0020, not U+00A0; replace the gap with one ' +
        'U+00A0; R7 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(report('It mixes 6inputs.')).toEqual([]);
  });

  // A default-ignorable code point between a word and the count, or between the noun and a word, separates them as the
  // file writes them (a browser can break at U+200B there): it is never a letter, mark or digit beside either.
  it('judges the word edges around the count and the noun as written', () => {
    const zwsp = cp(0x200b);
    const report = (text: string, field: string) =>
      moduleCountProblems(at, [[field, text]], 'en').map(({ detail }) => detail);
    const joined = (field: string) =>
      `${field}: the count "6" and its noun "inputs" are joined by U+0020, not U+00A0; replace the gap with one ` +
      'U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
    for (const field of ['idea', 'body']) {
      expect([field, report(`It mixes${zwsp}6 inputs.`, field)]).toEqual([field, [joined(field)]]);
      expect([field, report(`It mixes 6 inputs${zwsp}x.`, field)]).toEqual([field, [joined(field)]]);
      expect([field, report('It mixes6 inputs.', field)]).toEqual([field, []]);
      expect([field, report('It mixes 6 inputsx.', field)]).toEqual([field, []]);
    }
    // A hidden character after `a1` leaves the written `6` a count of its own.
    expect(report(`It mixes a1${zwsp}6 inputs.`, 'body')).toEqual([joined('body')]);
    // A letter or digit outside the BMP is an edge too, and the text's start and end are not.
    expect(report(`${cp(0x1d400)}6 inputs`, 'body')).toEqual([]);
    expect(report(`6 inputs${cp(0x1d7ce)}`, 'body')).toEqual([]);
    expect(report(`${cp(0x1d400)}${zwsp}6 inputs${zwsp}${cp(0x1d7ce)}`, 'body')).toEqual([joined('body')]);
  });

  // #388: a default-ignorable code point is part of the gap, nothing between two digits or two letters, and never an
  // edge, whatever its general category: Cf (U+200B, U+00AD), Mn (U+034F, U+FE0F), Lo (U+3164) and Cn (U+2065).
  const HIDDEN = [0x200b, 0xad, 0x34f, 0xfe0f, 0x3164, 0x2065];
  const named = (point: number) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
  const joinedBy = (count: string, noun: string, gap: string, field = 'body') =>
    `${field}: the count "${count}" and its noun "${noun}" are joined by ${gap}, not U+00A0; replace the gap with ` +
    'one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
  const holds = (count: string, noun: string, held: string, field = 'body') =>
    `${field}: the count "${count}" before its noun "${noun}" holds ${held}; delete it; R7 (docs/CONTENT-STYLE.md §4)`;
  const details = (text: string, field = 'body', language: 'en' | 'pt-PT' = 'en') =>
    moduleCountProblems(at, [[field, text]], language).map(({ detail }) => detail);

  it('refuses a default-ignorable at every place around a count and its noun, of every general category', () => {
    const cells = (field: string) =>
      HIDDEN.flatMap((point) => {
        const [x, n] = [cp(point), named(point)];
        const plain = [joinedBy('6', 'inputs', 'U+0020', field)];
        return [
          ['before the count, after a space', `It has ${x}6 inputs.`, plain],
          ['before the count, after a letter', `It has${x}6 inputs.`, plain],
          [
            'inside the count',
            `It has 1${x}2 inputs.`,
            [joinedBy(`1${n} 2`, 'inputs', 'U+0020', field), holds(`1${n} 2`, 'inputs', n, field)],
          ],
          ['in the gap, after U+00A0', `It has 6${NBSP}${x}inputs.`, [joinedBy('6', 'inputs', `U+00A0 ${n}`, field)]],
          ['in the gap, alone', `It has 6${x}inputs.`, [joinedBy('6', 'inputs', n, field)]],
          ['inside the noun', `It has 6 in${x}puts.`, [joinedBy('6', `in${n} puts`, 'U+0020', field)]],
          ['after the noun, before a stop', `It has 6 inputs${x}.`, plain],
          ['after the noun, before a letter', `It has 6 inputs${x}or more.`, plain],
        ].map(([place, text, expected]) => [field, place, n, details(text as string, field), expected]);
      });
    for (const field of ['body', 'idea']) {
      const table = cells(field);
      expect(table.map(([f, place, n, found]) => [f, place, n, found])).toEqual(
        table.map(([f, place, n, , expected]) => [f, place, n, expected]),
      );
    }
  });

  it('passes a default-ignorable outside the count and the gap when the gap is one U+00A0', () => {
    const texts = HIDDEN.flatMap((point) => {
      const x = cp(point);
      return [
        `It has ${x}6${NBSP}inputs.`,
        `It has${x}6${NBSP}inputs.`,
        `It has 6${NBSP}in${x}puts.`,
        `It has 6${NBSP}inputs${x}.`,
        `It has 6${NBSP}inputs${x}or more.`,
      ];
    });
    expect(texts.flatMap((text) => details(text))).toEqual([]);
    expect(details(`It has 2${cp(0x2013, 0x2060)}6${NBSP}inputs.`)).toEqual([]);
    expect(details(`Há 4${NBSP}observa${cp(0xad)}ções.`, 'body', 'pt-PT')).toEqual([]);
    expect(details(`Every plan, 118${NBSP}start${cp(0x200b, 0x0a)}months.`)).toEqual([]);
  });

  it('refuses a default-ignorable inside a count, U+00A0 or not, and reads no year through one', () => {
    for (const point of HIDDEN) {
      const n = named(point);
      expect([n, details(`It has 1${cp(point)}2${NBSP}inputs.`)]).toEqual([n, [holds(`1${n} 2`, 'inputs', n)]]);
    }
    const zwsp = cp(0x200b);
    expect(details(`The 20${zwsp}17${NBSP}cycles had highs.`)).toEqual([holds('20U+200B 17', 'cycles', 'U+200B')]);
    expect(details(`The 20${zwsp}17 cycles had highs.`)).toEqual([
      joinedBy('20U+200B 17', 'cycles', 'U+0020'),
      holds('20U+200B 17', 'cycles', 'U+200B'),
    ]);
    expect(details('The 2017 cycles had highs.')).toEqual([]);
    expect(details(`It has 1${cp(0xe0080)}2${NBSP}inputs.`)).toEqual([holds('1U+E0080 2', 'inputs', 'U+E0080')]);
    expect(details(`It has 1,${zwsp}000${NBSP}inputs.`)).toEqual([holds('1,U+200B 000', 'inputs', 'U+200B')]);
  });

  it("prints each hidden code point of a count in order, and says 'them' for two or more", () => {
    const [zwsp, shy] = [cp(0x200b), cp(0xad)];
    const them = (count: string, held: string) =>
      `body: the count "${count}" before its noun "inputs" holds ${held}; delete them; R7 (docs/CONTENT-STYLE.md §4)`;
    expect(details(`It has 1${zwsp}2${zwsp}3${NBSP}inputs.`)).toEqual([
      them('1U+200B 2U+200B 3', 'U+200B U+200B'),
    ]);
    expect(details(`It has 1${shy}2${zwsp}3${NBSP}inputs.`)).toEqual([
      them('1U+00AD 2U+200B 3', 'U+00AD U+200B'),
    ]);
  });

  it('reads U+FEFF as a hidden character', () => {
    const bom = cp(0xfeff);
    expect(details(`It has 6${bom}inputs.`)).toEqual([joinedBy('6', 'inputs', 'U+FEFF')]);
    expect(details(`It has 6${NBSP}${bom}inputs.`)).toEqual([joinedBy('6', 'inputs', 'U+00A0 U+FEFF')]);
    expect(details(`It read 40 data${bom}points.`)).toEqual([joinedBy('40', 'dataU+FEFF points', 'U+0020')]);
    expect(details(`It read 40${NBSP}data${bom}points.`)).toEqual([]);
  });

  it('reads a two-word noun across a default-ignorable beside its space', () => {
    const zwsp = cp(0x200b);
    expect(details(`It read 40 data${zwsp} points.`)).toEqual([joinedBy('40', 'dataU+200B  points', 'U+0020')]);
    expect(details(`It ran 3 completed${zwsp} cycles.`)).toEqual([joinedBy('3', 'completedU+200B  cycles', 'U+0020')]);
    expect(details(`It read 40${NBSP}data ${zwsp}points.`)).toEqual([]);
    expect(details(`It read 40 data${zwsp}points.`)).toEqual([]);
  });

  it('reads a default-ignorable or a letter outside the BMP as one code point', () => {
    expect(details(`It has 6${NBSP}${cp(0xe0100)}inputs.`)).toEqual([joinedBy('6', 'inputs', 'U+00A0 U+E0100')]);
    expect(details(`It has 6${cp(0xe0041)}inputs.`)).toEqual([joinedBy('6', 'inputs', 'U+E0041')]);
    expect(details(`It has${cp(0x1d173)}6 inputs.`)).toEqual([joinedBy('6', 'inputs', 'U+0020')]);
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

  it('reads a year before a listed noun as a year, not a count', () => {
    expect(codes('The 2017 and 2021 cycles had highs.', 'en')).toEqual([]);
    expect(codes('On 9 Jul 2016 blocks paid half as much.', 'en')).toEqual([]);
    expect(codes('Os 2017 e 2021 ciclos tiveram picos.', 'pt-PT')).toEqual([]);
    expect(codes('2013 cycles began the chart.', 'en')).toEqual([]);
    expect(codes('1900 blocks and 2099 cycles', 'en')).toEqual([]);
    expect(codes('A 9 de julho de 2016 blocos pagaram metade.', 'pt-PT')).toEqual([]);
  });

  it('still reads a count outside the years, or one with a group separator', () => {
    expect(codes('1899 blocks', 'en')).toEqual(['figure-join']);
    expect(codes('2100 blocks', 'en')).toEqual(['figure-join']);
    expect(codes('20210 blocks', 'en')).toEqual(['figure-join']);
    expect(codes('2,016 blocks', 'en')).toEqual(['figure-join']);
    expect(codes(`2${NBSP}016 blocos`, 'pt-PT')).toEqual(['figure-join']);
    expect(codes('118 start months and 95 countries', 'en')).toEqual(['figure-join', 'figure-join']);
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

  it('reads a block as the parser decoded it, before the page drops a hidden character', () => {
    const zwsp = cp(0x200b);
    const page = [
      { kind: 'paragraph', text: `6${NBSP}inputs`, written: `6${NBSP}${zwsp}inputs`, listNumbers: [2] },
      { kind: 'heading', text: `4${NBSP}cycles` },
    ] as const;
    const texts = moduleCountTexts({}, page);
    expect(texts).toEqual([
      ['body', `2. 6${NBSP}${zwsp}inputs`],
      ['body', `4${NBSP}cycles`],
    ]);
    expect(moduleCountProblems(at, texts, 'en').map(({ detail }) => detail.split(', not ')[0])).toEqual([
      'body: the count "6" and its noun "inputs" are joined by U+00A0 U+200B',
    ]);
  });
});
