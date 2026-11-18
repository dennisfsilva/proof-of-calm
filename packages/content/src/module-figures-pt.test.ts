import { readFileSync } from 'node:fs';
import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { type FigureContext, moduleContext, moduleFigureProblems } from './module-figures.ts';

// docs/CONTENT-STYLE.md §4 and §9: pt-PT's two shapes of a chart's section, its articles, its agreement, its commas
// and its closed list, against literal coins and rows, the ones module-figures.test.ts freezes, so that no content
// review changes what these pin. Each case states its codes in order; the parity table holds each English case of
// module-figures.test.ts with a pt-PT form to the same codes in both languages.
const at = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
const COINS = [
  { id: 'ADA', name: 'Cardano' },
  { id: 'BTC', name: 'Bitcoin' },
  { id: 'ETH', name: 'Ethereum' },
  { id: 'LINK', name: 'Chainlink' },
  { id: 'OP', name: 'Optimism' },
  { id: 'SOL', name: 'Solana' },
  { id: 'XRP', name: 'XRP' },
];
type Row = { readonly coin: string; readonly high: string; readonly low: string; readonly fall: string };
const row = (coin: string, high: string, low: string, fall: string): Row => ({ coin, high, low, fall });
const ROWS: readonly Row[] = [
  row('BTC', '2011-06-08', '2011-11-22', '94'),
  row('BTC', '2013-11-30', '2015-01-14', '87'),
  row('BTC', '2017-12-17', '2018-12-15', '84'),
  row('BTC', '2021-11-10', '2022-11-21', '78'),
  row('ETH', '2018-01-13', '2018-12-14', '94'),
  row('ETH', '2021-11-10', '2022-06-18', '82'),
  row('LINK', '2018-01-08', '2018-06-29', '89'),
  row('LINK', '2021-05-10', '2023-06-10', '91'),
  row('SOL', '2021-11-06', '2022-12-29', '97'),
];
const set = (coin: string, high: string, change: Partial<Row>) =>
  ROWS.map((r) => (r.coin === coin && r.high === high ? { ...r, ...change } : r));
const insert = (coin: string, extra: Row) => {
  const index = ROWS.findLastIndex((r) => r.coin === coin) + 1;
  return [...ROWS.slice(0, index), extra, ...ROWS.slice(index)];
};
const without = (coin: string) => ROWS.filter((r) => r.coin !== coin);
const ONLY_2021 = ROWS.filter((r) => r.coin !== 'BTC' || r.high === '2021-11-10');

// The judge's two sentences (#349) and a plausible pt-PT draft of the section's other sentences.
const S1 = 'No gráfico, a bitcoin teve 4 quedas de mais de 75 % entre 2011 e 2022.';
const S2 = 'O ether caiu 94 % e 82 %, a Chainlink 89 % e 91 % e a Solana 97 %.';
const INTRO =
  'Um plano mensal define o dia de cada compra. Não limita até onde um preço pode cair, e uma moeda pode perder quase\ntodo o seu valor. Cada barra abaixo é uma queda de uma moeda, desde um máximo de ciclo até ao preço mais baixo\ndepois desse máximo.';
const REST =
  '## Outras formas de perder as moedas\n\nA 10 out. 2025, as liquidações passaram 19 mil milhões de $ num dia.';
const EN1 = 'In the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2022.';
const EN2 = 'Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, and Solana 97 %.';
const EN_INTRO = 'A monthly plan sets when you buy. Each bar below is one fall of one coin.';
const nb = (text: string) => text.replaceAll(' %', ' %');
const pt = (chart = `${S1} ${S2}`, { intro = INTRO, raw = false } = {}) =>
  `${intro}\n\n<Chart />\n\n${raw ? chart : nb(chart)}\n\n${REST}\n`;
const en = (chart = `${EN1} ${EN2}`, { raw = false } = {}) =>
  `${EN_INTRO}\n\n<Chart />\n\n${raw ? chart : nb(chart)}\n\n## Other ways\n\nText.\n`;
const ptPara = (text: string) => pt(`${S1} ${S2}\n\n${text}`);
const enPara = (text: string) => en(`${EN1} ${EN2}\n\n${text}`);
const ptE = (tail: string) => pt(`${S1} O ether caiu 94 % e 82 %, a Chainlink 89 % e 91 %${tail}`);
const enE = (tail: string) => en(`${EN1} Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, ${tail}`);

async function problemsOf(source: string, language = 'pt-PT', rows: FigureContext['rows'] = ROWS) {
  const { problem, page } = await checkModuleBody(source, at);
  expect(problem).toBeNull();
  return moduleFigureProblems(at, page, moduleContext({ chart: 'drawdowns-bar' }, language, { rows, coins: COINS }));
}
const codes = async (source: string, language?: string, rows?: FigureContext['rows']) =>
  (await problemsOf(source, language, rows)).map(({ code }) => code);
const FC = 'figure-chart';
const FU = 'figure-unstated';
const FU4 = [FU, FU, FU, FU];
// The fix a closed section's refusal names (docs/CONTENT-STYLE.md §1 rule 8).
const LIST_IT = 'list it in LISTED in packages/content/src/module-figures.ts in a reviewed pull request';
const FIX = `write it as B or E (docs/CONTENT-STYLE.md §9), or ${LIST_IT}`;

describe("pt-PT's chart section", () => {
  it("1: passes the judge's two sentences under the draft's other sentences: []", async () => {
    expect(await codes(pt())).toEqual([]);
  });

  // 2: English's case and its pt-PT form give the same codes.
  it.each<[string, string, string, readonly string[], FigureContext['rows']?]>([
    ['S1 and S2 with U+0020', en(undefined, { raw: true }), pt(undefined, { raw: true }), []],
    [
      'a BTC row at 52 to 2026, counted by a lower bound',
      en(`In the chart, bitcoin had 5 falls of more than 50 % between 2011 and 2026. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 5 quedas de mais de 50 % entre 2011 e 2026. ${S2}`),
      [],
      insert('BTC', row('BTC', '2025-10-06', '2026-10-30', '52')),
    ],
    [
      'a BTC row at 54 stated in E',
      enE('Solana 97 %, and bitcoin 54 %.'),
      ptE(', a Solana 97 % e a bitcoin 54 %.'),
      [],
      insert('BTC', row('BTC', '2025-10-06', '2026-07-01', '54')),
    ],
    [
      'an ETH row at 63',
      en(`${EN1} Ether fell 94 %, 82 %, and 63 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
      pt(`${S1} O ether caiu 94 %, 82 % e 63 %, a Chainlink 89 % e 91 % e a Solana 97 %.`),
      [],
      insert('ETH', row('ETH', '2024-03-12', '2025-04-09', '63')),
    ],
    [
      'a bound on Solana',
      en(
        `${EN1} In the chart, Solana had 1 fall of more than 95 % between 2021 and 2022. Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`,
      ),
      pt(
        `${S1} No gráfico, a Solana teve 1 queda de mais de 95 % entre 2021 e 2022. O ether caiu 94 % e 82 % e a Chainlink 89 % e 91 %.`,
      ),
      [],
    ],
    [
      "only BTC's 2021 row",
      en(`In the chart, bitcoin had 1 fall of more than 75 % between 2021 and 2022. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 1 queda de mais de 75 % entre 2021 e 2022. ${S2}`),
      [],
      ONLY_2021,
    ],
    ['E first, as two paragraphs', en(`${EN2}\n\n${EN1}`), pt(`${S2}\n\n${S1}`), []],
    [
      'the order: two figures swapped',
      en(`${EN1} ${EN2.replace('94 % and 82 %', '82 % and 94 %')}`),
      pt(`${S1} ${S2.replace('94 % e 82 %', '82 % e 94 %')}`),
      [FC, FC],
    ],
    ['a wrong figure', enE('and Solana 96 %.'), ptE(' e a Solana 96 %.'), [FC]],
    [
      'the same figure on a row at 96',
      enE('and Solana 96 %.'),
      ptE(' e a Solana 96 %.'),
      [],
      set('SOL', '2021-11-06', { fall: '96' }),
    ],
    [
      'a bound too high',
      en(`In the chart, bitcoin had 1 fall of more than 95 % between 2011 and 2022. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 1 queda de mais de 95 % entre 2011 e 2022. ${S2}`),
      [FC, FU],
    ],
    [
      'a bound that counts three falls ending in 2018',
      en(`In the chart, bitcoin had 4 falls of more than 78 % between 2011 and 2022. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 4 quedas de mais de 78 % entre 2011 e 2022. ${S2}`),
      [FC, FC, FU],
    ],
    [
      'a bound too low to count a new row',
      en(),
      pt(),
      [FU],
      insert('BTC', row('BTC', '2025-10-06', '2026-07-01', '52')),
    ],
    [
      'a wrong K',
      en(`In the chart, bitcoin had 5 falls of more than 75 % between 2011 and 2022. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 5 quedas de mais de 75 % entre 2011 e 2022. ${S2}`),
      [FC],
    ],
    [
      'years wider than the falls',
      en(`In the chart, bitcoin had 4 falls of more than 75 % between 2010 and 2024. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 4 quedas de mais de 75 % entre 2010 e 2024. ${S2}`),
      [FC],
    ],
    [
      'years reversed',
      en(`In the chart, bitcoin had 4 falls of more than 75 % between 2022 and 2011. ${EN2}`),
      pt(`No gráfico, a bitcoin teve 4 quedas de mais de 75 % entre 2022 e 2011. ${S2}`),
      [FC, FU],
    ],
    ['a coin with no row', enE('Solana 97 %, and Cardano 97 %.'), ptE(', a Solana 97 % e a Cardano 97 %.'), [FC]],
    [
      'a missing coin',
      en(`${EN1} Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`),
      pt(`${S1} O ether caiu 94 % e 82 % e a Chainlink 89 % e 91 %.`),
      [FU],
    ],
    [
      'SOL removed',
      en(`${EN1} Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`),
      pt(`${S1} O ether caiu 94 % e 82 % e a Chainlink 89 % e 91 %.`),
      [],
      without('SOL'),
    ],
    ['a code block', enPara('```\nnote\n```'), ptPara('```\nnota\n```'), [FC]],
    ['emphasis on a figure', enE('and Solana *97* %.'), ptE(' e a Solana *97* %.'), [FC, ...FU4]],
    ['U+200B before the joiner', enE('and Solana 97​ %.'), ptE(' e a Solana 97​ %.'), [FC, ...FU4]],
    ['SOL 97 %', enE('and SOL 97 %.'), ptE(' e a SOL 97 %.'), [FC, FU, FU, FU]],
  ])('%s', async (_, english, portuguese, expected, rows = ROWS) => {
    expect(await codes(english, 'en', rows)).toEqual(expected);
    expect(await codes(portuguese, 'pt-PT', rows)).toEqual(expected);
  });

  // 2: holes 1 and 3 of amendment 8 hold in English only; in pt-PT an unlisted sentence fails closed.
  it.each([
    [
      'a paragraph after the figures',
      enPara('Each fall above is history, not a forecast.'),
      ptPara('Cada queda acima é história, não uma previsão.'),
    ],
    [
      'a catalogue coin the chart does not draw',
      enPara('Optimism is not a plan.'),
      ptPara('A Optimism não é um plano.'),
    ],
  ])('2: %s passes in English and fails unlisted in pt-PT', async (_, english, portuguese) => {
    expect(await codes(english, 'en')).toEqual([]);
    expect(await codes(portuguese)).toEqual([FC]);
  });

  // 3: the article agrees with the coin and is capitalised only to open E.
  it.each<[string, string, readonly string[]]>([
    ['A ether caiu', pt(`${S1} ${S2.replace('O ether', 'A ether')}`), [FC, FU, FU, FU]],
    ['o Solana', pt(`${S1} ${S2.replace('a Solana', 'o Solana')}`), [FC, FU, FU, FU]],
    ['a Ether', pt(`${S1} A Chainlink caiu 89 % e 91 %, a Ether 94 % e 82 % e a Solana 97 %.`), [FC, FU, FU, FU]],
    ['o ether to open E', pt(`${S1} ${S2.replace('O ether', 'o ether')}`), [FC, FU, FU, FU]],
    ['A Solana inside E', pt(`${S1} ${S2.replace('a Solana', 'A Solana')}`), [FC, FU, FU, FU]],
    ['A bitcoin in B', pt(`${S1.replace('a bitcoin', 'A bitcoin')} ${S2}`), [FC, FU]],
    ['A Ethereum opens E', pt(`${S1} ${S2.replace('O ether', 'A Ethereum')}`), []],
    ['a Ethereum inside E', pt(`${S1} A Chainlink caiu 89 % e 91 %, a Ethereum 94 % e 82 % e a Solana 97 %.`), []],
  ])('3: %s', async (_, source, expected) => {
    expect(await codes(source)).toEqual(expected);
  });

  // 4: `queda` with K = 1, `quedas` otherwise.
  it.each<[string, string, readonly string[], FigureContext['rows']?]>([
    [
      '1 quedas',
      pt(`No gráfico, a bitcoin teve 1 quedas de mais de 75 % entre 2021 e 2022. ${S2}`),
      [FC, FU],
      ONLY_2021,
    ],
    ['2 queda', pt(`${S1} No gráfico, a bitcoin teve 2 queda de mais de 85 % entre 2011 e 2015. ${S2}`), [FC]],
    [
      '1 queda with one matching row',
      pt(
        'No gráfico, a bitcoin teve 1 queda de mais de 90 % entre 2011 e 2011. O ether caiu 94 % e 82 %, a Chainlink 89 % e 91 %, a Solana 97 % e a bitcoin 87 %, 84 % e 78 %.',
      ),
      [],
    ],
  ])('4: %s', async (_, source, expected, rows = ROWS) => {
    expect(await codes(source, 'pt-PT', rows)).toEqual(expected);
  });

  // 5: no comma before `e` (§9), and clauses joined by `e`, never by a comma alone.
  it.each<[string, string, FigureContext['rows']?]>([
    [', e a Solana', ptE(', e a Solana 97 %.')],
    [
      '94 %, 82 %, e 63 %',
      pt(`${S1} O ether caiu 94 %, 82 %, e 63 %, a Chainlink 89 % e 91 % e a Solana 97 %.`),
      insert('ETH', row('ETH', '2024-03-12', '2025-04-09', '63')),
    ],
    ['two clauses joined by a comma alone', ptE(', a Solana 97 %.')],
  ])('5: %s', async (_, source, rows = ROWS) => {
    expect(await codes(source, 'pt-PT', rows)).toEqual([FC, FU, FU, FU]);
  });

  it('6: the live translation of Risk honestly passes: []', async () => {
    const source = readFileSync(new URL('../i18n/pt-PT/learn/risk-honestly.mdx', import.meta.url), 'utf8');
    // A translation's front matter holds only its translated fields, so the body is read past it.
    expect(await codes(source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, ''))).toEqual([]);
  });

  it("7: English's shapes fail in a pt-PT module, and pt-PT's in an English one", async () => {
    expect(await codes(pt(`${S1} Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, and Solana 97 %.`))).toEqual([
      FC,
      FU,
      FU,
      FU,
    ]);
    expect(await codes(en(`${S1} ${S2}`), 'en')).toEqual([FC, FC, ...FU4]);
  });

  it.each<[string, string, readonly string[]]>([
    ['97%', pt(`${S1} ${S2.replace('97 %', '97%')}`, { raw: true }), [FC, FC, FU, FU, FU]],
    ['97 and two spaces', pt(`${S1} ${S2.replace('97 %', '97  %')}`, { raw: true }), [FC]],
    ['U+0020', pt(undefined, { raw: true }), []],
    ['U+00A0', pt(), []],
  ])('8: the joiner %s', async (_, source, expected) => {
    expect(await codes(source)).toEqual(expected);
  });

  it("8: a wrong K is quoted in the sentence's words, the coin without its article", async () => {
    const sentence = nb('No gráfico, a bitcoin teve 5 quedas de mais de 75 % entre 2011 e 2022.');
    const [first] = await problemsOf(pt(`${sentence} ${S2}`));
    expect(first?.detail).toBe(
      `body: "5 quedas" in "${sentence}" is not how many of bitcoin's falls in the chart are more than 75 % between 2011 and 2022; R6 (docs/CONTENT-STYLE.md §4)`,
    );
  });

  // N10: the intro's three sentences, B and E each fail, since de lists none and has no shapes.
  it('9: a language without shapes still fails closed, its intro too', async () => {
    const found = await problemsOf(pt(), 'de');
    expect(found.map(({ code }) => code)).toEqual([FC, FC, FC, FC, FC, ...FU4]);
    expect(found[0]?.detail).toBe(
      `body: "Um plano mensal define o dia de cada compra." is not a sentence de's list holds and matches neither shape of a chart's section, and de has no shapes for a chart's section yet; ${LIST_IT}; R5 (docs/CONTENT-STYLE.md §4)`,
    );
    expect(found[3]?.detail).toBe(
      `body: "${nb(S1)}" holds a figure "4" and matches neither shape of a chart's section, and de has no shapes for a chart's section yet; R5 (docs/CONTENT-STYLE.md §4)`,
    );
  });
});

// docs/CONTENT-STYLE.md §9 (#358, 2026-11-18): a translation's chart section is closed. Each sentence and heading there
// is B, E or one its language's list holds, character for character; English's section stays open.
describe("pt-PT's closed chart section", () => {
  const LIVE = [
    'Um plano mensal define o dia de cada compra.',
    'Não limita até onde um preço pode cair, e uma moeda pode perder quase todo o seu valor.',
    'Cada barra abaixo é uma queda de uma moeda, desde um máximo de ciclo até ao preço mais baixo depois desse máximo.',
  ];
  const unlisted = (sentence: string, language = 'pt-PT') =>
    `body: "${sentence}" is not a sentence ${language}'s list holds and matches neither shape of a chart's section; ${FIX}; R5 (docs/CONTENT-STYLE.md §4)`;
  /** The codes with `extra` listed for pt-PT beside its own list. */
  async function listedCodes(source: string, extra: readonly string[]) {
    const { problem, page } = await checkModuleBody(source, at);
    expect(problem).toBeNull();
    const context = moduleContext({ chart: 'drawdowns-bar' }, 'pt-PT', { rows: ROWS, coins: COINS });
    return moduleFigureProblems(at, page, { ...context, listed: [...context.listed, ...extra] }).map(
      ({ code }) => code,
    );
  }

  it.each(LIVE)('N2: the listed «%s» passes after the figures', async (sentence) => {
    expect(await codes(ptPara(sentence))).toEqual([]);
  });

  // N2: compared character for character, never case-blind, folded or normalised.
  const variants = LIVE.flatMap((sentence) =>
    (
      [
        ['a letter', sentence.replace('a', 'á')],
        ['NFD', sentence.normalize('NFD')],
        ['U+00A0', sentence.replace(' ', ' ')],
        ['lower-case first', sentence.charAt(0).toLowerCase() + sentence.slice(1)],
      ] as const
    )
      .filter(([, variant]) => variant !== sentence)
      .map(([how, variant]) => [`${how}: ${sentence}`, variant] as const),
  );
  it.each(variants)('N2: %s fails', async (_, variant) => {
    expect(await codes(ptPara(variant))).toEqual([FC]);
  });

  // N3: the forms the five rounds of word lists missed, and prose a list would pass, fail as unlisted.
  it.each([
    ...[
      'trilhão',
      'quadragésima',
      'dobrado',
      'duplicava',
      'terço',
      'quadriplicou',
      'séptuplo',
      'undécuplo',
      'duodécuplo',
      'quadruplávamos',
      'setes',
      'tríplice',
      'milheiro',
      'parelha',
      'trilionésimo',
      'trimestral',
      'enésima',
      'três'.normalize('NFD'),
      'dоis', // a Cyrillic о
    ].map((form) => `O preço ficou ${form}.`),
    'Ou assim parece.',
    'Cada queda acima é história, não uma previsão.',
  ])('N3: «%s» fails', async (sentence) => {
    expect(await codes(ptPara(sentence))).toEqual([FC]);
  });

  it('N4: an unlisted sentence names its list in the detail', async () => {
    const found = await problemsOf(ptPara('Ou assim parece.'));
    expect(found.map(({ code, detail }) => [code, detail])).toEqual([[FC, unlisted('Ou assim parece.')]]);
  });

  it('N5: a heading in the section is listed or fails', async () => {
    const found = await problemsOf(pt(undefined, { intro: `## Quedas\n\n${INTRO}` }));
    expect(found.map(({ code, detail }) => [code, detail])).toEqual([
      [
        FC,
        `body: the heading "Quedas" in the chart's section is not a sentence pt-PT's list holds; ${LIST_IT}, or remove it; R5 (docs/CONTENT-STYLE.md §4)`,
      ],
    ]);
  });

  it('N6: a mark in a paragraph of listed sentences fails', async () => {
    const found = await problemsOf(pt(undefined, { intro: INTRO.replace('mensal', '*mensal*') }));
    expect(found.map(({ code, detail }) => [code, detail])).toEqual([
      [
        FC,
        `body: the paragraph "${INTRO.replace(/\s+/gu, ' ')}" holds emphasis in the chart's section, which reads plain text only; R5 (docs/CONTENT-STYLE.md §4)`,
      ],
    ]);
  });

  // N7: a listed sentence is still read for English's trigger and the chart's coins.
  it.each(['A Solana caiu muito.', nb('Caiu 50 % num ano.')])('N7: a listed «%s» fails', async (sentence) => {
    expect(await listedCodes(ptPara(sentence), [sentence])).toEqual([FC]);
  });

  it('N8: prose with `uma` passes only once listed', async () => {
    const sentence = 'Cada barra é uma queda de uma moeda.';
    expect(await listedCodes(ptPara(sentence), [sentence])).toEqual([]);
    expect(await listedCodes(ptPara(sentence), [])).toEqual([FC]);
  });

  it("N9: English's section stays open, a translation's is closed", async () => {
    expect(await codes(enPara('Each fall above is history, not a forecast.'), 'en')).toEqual([]);
    const live = readFileSync(new URL('../learn/risk-honestly.mdx', import.meta.url), 'utf8');
    expect(await codes(live.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, ''), 'en')).toEqual([]);
    expect(await codes(ptPara('Cada queda acima é história, não uma previsão.'))).toEqual([FC]);
  });

  // Review of #361 round 1: `1975. <a listed sentence>` is an ordered list that shows 1975, which no block's text
  // holds. A closed section reads only its top-level paragraphs and headings and the chart; it refuses the rest.
  const SENTENCE = LIVE[0] as string;
  const inside = (what: string, where: string, out: string, fix = `write it outside the ${out}`) =>
    `body: ${what} sits in ${where} in the chart's section, which reads only paragraphs and headings outside a list, \
a quote or an element; ${fix}; R5 (docs/CONTENT-STYLE.md §4)`;
  const pairs = async (source: string) => (await problemsOf(source)).map(({ code, detail }) => [code, detail] as const);

  it.each([1975, 2011, 94, 1])(
    'R1: «%i. <a listed sentence>» after the chart fails, naming the list item',
    async (n) => {
      expect(await pairs(ptPara(`${n}. ${SENTENCE}`))).toEqual([
        [FC, inside(`the paragraph "${SENTENCE}"`, `list item ${n}`, 'list')],
      ]);
    },
  );

  it('R1: the listed sentence as a paragraph passes, and a year in a paragraph fails', async () => {
    expect(await codes(ptPara(SENTENCE))).toEqual([]);
    expect(await codes(ptPara('Em 1975 um plano mensal define o dia de cada compra.'))).toEqual([FC]);
  });

  // Brand's round 2 on #365: an empty item has nothing to move out of the list, so its fix removes the marker.
  it.each([
    ['1975.', 'list item 1975'],
    ['-', 'a list item'],
  ])(
    'R1: an empty item «%s» after the chart fails, naming where it is and removing the marker',
    async (item, where) => {
      expect(await pairs(ptPara(item))).toEqual([
        [FC, inside('an empty paragraph', where, 'list', 'remove the list marker')],
      ]);
      // The fix applied: without its marker the item leaves nothing, and the section passes.
      expect(await codes(ptPara(''))).toEqual([]);
    },
  );

  // Brand's round 2 on #365: a sentence with a trigger passes only as B or E, so its detail names those shapes.
  it.each([
    ['Em 2022 a bitcoin caiu muito.', 'a figure "2022"'],
    ['Uma queda em ‰ é rara.', 'a percentage "‰"'],
  ])('R1: «%s» after the chart fails, naming B and E as its fix', async (sentence, holds) => {
    expect(await pairs(ptPara(sentence))).toEqual([
      [
        FC,
        `body: "${sentence}" holds ${holds} and matches neither shape of a chart's section; write it as B or E \
(docs/CONTENT-STYLE.md §9); R5 (docs/CONTENT-STYLE.md §4)`,
      ],
    ]);
    // The fix applied: the sentence rewritten as the section's E, in place of S2, passes.
    expect(await codes(pt(`${S1}\n\n${sentence}`))).toEqual([FC, FU, FU, FU]);
    expect(await codes(pt(`${S1}\n\n${S2}`))).toEqual([]);
  });

  it.each([
    ['- ', 'a list item', 'list'],
    ['> ', 'a quote', 'quote'],
  ])('R2: «%s<a listed sentence>» after the chart fails, naming %s', async (marker, where, out) => {
    expect(await pairs(ptPara(`${marker}${SENTENCE}`))).toEqual([
      [FC, inside(`the paragraph "${SENTENCE}"`, where, out)],
    ]);
  });

  it('R2: a listed sentence inside an element other than the chart fails', async () => {
    const { page } = await checkModuleBody(ptPara(SENTENCE), at);
    const held = page.map((block) =>
      block.kind === 'paragraph' && block.text === SENTENCE
        ? { ...block, container: 'mdxJsxFlowElement' as const }
        : block,
    );
    const context = moduleContext({ chart: 'drawdowns-bar' }, 'pt-PT', { rows: ROWS, coins: COINS });
    expect(moduleFigureProblems(at, held, context).map(({ code, detail }) => [code, detail])).toEqual([
      [FC, inside(`the paragraph "${SENTENCE}"`, 'an element', 'element')],
    ]);
  });

  it('R2: a heading in a quote fails and does not end the section', async () => {
    expect(await pairs(ptPara('> ## Quedas\n\nOu assim parece.'))).toEqual([
      [FC, inside('the heading "Quedas"', 'a quote', 'quote')],
      [FC, unlisted('Ou assim parece.')],
    ]);
  });

  it('R2: the chart in a quote, and another element in the section, fail', async () => {
    const quoted = pt().replace('<Chart />', '> <Chart />');
    expect(await pairs(quoted)).toEqual([[FC, inside('the element <Chart />', 'a quote', 'quote')]]);
    expect(await pairs(ptPara('<PastPerformance />'))).toEqual([
      [
        FC,
        `body: the element <PastPerformance /> stands in the chart's section, which holds no element but the chart; \
move it out of the section; R5 (docs/CONTENT-STYLE.md §4)`,
      ],
    ]);
  });

  // R3: English's section stays open, so the same blocks give what they gave before the section read containers.
  it.each(['1975. ', '- ', '> '])(
    "R3: «%sA monthly plan sets when you buy.» in English's section: []",
    async (marker) => {
      expect(await codes(enPara(`${marker}A monthly plan sets when you buy.`), 'en')).toEqual([]);
      expect(await codes(enPara(`${marker}${SENTENCE}`), 'en')).toEqual([]);
      expect(await codes(enPara('<PastPerformance />'), 'en')).toEqual([]);
    },
  );

  it('R3: English still reads a figure in a list item: E there passes, one figure off fails', async () => {
    expect(await codes(en(`${EN1}\n\n1. ${EN2}`), 'en')).toEqual([]);
    expect(await codes(en(`${EN1}\n\n1. ${EN2.replace('97', '96')}`), 'en')).toEqual([FC]);
  });
});
