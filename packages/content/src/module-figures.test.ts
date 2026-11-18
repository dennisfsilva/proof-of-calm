import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { type FigureContext, moduleContext, moduleFigureProblems } from './module-figures.ts';

// docs/CONTENT-STYLE.md §4, R5 and R6, as #349's verdict lists them, on literal module bodies through the build's
// compiler and literal rows, so that no content review changes what these pin. Each text is the chart's paragraph
// with U+00A0 before each `%` unless a case says otherwise.
const at = 'packages/content/learn/risk-honestly.mdx';
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
const ROWS = [
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
const insert = (index: number, extra: Row) => [...ROWS.slice(0, index), extra, ...ROWS.slice(index)];
const without = (coin: string, high?: string) =>
  ROWS.filter((r) => r.coin !== coin || (high !== undefined && r.high !== high));

const ONLY_2021 = ROWS.filter((r) => r.coin !== 'BTC' || r.high === '2021-11-10');

const S1 = 'In the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2022.';
const S2 = 'Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, and Solana 97 %.';
const INTRO =
  'A monthly plan sets when you buy. It does not limit how far a price can fall, and a coin can lose almost all\nof its value. Each bar below is one fall of one coin, from a cycle high to the lowest price after it.';
const REST = '## Other ways to lose the coins\n\nOn 10 Oct 2025, liquidations passed $19 billion in one day.';
const nb = (text: string) => text.replaceAll(' %', ' %');
/** A body: the intro, the chart, the chart's paragraphs (U+00A0 before each `%` unless raw) and the next section. */
const body = (chart = `${S1} ${S2}`, { intro = INTRO, rest = REST, raw = false } = {}) =>
  `${intro}\n\n<Chart />\n\n${raw ? chart : nb(chart)}\n\n${rest}\n`;
const after = (text: string) => body(`${S1} ${S2} ${text}`);
const para = (text: string) => body(`${S1} ${S2}\n\n${text}`);
const E = (tail: string) => body(`${S1} Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, ${tail}`);

type Options = { readonly chart?: 'drawdowns-bar' | 'halvings-line'; readonly language?: string };
async function problemsOf(source: string, rows: FigureContext['rows'] = ROWS, options: Options = {}) {
  const { problem, page } = await checkModuleBody(source, at);
  expect(problem).toBeNull();
  const context = moduleContext({ chart: options.chart ?? 'drawdowns-bar' }, options.language ?? 'en', {
    rows,
    coins: COINS,
  });
  return moduleFigureProblems(at, page, context);
}
/** How many `figure-chart` and how many `figure-unstated` problems. */
const tally = async (source: string, rows?: FigureContext['rows'], options?: Options) => {
  const codes = (await problemsOf(source, rows, options)).map(({ code }) => code);
  return [codes.filter((c) => c === 'figure-chart').length, codes.filter((c) => c === 'figure-unstated').length];
};
const details = async (source: string, rows?: FigureContext['rows']) =>
  (await problemsOf(source, rows)).map(({ code, detail }) => `${code}: ${detail}`);

describe('a chart section passes', () => {
  it.each<[string, string, readonly Row[]]>([
    ['S1 and S2 with U+00A0', body(), ROWS],
    ['S1 and S2 with U+0020 before each %', body(`${S1} ${S2}`, { raw: true }), ROWS],
    [
      '3: a BTC row at 52 to 2026, counted by a lower bound',
      body(`In the chart, bitcoin had 5 falls of more than 50 % between 2011 and 2026. ${S2}`),
      insert(4, row('BTC', '2025-10-06', '2026-10-30', '52')),
    ],
    [
      '4: a BTC row at 54 stated in E',
      E('Solana 97 %, and bitcoin 54 %.'),
      insert(4, row('BTC', '2025-10-06', '2026-07-01', '54')),
    ],
    [
      '5: an ETH row at 63',
      body(`${S1} Ether fell 94 %, 82 %, and 63 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
      insert(6, row('ETH', '2024-03-12', '2025-04-09', '63')),
    ],
    ['6: SOL at 96', E('and Solana 96 %.'), set('SOL', '2021-11-06', { fall: '96' })],
    [
      "7: BTC's 2011 high in 2010",
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2010 and 2022. ${S2}`),
      set('BTC', '2011-06-08', { high: '2010-07-17' }),
    ],
    [
      '8: LINK 2018 removed',
      body(`${S1} Ether fell 94 % and 82 %, Chainlink 91 %, and Solana 97 %.`),
      without('LINK', '2018-01-08'),
    ],
    ['9: SOL removed', body(`${S1} Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`), without('SOL')],
    ['10: an XRP row at 92', E('Solana 97 %, and XRP 92 %.'), [...ROWS, row('XRP', '2018-01-04', '2018-12-24', '92')]],
    [
      '11: BTC 2021 removed',
      body(`In the chart, bitcoin had 3 falls of more than 75 % between 2011 and 2018. ${S2}`),
      without('BTC', '2021-11-10'),
    ],
    [
      '12: more than 77 %',
      body(`In the chart, bitcoin had 4 falls of more than 77 % between 2011 and 2022. ${S2}`),
      ROWS,
    ],
    [
      '13: a bound on Solana',
      body(
        `${S1} In the chart, Solana had 1 fall of more than 95 % between 2021 and 2022. Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`,
      ),
      ROWS,
    ],
    [
      "14: only BTC's 2021 row",
      body(`In the chart, bitcoin had 1 fall of more than 75 % between 2021 and 2022. ${S2}`),
      ONLY_2021,
    ],
    ['15: S2 and S1 as two paragraphs, S2 first', body(`${S2}\n\n${S1}`), ROWS],
    ['16: a paragraph after the figures', para('Each fall above is history, not a forecast.'), ROWS],
    [
      '17: a BTC row at 63 before 2021',
      E('Solana 97 %, and bitcoin 63 %.'),
      insert(3, row('BTC', '2019-06-26', '2020-03-12', '63')),
    ],
    [
      '18: ETH 2021 at 94',
      body(`${S1} Ether fell 94 % and 94 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
      set('ETH', '2021-11-10', { fall: '94' }),
    ],
    [
      '19: a second, narrower bound',
      body(`${S1} In the chart, bitcoin had 2 falls of more than 85 % between 2011 and 2015. ${S2}`),
      ROWS,
    ],
    [
      '20: BTC 2021 at 75, stated in E',
      body(
        'In the chart, bitcoin had 3 falls of more than 75 % between 2011 and 2018. Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, Solana 97 %, and bitcoin 75 %.',
      ),
      set('BTC', '2021-11-10', { fall: '75' }),
    ],
    ['21: a heading before the intro', body(undefined, { intro: `## The falls\n\n${INTRO}` }), ROWS],
    ['22: strong in the intro', body(undefined, { intro: INTRO.replace('when', '**when**') }), ROWS],
    ['23: a hedge after S2', after('Or so it seems.'), ROWS],
    ['23: a projection without a trigger', para('Prices may fall that far again.'), ROWS],
    ['23: a catalogue coin the chart does not draw', para('Optimism is not a plan.'), ROWS],
  ])('%s', async (_, source, rows) => {
    expect(await details(source, rows)).toEqual([]);
  });

  it('reads no section on a module without a chart, or with no <Chart /> (module-chart-element)', async () => {
    const { page } = await checkModuleBody(para('Solana 50 %.'), at);
    const none = moduleContext({ chart: 'none' }, 'en', { rows: null, coins: null });
    expect(moduleFigureProblems(at, page, none)).toEqual([]);
    const bar = moduleContext({ chart: 'drawdowns-bar' }, 'en', { rows: ROWS, coins: COINS });
    expect(
      moduleFigureProblems(
        at,
        page.filter((block) => block.kind !== 'element'),
        bar,
      ),
    ).toEqual([]);
  });
});

// #343's second round, each with its fix, which passes, and one step past the fix, which fails.
describe("#343's cases, their fixes and one step past", () => {
  it.each<[string, string, readonly number[], string, string]>([
    [
      'a year beside each figure',
      body(`${S1} Ether fell 94 % in 2022 and 82 % in 2018. Chainlink fell 89 % and 91 %, and Solana 97 %.`),
      [1, 1],
      body(),
      body(`${S1} Ether fell 94 % in 2018 and 82 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
    ],
    [
      'a total after the bound',
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2022, of 6 falls in all. ${S2}`),
      [1, 1],
      body(),
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2022, of 6 in all. ${S2}`),
    ],
    [
      'a dated count',
      after('The last count was made on 17 Jun 2025.'),
      [1, 0],
      body(),
      after('The last count was made in June.'),
    ],
    [
      'a dated count, the month in full',
      after('The last count was made on 17 June 2025.'),
      [1, 0],
      body(),
      after('The last count was made in June.'),
    ],
    [
      'a sum of money',
      after('Liquidations reached USD 19 billion.'),
      [1, 0],
      body(),
      after('The last count was made in June.'),
    ],
    ['up to', E('and Solana up to 97 %.'), [1, 3], body(), E('and Solana 97 % at most.')],
    ['at most', E('and Solana at most 97 %.'), [1, 3], body(), E('and Solana 97 % at most.')],
    ['almost', E('and Solana almost 97 %.'), [1, 3], body(), E('and Solana 97 % at most.')],
    ['nearly', E('and Solana nearly 97 %.'), [1, 3], body(), E('and Solana 97 % at most.')],
    [
      'years wider than the falls',
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2010 and 2024. ${S2}`),
      [1, 0],
      body(),
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2011 and 2023. ${S2}`),
    ],
    ['Solana 96 % against 97', E('and Solana 96 %.'), [1, 0], body(), E('and Solana 98 %.')],
    [
      '5 falls',
      body(`In the chart, bitcoin had 5 falls of more than 75 % between 2011 and 2022. ${S2}`),
      [1, 0],
      body(),
      body(`In the chart, bitcoin had 3 falls of more than 75 % between 2011 and 2022. ${S2}`),
    ],
  ])('%s', async (_, source, counts, fix, past) => {
    expect(await tally(source)).toEqual(counts);
    expect(await details(fix)).toEqual([]);
    expect((await tally(past))[0]).toBeGreaterThan(0);
  });

  it('more than 78 % counts three falls in years that end in 2018: FC twice and FU; 77 is the fix', async () => {
    const at78 = body(`In the chart, bitcoin had 4 falls of more than 78 % between 2011 and 2022. ${S2}`);
    expect(await tally(at78)).toEqual([2, 1]);
    expect(await details(at78.replace('78', '77'))).toEqual([]);
  });
});

describe('a chart section fails', () => {
  const fence = '```\nSolana fell 96 %.\n```';
  it.each<[string, string, readonly number[], FigureContext['rows']?]>([
    ['a fence holding a figure', para(fence), [1, 0]],
    ['a code block without a figure', para('```\nnote\n```'), [1, 0]],
    [
      'It then fell 91 %.',
      body(`${S1} Ether fell 94 % and 82 %, Chainlink 89 %, and Solana 97 %. It then fell 91 %.`),
      [1, 1],
    ],
    ['a projection with a figure', para('Solana could fall 97 % again.'), [1, 0]],
    ['respectively', body(`${S1} Ether and Chainlink fell 94 % and 89 %, respectively. Solana fell 97 %.`), [1, 2]],
    ['a figure in words', E('and Solana ninety-seven per cent.'), [1, 3]],
    ['a count of the bars', after('In all, the chart holds 9 falls.'), [1, 0]],
    ['the year of the deepest fall', para('The deepest fall ended in 2022.'), [1, 0]],
    ['not 97 %', E('and Solana not 97 %.'), [1, 3]],
    ['only 97 %', E('and Solana only 97 %.'), [1, 3]],
    ['a BTC row at 52 added, the text kept', body(), [0, 1], insert(4, row('BTC', '2025-10-06', '2026-07-01', '52'))],
    [
      'years reversed',
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2022 and 2011. ${S2}`),
      [1, 1],
    ],
    ['less than', body(`In the chart, bitcoin had 4 falls of less than 75 % between 2011 and 2022. ${S2}`), [1, 1]],
    ['97 and a line feed before %', body(`${S1} ${S2.replace('97 %', '97\n%')}`, { raw: true }), [1, 0]],
    ['97%', body(`${S1} ${S2.replace('97 %', '97%')}`, { raw: true }), [2, 3]],
    ['97 and U+066A', body(`${S1} ${S2.replace('97 %', '97 ٪')}`, { raw: true }), [2, 3]],
    ['U+202F before %', body(`${S1} ${S2.replace('97 %', '97 %')}`, { raw: true }), [2, 3]],
    ['emphasis on a figure', E('and Solana *97* %.'), [1, 4]],
    ['strong on a figure', body(`${S1} ${S2.replace('94 %', '**94** %')}`), [1, 4]],
    ['a hard break inside a figure', body(`${S1} ${S2.replace('97 %', '97\\\n%')}`, { raw: true }), [1, 4]],
    ['a hard break between S1 and S2', body(`${S1}\\\n${S2}`), [1, 4]],
    ['U+200B before the joiner', E('and Solana 97​ %.'), [1, 4]],
    ['U+00AD inside 97', E('and Solana 9­7 %.'), [1, 4]],
    [
      'a heading with a figure opens the section',
      body(undefined, { intro: `## 4 falls of bitcoin\n\n${INTRO}` }),
      [1, 0],
    ],
    ['a coin and no figure', para('Solana could fall that far again.'), [1, 0]],
    ['a comparison in words', para('Ether fell further than Solana.'), [1, 0]],
    ['first', para('The first fall was the deepest.'), [1, 0]],
    ['once', para('Prices fell that far once more.'), [1, 0]],
    ['a month', para('The deepest fall ended in June.'), [1, 0]],
    ['May', para('May brought the lowest close.'), [1, 0]],
    ['a currency sign', para('Its price in $ fell.'), [1, 0]],
    ['a couple', para('A couple of falls were deeper.'), [1, 0]],
    ['a ticker', para('SOL could fall again.'), [1, 0]],
    ['a percentage word', para('Most coins fell a large percentage.'), [1, 0]],
    ['97.0 %', E('and Solana 97.0 %.'), [1, 3]],
    ['SOL 97 %', E('and SOL 97 %.'), [1, 3]],
    ['Arabic-Indic digits', E('and Solana ٩٧ %.'), [1, 3]],
    ['Cardano as a fourth clause', E('Solana 97 %, and Cardano 97 %.'), [1, 0]],
    ['Ether fell 94 % and 94 % against the rows', body(`${S1} ${S2.replace('82', '94')}`), [1, 0]],
    [
      'the bars counted in the intro',
      body(undefined, { intro: 'Each of the 9 bars below is one fall of one coin.' }),
      [1, 0],
    ],
    ['a colon list', body(`${S1} Ether: 94 % and 82 %. Chainlink fell 89 % and 91 %, and Solana 97 %.`), [1, 1]],
    ['75 % or more', body(`In the chart, bitcoin had 4 falls of 75 % or more between 2011 and 2022. ${S2}`), [1, 1]],
    ['over 75 %', body(`In the chart, bitcoin had 4 falls of over 75 % between 2011 and 2022. ${S2}`), [1, 1]],
    [
      'no serial comma, SOL removed',
      body(`${S1} Ether fell 94 % and 82 % and Chainlink 89 % and 91 %.`),
      [1, 2],
      without('SOL'),
    ],
    ['a clause after a semicolon', E('and Solana 97 %; it may fall that far again.'), [1, 3]],
    ['a vulgar fraction', para('A ½ share went.'), [1, 0]],
    ['a Roman numeral', para('Cycle Ⅳ ended.'), [1, 0]],
    ['a Roman numeral nine', para('Cycle Ⅸ ended.'), [1, 0]],
    ['50 per cent with U+00A0', para('It fell 50 per cent.'), [1, 0]],
    ["Ether's figures out of order", body(`${S1} ${S2.replace('94 % and 82 %', '82 % and 94 %')}`), [2, 0]],
    [
      'three figures without the serial comma',
      body(`${S1} Ether fell 94 %, 82 % and 63 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
      [1, 3],
      insert(6, row('ETH', '2024-03-12', '2025-04-09', '63')),
    ],
    [
      'three clauses without the serial comma',
      body(`${S1} Ether fell 94 % and 82 %, Chainlink 89 % and 91 % and Solana 97 %.`),
      [1, 3],
    ],
    [
      'had 1 falls',
      body(`In the chart, bitcoin had 1 falls of more than 75 % between 2021 and 2022. ${S2}`),
      [1, 1],
      ONLY_2021,
    ],
    ['had 0 falls', body(`In the chart, bitcoin had 0 falls of more than 95 % between 2011 and 2022. ${S2}`), [1, 1]],
    [
      'the figures moved under the next heading',
      body('Each bar is a fall.', { rest: `${REST}\n\n${nb(`${S1} ${S2}`)}` }),
      [0, 4],
    ],
    ['rows that did not load', body(), [1, 0], null],
  ])('%s', async (_, source, counts, rows = ROWS) => {
    expect(await tally(source, rows)).toEqual(counts);
  });

  it('reads any figure in the section of a chart without rows', async () => {
    expect(await tally(body(), ROWS, { chart: 'halvings-line' })).toEqual([4, 0]);
  });

  it('fails a translated section closed in a language without shapes, its intro too', async () => {
    expect(await tally(body(), ROWS, { language: 'de' })).toEqual([5, 4]);
  });
});

describe("each detail quotes its sentence and names its figure and rule (§4's list)", () => {
  const R = (n: number) => `; R${n} (docs/CONTENT-STYLE.md §4)`;
  const s2 = nb(S2);
  const JOIN = 'joins a figure to a sign; write the figure, one ordinary or no-break space, and %';

  // Brand's round 2 on #365: the join's detail gives its fix like its siblings, and the fix applied passes.
  it.each([
    ['‰', '97‰', `"97‰" in "${S1} ${S2.replace('97 %', '97‰')}" ${JOIN}`],
    ['٪', '97 ٪', `"97 ٪" in "${S1} ${S2.replace('97 %', '97 ٪')}" ${JOIN}`],
    // A gap other than one ordinary or no-break space names each character by its code point, as the overlay check
    // names a gap (ADR-0057's Corrections), since the quoted sentence folds white space to one space.
    ['a tab', '97\t%', `"97U+0009 %" in "${S1} ${S2}" ${JOIN}`],
    ['U+202F', '97 %', `"97U+202F %" in "${S1} ${S2}" ${JOIN}`],
    ['U+2009', '97 %', `"97U+2009 %" in "${S1} ${S2}" ${JOIN}`],
    ['U+2007', '97 %', `"97U+2007 %" in "${S1} ${S2}" ${JOIN}`],
    ['U+3000', '97　%', `"97U+3000 %" in "${S1} ${S2}" ${JOIN}`],
    ['two ordinary spaces', '97  %', `"97U+0020 U+0020 %" in "${S1} ${S2}" ${JOIN}`],
    // U+2060 is no white space: the paragraph, shown without it, fails as hidden text, and the join's fix passes it too.
    ['U+2060', '97⁠%', `the paragraph "${S1} ${S2.replace('97 %', '97%')}" holds a hidden character`],
  ])('2: a join with %s fails, and the sentence written as its fix says passes', async (_, join, refused) => {
    const sentence = S2.replace('97 %', join);
    const [first] = await details(body(`${S1} ${sentence}`, { raw: true }));
    expect(first?.startsWith(`figure-chart: body: ${refused}`)).toBe(true);
    // The fix: the figure, one ordinary or no-break space, and %, in place of the join.
    for (const space of [' ', ' '])
      expect(await details(body(`${S1} ${sentence.replace(join, `97${space}%`)}`, { raw: true }))).toEqual([]);
  });
  it.each<[string, string, readonly string[], FigureContext['rows']?]>([
    [
      '1: no shape',
      para('It fell 50 %.'),
      [
        `figure-chart: body: "It fell 50 %." holds a figure "50 %" and matches neither shape of a chart's section${R(5)}`,
      ],
    ],
    [
      '2: a wrong join, the whole numeral quoted',
      body(`${S1} ${S2.replace('97 %', '97\n%')}`, { raw: true }),
      [`figure-chart: body: "97U+000A %" in "${S1} ${S2}" ${JOIN}${R(5)}`],
    ],
    [
      '3: a code block',
      para('```\nnote\n```'),
      [`figure-chart: body: the code block "note" sits in the chart's section, which holds no code block${R(5)}`],
    ],
    [
      '4: a heading',
      body(undefined, { intro: `## Falls since May\n\n${INTRO}` }),
      [`figure-chart: body: the heading "Falls since May" holds a month "May" in the chart's section${R(5)}`],
    ],
    [
      '5: marks',
      after('*Each* fall is 1 of 9.'),
      [
        `figure-chart: body: the paragraph "${S1} ${S2} Each fall is 1 of 9." holds emphasis beside a figure "4" in the chart's section, which reads plain text only${R(5)}`,
        ...['Bitcoin', 'Ethereum', 'Chainlink', 'Solana'].map(
          (name) =>
            `figure-unstated: body: the chart draws a fall of ${name} that no sentence of its section states${R(5)}`,
        ),
      ],
    ],
    [
      '5: two marks, an English list',
      after('`Each` fall is 1 of 9.\\\nAgain.'),
      [
        `figure-chart: body: the paragraph "${S1} ${S2} Each fall is 1 of 9. Again." holds a code span and a hard break beside a figure "4" in the chart's section, which reads plain text only${R(5)}`,
        ...['Bitcoin', 'Ethereum', 'Chainlink', 'Solana'].map(
          (name) =>
            `figure-unstated: body: the chart draws a fall of ${name} that no sentence of its section states${R(5)}`,
        ),
      ],
    ],
    [
      '5: three marks, with the serial comma',
      after('**Each** fall is `1` of 9.\\\nAgain.'),
      [
        `figure-chart: body: the paragraph "${S1} ${S2} Each fall is 1 of 9. Again." holds strong text, a code span, and a hard break beside a figure "4" in the chart's section, which reads plain text only${R(5)}`,
        ...['Bitcoin', 'Ethereum', 'Chainlink', 'Solana'].map(
          (name) =>
            `figure-unstated: body: the chart draws a fall of ${name} that no sentence of its section states${R(5)}`,
        ),
      ],
    ],
    [
      '6: no rows',
      body(),
      [
        `figure-chart: body: the chart's rows or the coin catalogue did not load, so the chart's section cannot be read${R(5)}`,
      ],
      null,
    ],
    [
      '7: B on a coin without rows',
      after('In the chart, Cardano had 1 fall of more than 50 % between 2018 and 2022.'),
      [
        `figure-chart: body: "Cardano" in "In the chart, Cardano had 1 fall of more than 50 % between 2018 and 2022." names a coin the chart draws no fall of${R(6)}`,
      ],
    ],
    [
      '8: B holds for none',
      body(`In the chart, bitcoin had 1 fall of more than 95 % between 2011 and 2022. ${S2}`),
      [
        `figure-chart: body: "more than 95 %" in "In the chart, bitcoin had 1 fall of more than 95 % between 2011 and 2022." holds for none of bitcoin's falls in the chart between 2011 and 2022${R(6)}`,
        `figure-unstated: body: the chart draws a fall of Bitcoin that no sentence of its section states${R(5)}`,
      ],
    ],
    [
      '9: the count',
      body(`In the chart, bitcoin had 5 falls of more than 75 % between 2011 and 2022. ${S2}`),
      [
        `figure-chart: body: "5 falls" in "In the chart, bitcoin had 5 falls of more than 75 % between 2011 and 2022." is not how many of bitcoin's falls in the chart are more than 75 % between 2011 and 2022${R(6)}`,
      ],
    ],
    [
      '10: the years',
      body(`In the chart, bitcoin had 4 falls of more than 75 % between 2010 and 2024. ${S2}`),
      [
        `figure-chart: body: "between 2010 and 2024" in "In the chart, bitcoin had 4 falls of more than 75 % between 2010 and 2024." does not run from the year of the first high to the year of the last low of the falls it counts${R(6)}`,
      ],
    ],
    [
      '11: E on a coin without rows',
      E('Solana 97 %, and Cardano 97 %.'),
      [
        `figure-chart: body: "Cardano" in "Ether fell 94 % and 82 %, Chainlink 89 % and 91 %, Solana 97 %, and Cardano 97 %." names a coin the chart draws no fall of${R(5)}`,
      ],
    ],
    [
      '12: a wrong value',
      E('and Solana 96 %.'),
      [
        `figure-chart: body: "96 %" in "${s2.replace('97', '96')}" is not Solana's fall at that place in the chart's order${R(5)}`,
      ],
    ],
    [
      '13: beyond the rows',
      body(`${S1} Ether fell 94 %, 82 %, and 63 %, Chainlink 89 % and 91 %, and Solana 97 %.`),
      [
        `figure-chart: body: "63 %" in "${nb('Ether fell 94 %, 82 %, and 63 %, Chainlink 89 % and 91 %, and Solana 97 %.')}" names a fall of Ether that the chart does not draw or a B sentence already counts${R(5)}`,
      ],
    ],
    [
      '14: a coin no sentence states',
      body(`${S1} Ether fell 94 % and 82 %, and Chainlink 89 % and 91 %.`),
      [`figure-unstated: body: the chart draws a fall of Solana that no sentence of its section states${R(5)}`],
    ],
  ])('%s', async (_, source, expected, rows = ROWS) => {
    expect(await details(source, rows)).toEqual(expected);
  });

  // C3 of #370: every quoted text names a refused joiner by its code point, so that it never reads as a space.
  it.each([
    [
      'a marked paragraph whose figure follows U+202F',
      para('*Each* fall is 4 %.'),
      `figure-chart: body: the paragraph "Each fall is 4U+202F %." holds emphasis beside a figure "4U+202F %" in the chart's section, which reads plain text only${R(5)}`,
    ],
    [
      'a sentence holding U+2009 that matches neither shape',
      para('It fell 50 %.'),
      `figure-chart: body: "It fellU+2009 50 %." holds a figure "50 %" and matches neither shape of a chart's section${R(5)}`,
    ],
    [
      'a heading holding U+3000',
      body(undefined, { intro: `## Falls　since May\n\n${INTRO}` }),
      `figure-chart: body: the heading "FallsU+3000 since May" holds a month "May" in the chart's section${R(5)}`,
    ],
  ])('names the hidden character in %s', async (_, source, expected) => {
    expect(await details(source)).toEqual([expected]);
  });

  it('1: a translation names its language', async () => {
    const [first] = await problemsOf(body(), ROWS, { language: 'de' });
    expect(first?.detail).toBe(
      `body: "A monthly plan sets when you buy." is not a sentence de's list holds and matches neither shape of a chart's section, and de has no shapes for a chart's section yet; list it in LISTED in packages/content/src/module-figures.ts in a reviewed pull request${R(5)}`,
    );
  });
});
