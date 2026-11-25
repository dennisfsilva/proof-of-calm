import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import catalogue from '../coins.json' with { type: 'json' };
import { type FigureContext, moduleContext, moduleFigureProblems } from './module-figures.ts';

// docs/CONTENT-STYLE.md §4 and §10: German's two shapes of a chart's section (design check D5, #494), its spellings,
// its single percent joiner and its closed list, against the literal coins and rows module-figures-pt.test.ts
// freezes. Each case states its codes in order; acceptances first, then refusals, closest first.
const at = 'packages/content/i18n/de/learn/risk-honestly.mdx';
const NB = String.fromCodePoint(0xa0);
const NNB = String.fromCodePoint(0x202f);
const UML = String.fromCodePoint(0x308);
const p = (n: number | string) => `${n}${NB}%`;
const k = (n: number, noun: string) => `${n}${NB}${noun}`;
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
// The verdict's list, character for character.
const LISTED = [
  'Ein monatlicher Plan legt den Tag jedes Kaufs fest.',
  'Er begrenzt nicht, wie tief ein Kurs fallen kann, und ein Coin kann fast seinen ganzen Wert verlieren.',
  'Jeder Balken unten zeigt einen Rückgang eines Coins, von einem Zyklushoch zum tiefsten Kurs danach.',
];
// The intro as a translator wraps it in the source.
const INTRO = [
  LISTED[0],
  LISTED[1]?.replace('und ein Coin', 'und ein\nCoin'),
  LISTED[2]?.replace('von einem Zyklushoch', 'von einem\nZyklushoch'),
].join(' ');
const B = (c = 'Bitcoin', n = 4, t = 75, y = '2011 bis 2022') =>
  `Von ${y} hatte ${c} im Diagramm ${k(n, n === 1 ? 'Rückgang' : 'Rückgänge')} um mehr als ${p(t)}.`;
const BR = B();
const E_TAIL = `Chainlink um ${p(89)} und ${p(91)} und Solana um ${p(97)}.`;
const ER = `Ethereum fiel um ${p(94)} und ${p(82)}, ${E_TAIL}`;
const page = (chart: string, intro = INTRO) =>
  `${intro}\n\n<Chart />\n\n${chart}\n\n## Andere Wege, die Coins zu verlieren\n\nText.\n`;
const bWith = (s: string) => page(`${s} ${ER}`);
const eWith = (s: string) => page(`${BR} ${s}`);
const ET = (head: string) => eWith(`${head}, ${E_TAIL}`);

type Coins = FigureContext['coins'];
async function problemsOf(source: string, language = 'de', rows: FigureContext['rows'] = ROWS, coins: Coins = COINS) {
  const { problem, page: blocks } = await checkModuleBody(source, at);
  expect(problem).toBeNull();
  return moduleFigureProblems(at, blocks, moduleContext({ chart: 'drawdowns-bar' }, language, { rows, coins }));
}
const codes = async (source: string, rows?: FigureContext['rows'], coins?: Coins) =>
  (await problemsOf(source, 'de', rows, coins)).map(({ code }) => code);
const details = async (source: string, language?: string) =>
  (await problemsOf(source, language)).map(({ detail }) => detail);
const FC = 'figure-chart';
const FU = 'figure-unstated';
const FJ = 'figure-join';
const R = (n: number) => `; R${n} (docs/CONTENT-STYLE.md §4)`;
const LIST_IT = 'list it in LISTED in packages/content/src/module-figures.ts in a reviewed pull request';

// Every catalogue coin with one row of its own, a distinct whole fall each.
const ALL = catalogue.map(({ id, name }, i) => ({ id, name, fall: 10 + i }));
const ALL_COINS = catalogue.map(({ id, name }) => ({ id, name }));
const ALL_ROWS = ALL.map(({ id, fall }) => row(id, '2020-01-01', '2020-06-01', String(fall)));
const [first, ...others] = ALL;
const middle = others.slice(0, -1).map(({ name, fall }) => `${name} um ${p(fall)}`);
const last = others.at(-1);
const allOne = `${first?.name} fiel um ${p(first?.fall ?? 0)}, ${middle.join(', ')} und ${last?.name} um ${p(last?.fall ?? 0)}.`;
const allEach = ALL.map(({ name, fall }) => `${name} fiel um ${p(fall)}.`).join(' ');

describe("German's chart section passes", () => {
  it.each<[string, string]>([
    [
      'the real section: the three listed, B and E, wrapped in the source',
      page(`${BR} Ethereum fiel um\n${p(94)} und ${p(82)}, ${E_TAIL}`),
    ],
    [
      'a one-fall B beside the real B',
      page(
        `${BR} ${B('Solana', 1, 90, '2021 bis 2022')} Ethereum fiel um ${p(94)} und ${p(82)} und Chainlink um ${p(89)} und ${p(91)}.`,
      ),
    ],
    [
      'a one-year span, then E with three, two and one figures',
      page(
        `${B('Bitcoin', 1, 90, '2011 bis 2011')} Bitcoin fiel um ${p(87)}, ${p(84)} und ${p(78)}, Ethereum um ${p(94)} und ${p(82)}, ${E_TAIL}`,
      ),
    ],
    [
      'E alone, four figures for one coin',
      page(`Bitcoin fiel um ${p(94)}, ${p(87)}, ${p(84)} und ${p(78)}, Ethereum um ${p(94)} und ${p(82)}, ${E_TAIL}`),
    ],
    [
      'two E sentences',
      page(
        `${BR} Ethereum fiel um ${p(94)} und ${p(82)}. Chainlink fiel um ${p(89)} und ${p(91)} und Solana um ${p(97)}.`,
      ),
    ],
    [
      'two B sentences, B and E in two paragraphs',
      page(
        `${BR} ${B('Ethereum', 2, 80, '2018 bis 2022')}\n\nChainlink fiel um ${p(89)} und ${p(91)} und Solana um ${p(97)}.`,
      ),
    ],
  ])('%s: []', async (_, source) => {
    expect(await codes(source)).toEqual([]);
  });

  it.each([
    ['in one E', allOne],
    ['each opening its own E', allEach],
  ])('every catalogue coin as the catalogue writes it, %s: []', async (_, chart) => {
    expect(await codes(page(chart), ALL_ROWS, ALL_COINS)).toEqual([]);
  });

  it("lists exactly the verdict's three sentences, each in NFC, and the intro splits into exactly them", async () => {
    const { listed } = moduleContext({ chart: 'drawdowns-bar' }, 'de', { rows: ROWS, coins: COINS });
    expect(listed).toEqual(LISTED);
    for (const sentence of listed) expect(sentence).toBe(sentence.normalize('NFC'));
    // Each listed sentence alone in the intro passes, so cutting any one from the list fails here.
    for (const sentence of LISTED) expect(await codes(page(`${BR} ${ER}`, sentence))).toEqual([]);
  });
});

describe("German's chart section refuses", () => {
  it.each<[string, string, readonly string[]]>([
    ['U+0020 before % in E', ET(`Ethereum fiel um 94 % und ${p(82)}`), [FC]],
    [
      'U+0020 before % in B',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als 75 %.`),
      [FC],
    ],
    [
      'a line wrap before %',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als 75\n%.`),
      [FC],
    ],
    [
      'U+0020 at the count',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm 4 Rückgänge um mehr als ${p(75)}.`),
      [FJ],
    ],
    [
      'a line wrap at the count',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm 4\nRückgänge um mehr als ${p(75)}.`),
      [FJ],
    ],
    [
      'U+202F at the count',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm 4${NNB}Rückgänge um mehr als ${p(75)}.`),
      [FJ],
    ],
    [
      'a comma before und between coins',
      eWith(`Ethereum fiel um ${p(94)} und ${p(82)}, Chainlink um ${p(89)} und ${p(91)}, und Solana um ${p(97)}.`),
      [FC, FU, FU, FU],
    ],
    [
      'a comma before und between figures',
      page(`Bitcoin fiel um ${p(94)}, ${p(87)}, ${p(84)}, und ${p(78)}, Ethereum um ${p(94)} und ${p(82)}, ${E_TAIL}`),
      [FC, FU, FU, FU, FU],
    ],
    [
      "designer A's order, the years last",
      bWith(`Im Diagramm hatte Bitcoin ${k(4, 'Rückgänge')} um mehr als ${p(75)} zwischen 2011 und 2022.`),
      [FC, FU],
    ],
    [
      'zwischen … und fronted',
      bWith(`Zwischen 2011 und 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'the years after the coin',
      bWith(`Im Diagramm hatte Bitcoin von 2011 bis 2022 ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'a comma after the span',
      bWith(`Von 2011 bis 2022, hatte Bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'B without im Diagramm',
      bWith(`Von 2011 bis 2022 hatte Bitcoin ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'an article in B',
      bWith(`Von 2011 bis 2022 hatte der Bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    ['an article in E', ET(`Das Ethereum fiel um ${p(94)} und ${p(82)}`), [FC, FU, FU, FU]],
    [
      'Rückgängen',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgängen')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'Rückgang with 4',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgang')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'Rückgänge with 1',
      page(
        `${BR} Von 2021 bis 2022 hatte Solana im Diagramm ${k(1, 'Rückgänge')} um mehr als ${p(90)}. Ethereum fiel um ${p(94)} und ${p(82)} und Chainlink um ${p(89)} und ${p(91)}.`,
      ),
      [FC, FU],
    ],
    [
      'von mehr als',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, 'Rückgänge')} von mehr als ${p(75)}.`),
      [FC, FU],
    ],
    [
      'a bare fiel',
      eWith(`Ethereum fiel ${p(94)} und ${p(82)}, Chainlink ${p(89)} und ${p(91)} und Solana ${p(97)}.`),
      [FC, FU, FU, FU],
    ],
    [
      'um dropped in a later clause',
      eWith(`Ethereum fiel um ${p(94)} und ${p(82)}, Chainlink ${p(89)} und ${p(91)} und Solana um ${p(97)}.`),
      [FC, FU, FU, FU],
    ],
    ['um repeated in one coin', ET(`Ethereum fiel um ${p(94)} und um ${p(82)}`), [FC, FU, FU, FU]],
    [
      'a second fiel',
      eWith(`Ethereum fiel um ${p(94)} und ${p(82)}, Chainlink fiel um ${p(89)} und ${p(91)} und Solana um ${p(97)}.`),
      [FC, FU, FU, FU],
    ],
    ['Ether for ETH', ET(`Ether fiel um ${p(94)} und ${p(82)}`), [FC, FU, FU, FU]],
    [
      'a lower-case coin in B',
      bWith(`Von 2011 bis 2022 hatte bitcoin im Diagramm ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    ['a lower-case coin in E', eWith(ER.replace('Chainlink', 'chainlink')), [FC, FU, FU, FU]],
    ['U+00A0 after a comma', eWith(`Ethereum fiel um ${p(94)} und ${p(82)},${NB}${E_TAIL}`), [FC, FU, FU, FU]],
    ['U+202F before %', ET(`Ethereum fiel um 94${NNB}% und ${p(82)}`), [FC, FC, FU, FU, FU]],
    [
      'a decomposed ü and ä',
      bWith(`Von 2011 bis 2022 hatte Bitcoin im Diagramm ${k(4, `Ru${UML}ckga${UML}nge`)} um mehr als ${p(75)}.`),
      [FC, FU],
    ],
    ["§10's own example with a year", ET(`Ethereum fiel 2018 um ${p(94)} und ${p(82)}`), [FC, FU, FU, FU]],
    ['a wrong count', bWith(B('Bitcoin', 3)), [FC]],
    ['a reversed order', ET(`Ethereum fiel um ${p(82)} und ${p(94)}`), [FC, FC]],
    [
      'an unlisted first sentence',
      page(`${BR} ${ER}`, `Ein monatlicher Plan legt den Zeitpunkt der Käufe fest. ${LISTED[1]} ${LISTED[2]}`),
      [FC],
    ],
    [
      'wann Sie kaufen, unlisted',
      page(`${BR} ${ER}`, `Ein monatlicher Plan legt fest, wann Sie kaufen. ${LISTED[1]} ${LISTED[2]}`),
      [FC],
    ],
  ])('%s', async (_, source, expected) => {
    expect(await codes(source)).toEqual(expected);
  });

  it('names an ordinary space before % by its code point and the fix as one U+00A0', async () => {
    const e = `Ethereum fiel um 94 % und ${p(82)}, ${E_TAIL}`;
    expect(await details(eWith(e))).toEqual([
      `body: "94U+0020 %" in "${BR} ${e}" joins a figure to a sign; write the figure, one U+00A0, and %${R(5)}`,
    ]);
  });

  it('names an ordinary space at the count by its code point', async () => {
    const b = `Von 2011 bis 2022 hatte Bitcoin im Diagramm 4 Rückgänge um mehr als ${p(75)}.`;
    expect(await details(bWith(b))).toEqual([
      `body: the count "4" and its noun "Rückgänge" are joined by U+0020, not U+00A0, in "${b}"${R(6)}`,
    ]);
  });

  it('prints a decomposed character by its code points', async () => {
    const [detail] = await details(bWith(B('Bitcoin', 4, 75).replace('Rückgänge', `Ru${UML}ckga${UML}nge`)));
    expect(detail).toContain('RuU+0308 ckgaU+0308 nge');
    expect(detail).toContain('write it as B or E (docs/CONTENT-STYLE.md §10)');
  });

  it("quotes B's own span and threshold in R6's details", async () => {
    const wide = B('Bitcoin', 4, 75, '2010 bis 2024');
    expect(await details(bWith(wide))).toEqual([
      `body: "Von 2010 bis 2024" in "${wide}" does not run from the year of the first high to the year of the last low of the falls it counts${R(6)}`,
    ]);
    const [high] = await details(bWith(B('Bitcoin', 4, 95)));
    expect(high).toBe(
      `body: "mehr als ${p(95)}" in "${B('Bitcoin', 4, 95)}" holds for none of Bitcoin's falls in the chart between 2011 and 2022${R(6)}`,
    );
    const [count] = await details(bWith(B('Bitcoin', 3)));
    expect(count).toContain(`"3 Rückgänge" in "${B('Bitcoin', 3)}"`);
  });

  it('points an unlisted sentence to §10 and to LISTED', async () => {
    for (const sentence of [
      'Ein monatlicher Plan legt den Zeitpunkt der Käufe fest.',
      'Ein monatlicher Plan legt fest, wann Sie kaufen.',
    ])
      expect(await details(page(`${BR} ${ER}`, `${sentence} ${LISTED[1]} ${LISTED[2]}`))).toEqual([
        `body: "${sentence}" is not a sentence de's list holds and matches neither shape of a chart's section; write it as B or E (docs/CONTENT-STYLE.md §10), or ${LIST_IT}${R(5)}`,
      ]);
  });

  it('points a sentence with a trigger to §10 alone', async () => {
    const b = `Von 2011 bis 2022 hatte Bitcoin ${k(4, 'Rückgänge')} um mehr als ${p(75)}.`;
    const [first] = await details(bWith(b));
    expect(first).toBe(
      `body: "${b}" holds a figure "2011" and matches neither shape of a chart's section; write it as B or E (docs/CONTENT-STYLE.md §10)${R(5)}`,
    );
  });
});

describe('the other languages keep their own reading', () => {
  it('a language without shapes still fails closed, its intro too', async () => {
    const found = await problemsOf(page(`${BR} ${ER}`), 'fr');
    expect(found.map(({ code }) => code)).toEqual([FC, FC, FC, FC, FC, FU, FU, FU, FU]);
    expect(found[0]?.detail).toBe(
      `body: "${LISTED[0]}" is not a sentence fr's list holds and matches neither shape of a chart's section, and fr has no shapes for a chart's section yet; ${LIST_IT}${R(5)}`,
    );
  });

  it("a pt-PT refusal still names §9 and pt-PT's joiners", async () => {
    const [first] = await details(page(`${BR} ${ER}`), 'pt-PT');
    expect(first).toBe(
      `body: "${LISTED[0]}" is not a sentence pt-PT's list holds and matches neither shape of a chart's section; write it as B or E (docs/CONTENT-STYLE.md §9), or ${LIST_IT}${R(5)}`,
    );
    const pt = (await details(page('O ether caiu 94 % e 82 %.', ''), 'pt-PT')).filter((d) =>
      d.includes('joins a figure'),
    );
    expect(pt).toEqual([]);
  });
});
