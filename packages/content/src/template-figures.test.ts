import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { sentencesOf, shapeOf } from './template-figures.ts';
import { type ContentFile, validateContent } from './validate.ts';

// A template's figures against its rows and split (docs/CONTENT-STYLE.md §4, R1 to R4), through the content gate on
// literal files: the split 40/30/15/15 and the rows BTC 78, ETH 83, SOL 97 and LINK 91.
const { $comment: _, ...allow } = allowList;
const options = { today: '2026-10-17', allow };
const PATH = 'packages/content/templates/four.json';
const coin = (id: string, name: string) => ({ id, name, geckoId: name.toLowerCase(), decimals: 4 });
const row = (id: string, fall: string) => ({
  coin: id,
  high: '2021-11-10',
  low: '2022-11-21',
  fall,
  source: `https://www.bitstamp.net/api/v2/ohlc/${id.toLowerCase()}usd/?step=86400`,
  publisher: 'Bitstamp',
  accessed: '2026-10-16',
});
const four = (explanation: string) => ({
  id: 'four',
  name: 'Four coins',
  oneLine: 'Four coins, bought each month and held.',
  riskLabel: 'Very high risk',
  explanation,
  coins: [coin('BTC', 'Bitcoin'), coin('ETH', 'Ethereum'), coin('SOL', 'Solana'), coin('LINK', 'Chainlink')],
  split: { BTC: '40', ETH: '30', SOL: '15', LINK: '15' },
  sellWindow: null,
  references: {},
  drawdowns: [row('BTC', '78'), row('ETH', '83'), row('SOL', '97'), row('LINK', '91')],
  lastReviewed: '2026-10-16',
  reviewedBy: 'owner',
});
const OURS = /^(?:figure-|drawdown-coins$)/;
const problemsOf = (files: ContentFile[]) =>
  validateContent(files, options).filter((problem) => OURS.test(problem.code));
const run = (explanation: string) => problemsOf([{ path: PATH, json: four(explanation) }]);
const codes = (explanation: string) => run(explanation).map((problem) => problem.code);
const ruled = (explanation: string) =>
  run(explanation).map(
    ({ code, detail }) => `${code} ${/; (R[1-4]) \(docs\/CONTENT-STYLE\.md §4\)$/.exec(detail)?.[1]}`,
  );
const D = (id: string) => `from its high on {date:drawdowns.${id}.high} to its low on {date:drawdowns.${id}.low}`;
const live = (name: string) => JSON.parse(readFileSync(new URL(`../templates/${name}`, import.meta.url), 'utf8'));
const LIVE = readdirSync(new URL('../templates/', import.meta.url));

describe('templateFigureProblems: the closed shapes pass (the judge’s must-pass list)', () => {
  it.each([
    `Solana fell 97 % ${D('SOL')}.`,
    'From its high on {date:drawdowns.SOL.high} to its low on {date:drawdowns.SOL.low}, Solana fell 97 %.',
    `Solana fell more than 96 % ${D('SOL')}.`,
    `Solana fell 97% ${D('SOL')}.`,
    `Solana fell 97 % ${D('SOL')}.`,
    `Solana fell 97 % ${D('SOL')}.`,
    `Solana fell −97 % ${D('SOL')}.`,
    'It splits each monthly amount 40 % Bitcoin, 30 % Ethereum, 15 % Solana, and 15 % Chainlink.',
    'What can go wrong: 15 % of every amount goes into Solana.',
    'Solana: 15 % of each amount.',
    'Bitcoin takes 40 % of each amount; 30 % goes into Ethereum.',
    `Bitcoin takes 40 % of each amount. Solana fell 97 % ${D('SOL')}.`,
    'It splits each amount 40 % Bitcoin and 30 % Ethereum.',
    'The percentage of each amount stays as set.',
  ])('%s', (explanation) => {
    expect(run(explanation)).toEqual([]);
  });

  it('passes every live template', () => {
    for (const name of LIVE) {
      expect(problemsOf([{ path: `packages/content/templates/${name}`, json: live(name) }])).toEqual([]);
    }
  });

  it('reads each of the 8 live sentences with a figure as its named shape', () => {
    const named = LIVE.flatMap((name) => {
      const template = live(name);
      return sentencesOf(template.explanation)
        .filter((sentence) => /%|\{date:drawdowns\./.test(sentence))
        .map((sentence) => `${name} ${shapeOf(template, sentence)} ${sentence.slice(0, 26)}`);
    });
    expect(named).toEqual([
      'accumulate.json S1 What can go wrong: 20 % of',
      'accumulate.json F1 Solana fell 97 % from its ',
      'btc-only-hold.json F1 Bitcoin fell 78 % from its',
      'cycle-plan.json S4 It splits each monthly amo',
      'cycle-plan.json F1 Solana fell 97 % from its ',
      'cycle-plan.json F1 Chainlink fell 91 % from i',
      'two-coins.json F1 Bitcoin fell 78 % from its',
      'two-coins.json F1 Ethereum fell 82 % from it',
    ]);
  });
});

describe('sentencesOf', () => {
  it('splits after a stop and whitespace, and at a blank line, whatever comes next', () => {
    expect(sentencesOf('Each amount buys 4 coins. 3 years ago it fell.\n\nnext one? yes! approx. 97 %')).toEqual([
      'Each amount buys 4 coins.',
      '3 years ago it fell.',
      'next one?',
      'yes!',
      'approx.',
      '97 %',
    ]);
    expect(sentencesOf('A line\n\nB line')).toEqual(['A line', 'B line']);
  });
});

describe('templateFigureProblems: figure-mismatch', () => {
  it('refuses a fall other than its row’s, and a bound its row does not meet (R2)', () => {
    for (const figure of ['96 %', '98 %', 'more than 97 %', 'more than 98 %']) {
      expect(ruled(`Solana fell ${figure} ${D('SOL')}.`)).toEqual(['figure-mismatch R2']);
    }
  });

  it('refuses a share other than the split’s (R3)', () => {
    expect(ruled('Bitcoin takes 45 % of each amount.')).toEqual(['figure-mismatch R3']);
    expect(ruled('It splits each amount 40 % Bitcoin, 15 % Ethereum, and 30 % Solana.')).toEqual([
      'figure-mismatch R3',
      'figure-mismatch R3',
    ]);
  });
});

describe('templateFigureProblems: figure-form', () => {
  it.each(['less than 98 %', 'over 97 %', 'about 97 %', 'at least 96 %', 'up to 98 %', '96–97 %'])(
    'refuses a dated fall written %s (R1, D14 of #318)',
    (figure) => {
      expect(ruled(`Solana fell ${figure} ${D('SOL')}.`)).toEqual(['figure-form R1']);
    },
  );

  it.each([
    `Ethereum, 83 % of each amount, fell 83 % ${D('ETH')}.`,
    `Ethereum takes 83 % of each amount ${D('ETH')}.`,
    `Solana fell 97 % ${D('SOL')}; Chainlink fell too.`,
    'Solana fell 97 % from its high on {date:drawdowns.SOL.high} to its low on {date:drawdowns.ETH.low}.',
    'Solana fell 97 % from its high on {date:drawdowns.SOL.high}.',
    'Solana fell 97 % from its high on {date:drawdowns.SOL.high} to its low on {date:drawdowns.SOL.high}.',
    `Ethereum’s high and low came ${D('ETH')}.`,
    `Solana fell 97 %, or 97 % again, ${D('SOL')}.`,
    `solana fell 97 % ${D('SOL')}.`,
  ])('refuses a dated sentence that matches neither F1 nor F2: %s (R1)', (explanation) => {
    expect(ruled(explanation)).toEqual(['figure-form R1']);
  });

  it('refuses a fall that names no coin, so no coin crosses a sentence (R1, amendment 2)', () => {
    expect(ruled(`It fell 97 % ${D('SOL')}.`)).toEqual(['figure-form R1']);
    expect(ruled(`Bitcoin takes 40 % of each amount. It fell 83 % ${D('ETH')}.`)).toEqual(['figure-form R1']);
  });

  it('refuses another coin in a dated fall (R2)', () => {
    expect(ruled(`Bitcoin fell 83 % ${D('ETH')}.`)).toEqual(['figure-form R2']);
    expect(run(`Bitcoin fell 83 % ${D('ETH')}.`)[0]?.detail).toContain(
      '"Bitcoin" is named in the sentence that dates ETH\'s fall of 83 %',
    );
  });

  it('refuses a coin given two shares (R3)', () => {
    expect(ruled('Bitcoin takes 40 % of each amount; 40 % goes into Bitcoin.')).toEqual(['figure-form R3']);
  });
});

describe('templateFigureProblems: figure-unclassed (R4: any other percentage fails)', () => {
  it.each([
    ['A fall of less than 50 % can come again.', 1],
    [`Bitcoin fell 78 % ${D('BTC')}. A fall of 40 % can come again.`, 1],
    ['Solana fell 15 %.', 1],
    ['Ethereum went down 30 %.', 1],
    ['Bitcoin and Ethereum take 40 % of each amount.', 1],
    ['Bitcoin takes less than 50 % of each amount.', 1],
    ['Bitcoin is 40 % of each amount; of the rest, 40 % goes to one coin: Ethereum.', 1],
    ['Bitcoin is 40 % of each amount. Of the rest of each amount, 40 % goes to one coin: Ethereum.', 2],
    ['Solana takes 15 % of each amount. The largest coin takes 15 % of each amount too.', 1],
    ['Solana fell 97 percent.', 1],
    ['Solana fell 97 per cent.', 1],
    ['Solana fell 15 per cent.', 1],
    ['Solana fell 15 per cent.', 1],
    ['Solana fell 15 per‑cent.', 1],
    ['Solana fell 15 per-cent.', 1],
    ['Solana fell 15 percentage points.', 1],
    ['Solana fell 15 percentage points.', 1],
    ['solana: 15 % of each amount.', 1],
    ['It splits each monthly amount 40 % Bitcoin, 30 % Ethereum, 15 % Solana and 15 % Chainlink.', 1],
    ['It splits each amount 40 % Bitcoin, and 30 % Ethereum.', 1],
    ['Bitcoin takes 40 % of each amount; 30 % goes to Ethereum.', 1],
  ])('%s', (explanation, count) => {
    expect(ruled(explanation)).toEqual(Array(count).fill('figure-unclassed R4'));
  });
});

describe('the round-2 leaks (the stated requirement of #334)', () => {
  const at = (dated: boolean) => (dated ? ` ${D('SOL')}` : '');
  it.each([
    [`Each amount buys 4 coins. 3 years ago Solana fell 15 %.`, 'figure-unclassed R4'],
    [`Bitcoin is 40 % of each amount, give or take.`, 'figure-unclassed R4'],
    ['Solana fell (roughly): 97 %', 'figure-unclassed R4'],
    [`Solana fell (roughly): 97 % ${D('SOL')}`, 'figure-form R1'],
    ...[true, false].flatMap((dated) =>
      [
        `Roughly, Solana fell 97 %${at(dated)}.`,
        `Solana roughly fell 97 %${at(dated)}.`,
        `Solana fell, give or take: 97 %${at(dated)}.`,
        `Solana fell between ninety and 97 %${at(dated)}.`,
      ].map((text): [string, string] => [text, dated ? 'figure-form R1' : 'figure-unclassed R4']),
    ),
  ])('%s: %s', (explanation, verdict) => {
    expect(ruled(explanation)).toEqual([verdict]);
  });
});

describe('the 25o mutations fail closed on the live templates', () => {
  const mutated = (name: string, from: string, to: string) => {
    const template = live(name);
    expect(template.explanation).toContain(from);
    const json = { ...template, explanation: template.explanation.replace(from, to) };
    return problemsOf([{ path: `packages/content/templates/${name}`, json }]).map(({ code }) => code);
  };
  it.each([
    ['accumulate.json', 'Solana fell 97 %', 'Solana fell approximately 97 %', 'figure-form'],
    ['accumulate.json', 'Solana fell 97 %', 'Solana fell ~97 %', 'figure-form'],
    ['accumulate.json', 'Solana fell 97 %', 'Solana fell between 90 and 97 %', 'figure-form'],
    ['accumulate.json', 'fell 97 % from', 'fell 97 % or so from', 'figure-form'],
    ['accumulate.json', 'Solana fell 97 %', 'Solana fell approx. 97 %', 'figure-form'],
    ['accumulate.json', '20 % of every amount', 'roughly 20 % of every amount', 'figure-unclassed'],
    ['cycle-plan.json', '40 % Bitcoin', '≈40 % Bitcoin', 'figure-unclassed'],
  ])('%s: %s to %s', (name, from, to, code) => {
    expect(mutated(name, from, to)).toEqual([code]);
  });
});

describe('drawdown-coins (schema/template.ts: the rows in the order of coins)', () => {
  const accumulate = live('accumulate.json');
  const [btc, eth, sol] = accumulate.drawdowns;
  const path = 'packages/content/templates/accumulate.json';
  const rows = (drawdowns: unknown[]) => problemsOf([{ path, json: { ...accumulate, drawdowns } }]);

  it('passes the live rows and refuses a row dropped, the rows reordered, or a row doubled', () => {
    expect(rows([btc, eth, sol])).toEqual([]);
    for (const drawdowns of [
      [btc, sol],
      [sol, btc, eth],
      [btc, eth, eth, sol],
    ]) {
      expect(rows(drawdowns).map((problem) => problem.code)).toEqual(['drawdown-coins']);
    }
  });
});

describe('the details (D17 of #318: a datum written in passes, one step past it fails)', () => {
  const datum = (detail: string) => Number(/ of (\d+) %/.exec(detail)?.[1]);

  it.each([
    [(n: number) => `Solana fell ${n} % ${D('SOL')}.`, 96, 97],
    [(n: number) => `Solana fell ${n} % ${D('SOL')}.`, 98, 97],
    [(n: number) => `Bitcoin takes ${n} % of each amount.`, 45, 40],
  ])('names the datum of a mismatch (%#)', (write, start, expected) => {
    const [problem] = run(write(start));
    expect(problem?.code).toBe('figure-mismatch');
    const n = datum(problem?.detail ?? '');
    expect(n).toBe(expected);
    expect(run(write(n))).toEqual([]);
    expect(codes(write(n + 1))).toEqual(['figure-mismatch']);
  });

  it('a bound on the datum of a fall passes one step below it and fails at it', () => {
    const write = (n: number) => `Solana fell more than ${n} % ${D('SOL')}.`;
    const [problem] = run(write(97));
    expect(problem?.detail).toContain('"more than 97 %" is not below SOL\'s fall of 97 %');
    const n = datum(problem?.detail ?? '');
    expect(run(write(n - 1))).toEqual([]);
    expect(codes(write(n))).toEqual(['figure-mismatch']);
  });

  it('quote the sentence, name the figure, its coin and datum, end with the rule and print no text to write', () => {
    const cases: [string, string[]][] = [
      [`Solana fell 96 % ${D('SOL')}.`, ['"96 %"', "SOL's fall of 97 %", '"more than N %"']],
      ['Bitcoin takes 45 % of each amount.', [`"45 %" is not BTC's share of 40 %`]],
      [`Solana fell about 97 % ${D('SOL')}.`, ['"97 %"', "SOL's fall of 97 %", 'neither F1 nor F2']],
      [`Ethereum’s high and low came ${D('ETH')}.`, ["ETH's fall of 83 %"]],
      [
        `Solana fell 97 % from its high on {date:drawdowns.SOL.high} to its low on {date:drawdowns.ETH.low}.`,
        ["SOL's fall of 97 % and ETH's fall of 83 %"],
      ],
      ['Bitcoin takes 40 % of each amount; 30 % goes into Bitcoin.', ['"30 %"', '"Bitcoin"', "BTC's share of 40 %"]],
      ['Solana fell 15 %.', ['"15 %"', 'SOL: fall 97 %, share 15 %']],
      ['Solana fell 15 per cent.', ['"15 per cent"', 'SOL: fall 97 %, share 15 %']],
      ['A fall of 40 % can come again.', ['"40 %" matches no shape']],
    ];
    for (const [explanation, parts] of cases) {
      const problems = run(explanation);
      expect(problems).toHaveLength(1);
      const detail = problems[0]?.detail ?? '';
      expect(detail).toMatch(/^explanation: /);
      expect(detail).toContain(`in "${explanation}"`);
      expect(detail).toMatch(/; R[1-4] \(docs\/CONTENT-STYLE\.md §4\)$/);
      expect(detail).not.toMatch(/\bwrite\b/i);
      for (const part of parts) expect(detail).toContain(part);
    }
    const end = (sentence: string, rule: number) => ` in "${sentence}"; R${rule} (docs/CONTENT-STYLE.md §4)`;
    const exact: [string, string][] = [
      [
        `Solana fell 96 % ${D('SOL')}.`,
        `explanation: "96 %" is neither SOL's fall of 97 % nor a bound below it written "more than N %"`,
      ],
      [
        `Solana fell about 97 % ${D('SOL')}.`,
        `explanation: "97 %" beside the dates of SOL's fall of 97 % matches neither F1 nor F2`,
      ],
      [
        `Ethereum’s high and low came ${D('ETH')}.`,
        `explanation: the dates of ETH's fall of 83 % sit in no F1 or F2 sentence`,
      ],
      [`Solana fell 97 % ${D('DOGE')}.`, `explanation: "97 %" carries the dates of DOGE, which has no drawdown row`],
    ];
    for (const [explanation, what] of exact) {
      const rule = what.includes('neither SOL') ? 2 : 1;
      expect(run(explanation)[0]?.detail).toBe(`${what}${end(explanation, rule)}`);
    }
  });

  it('names a coin with no share in the split as such', () => {
    const json = { ...four('Chainlink: 15 % of each amount.'), split: { BTC: '40', ETH: '30', SOL: '30' } };
    const details = problemsOf([{ path: PATH, json }]).map((problem) => problem.detail);
    expect(details).toContain(
      `explanation: "15 %" is not LINK, which has no share in "Chainlink: 15 % of each amount."; R3 (docs/CONTENT-STYLE.md §4)`,
    );
  });
});
