import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import drawdowns from '../cycles/drawdowns.json' with { type: 'json' };
import facts from '../facts/education.json' with { type: 'json' };
import { parseModule } from './loaders/modules.ts';
import { moduleProblems } from './modules-validate.ts';
import { findBanned } from './style/banned.ts';

// docs/EDUCATION.md §2: Risk honestly. It passes the module gate on the day it was reviewed, draws the drawdowns
// chart before any other historic figure, quotes the chart's falls at its whole percent, and names Mt. Gox and FTX
// only as the subjects of dated, sourced events (docs/LEGAL.md §6 Q4).
const path = 'packages/content/learn/risk-honestly.mdx';
const source = readFileSync(new URL('../learn/risk-honestly.mdx', import.meta.url), 'utf8');
const context = { facts: new Map(facts.map((fact) => [fact.key, fact.lastReviewed])), today: '2026-11-09' };
const MONTH = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';
const BREAKS = [
  new RegExp(`\\d{1,2}[ \\n](?:${MONTH})`, 'gu'),
  new RegExp(`(?:${MONTH})[ \\n]\\d{4}`, 'gu'),
  /[ \n]%/gu,
  /\d[ \n](?:months|years|days|billion)/gu,
];

function read() {
  const parsed = parseModule(path, source);
  if (!parsed.ok) throw new Error(path);
  return { module: parsed.value, body: parsed.value.body.replace(/[ \n]+/gu, ' ') };
}

/** The falls of one coin in the chart, in its order, as the chart labels them. */
const falls = (coin: string) => drawdowns.drawdowns.filter((row) => row.coin === coin).map((row) => `${row.fall} %`);

describe('the Risk honestly module', () => {
  it('passes the module gate, with no banned word, reviewed by the owner', () => {
    const { module } = read();
    expect(moduleProblems({ path, source }, context)).toEqual([]);
    expect([module.title, module.idea, module.caveat].flatMap((text) => findBanned(text))).toEqual([]);
    expect(module.reviewedBy).toBe('owner');
    expect(module.lastReviewed).toBe('2026-11-09');
  });

  it('keeps each figure with its unit and each date whole', () => {
    expect(BREAKS.flatMap((rule) => read().module.body.match(rule) ?? [])).toEqual([]);
  });

  // EDUCATION §10: `facts` lets the review job flag the module when a fact it quotes goes stale. The falls in the
  // body rest on a (bitcoin) and b (the other coins), so both keys belong to the list.
  it('lists every fact whose figures its body quotes, the falls of a and b included', () => {
    const { module, body } = read();
    const quotes = [
      ['a.btc-drawdowns', /bitcoin fell \d+ %/u],
      ['b.alt-drawdowns', /Ether fell \d+ %/u],
    ] as const;
    const quoted = quotes.filter(([, figure]) => figure.test(body.replaceAll(' ', ' '))).map(([key]) => key);
    expect(quoted).toEqual(['a.btc-drawdowns', 'b.alt-drawdowns']);
    expect(quoted.filter((key) => !module.facts.includes(key))).toEqual([]);
  });

  it('names only the facts it quotes, among a to f and m', () => {
    const { module } = read();
    expect(module.chart).toBe('drawdowns-bar');
    expect(module.facts).toEqual([
      'a.btc-drawdowns',
      'b.alt-drawdowns',
      'd.mt-gox',
      'd.ftx',
      'f.leverage',
      'm.emergency-fund',
      'e.unknown-platforms',
      'e.romance-investment',
      'e.impersonation',
      'e.seed-phrase-requests',
      'e.profit-promises',
      'e.address-poisoning',
      'e.seed-phrase-never-asked',
    ]);
  });

  // Each scam pattern and the support sentence rests on a fact of its own, quoted from the ESAs' factsheet: the
  // module's words on the left, the factsheet's on the right. A pattern no source states leaves the module.
  it('rests each scam pattern and the support sentence on a fact of its own, from one dated source', () => {
    const { module, body } = read();
    const plain = body.replaceAll(' ', ' ');
    const patterns = [
      ['e.unknown-platforms', '- An exchange platform you had not heard of.', 'Unknown exchange platform.'],
      [
        'e.romance-investment',
        '- A stranger who builds trust, then steers the talk to investing.',
        'building trust using fake profiles. Gradually, they steer the conversation toward financial opportunities',
      ],
      [
        'e.impersonation',
        '- Someone posing as support, or as a company you know.',
        'pretending to be a trusted contact',
      ],
      [
        'e.seed-phrase-requests',
        '- Any request for your seed phrase.',
        'A request to send or share private keys and seed phrases',
      ],
      ['e.profit-promises', '- A promise of high returns with low risk.', 'promises of high returns and low risk'],
      [
        'e.address-poisoning',
        '- A look-alike address slipped into your history, so a copied address pays someone else.',
        'copy the wrong address from your wallet history',
      ],
      [
        'e.seed-phrase-never-asked',
        'Nobody from support ever asks for a seed phrase, so a request for one is a scam.',
        'Legitimate companies will never ask',
      ],
    ] as const;
    for (const [key, words, quote] of patterns) {
      const fact = facts.find((item) => item.key === key);
      expect(plain, key).toContain(words);
      expect(module.facts, key).toContain(key);
      expect(fact?.value, key).toContain(quote);
      expect([fact?.date, fact?.accessed, fact?.lastReviewed], key).toEqual(['2025-12-15', '2026-11-09', '2026-11-09']);
    }
    expect(new Set(patterns.map(([key]) => facts.find((item) => item.key === key)?.source)).size).toBe(1);
    expect(plain).not.toMatch(/weeks of messages|a balance you cannot withdraw|friendly stranger/u);
  });

  it("draws the chart before any other historic figure and quotes the chart's falls at its whole percent", () => {
    const { body } = read();
    const chart = body.indexOf('<Chart />');
    expect(chart).toBeGreaterThan(-1);
    expect(body.slice(0, chart)).not.toMatch(/\d/u);
    const btc = falls('BTC');
    const lowest = btc.reduce((low, fall) => (Number.parseInt(fall, 10) < Number.parseInt(low, 10) ? fall : low));
    expect(body).toContain(
      `In the chart, bitcoin fell ${lowest} or more from each of its ${btc.length === 4 ? 'four' : btc.length} highs.`,
    );
    const [eth1, eth2] = falls('ETH');
    const [link1, link2] = falls('LINK');
    const [sol] = falls('SOL');
    expect(body).toContain(`Ether fell ${eth1} and ${eth2}, Chainlink ${link1} and ${link2}, and Solana ${sol}.`);
    // The chart's own source line carries the past-performance sentence; the module writes no second one.
    expect(body).not.toContain('<PastPerformance />');
  });

  it('quotes each event and figure as its one fact holds it', () => {
    const { body } = read();
    const value = (key: string) => facts.find((fact) => fact.key === key)?.value ?? '';
    const plain = (text: string) => text.replaceAll(' ', ' ');
    for (const [key, quoted] of [
      [
        'd.mt-gox',
        ['25 Feb 2014', '28 Feb 2014', 'civil rehabilitation', 'Tokyo', '750,000 bitcoins deposited by users'],
      ],
      [
        'd.ftx',
        ['10 Nov 2022', 'FTX and FTX US halted all trading and withdrawals', 'over $8 billion in customer deposits'],
      ],
      ['f.leverage', ['10 Oct 2025', '$19 billion', '2025 annual report']],
      ['m.emergency-fund', ['3 and 6 months', "3 months' income"]],
    ] as const) {
      for (const text of quoted) expect(`${key}: ${value(key)}`).toContain(text);
    }
    expect(plain(body)).toContain('Mt. Gox closed its site on 25 Feb 2014.');
    expect(plain(body)).toContain('On 10 Nov 2022, FTX and FTX US halted all trading and withdrawals.');
    expect(plain(body)).toContain('over $19 billion of liquidations on 10 Oct 2025 alone.');
    // EDUCATION §9 row f: one dated leverage figure; ESMA's CFD figure and the FCA ban stay out.
    expect(body).not.toMatch(/ESMA|CFD|banned/u);
    // docs/LEGAL.md §6 Q4: a provider named only as the subject of a dated event, with no word on it now.
    expect(body).not.toMatch(/Bybit|Celsius|Voyager|Quadriga/u);
  });

  it('gives the order of operations, self-custody in five sentences, and six scam patterns', () => {
    const { body } = read();
    expect(body).toMatch(/First, an emergency fund\..*Then no borrowed money.*Last, an amount small enough/u);
    expect(body).toContain('FCA');
    expect(body).toContain('BaFin');
    const custody = body.slice(body.indexOf('## Keeping coins yourself'), body.indexOf('## Six patterns'));
    expect(custody.replace('## Keeping coins yourself', '').match(/[.?]( |$)/gu)).toHaveLength(5);
    const lines = read().module.body;
    expect(lines.slice(lines.indexOf('## Six patterns')).match(/^- /gmu)).toHaveLength(6);
  });
});
