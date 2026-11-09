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

  it('names only the facts it quotes, among a to f and m', () => {
    const { module } = read();
    expect(module.chart).toBe('drawdowns-bar');
    expect(module.facts).toEqual(['d.mt-gox', 'd.ftx', 'f.leverage', 'e.scams', 'm.emergency-fund']);
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
      ['d.mt-gox', ['25 Feb 2014', '28 Feb 2014', 'civil rehabilitation', 'Tokyo', '750,000 bitcoins deposited by users']],
      ['d.ftx', ['10 Nov 2022', 'FTX and FTX US halted all trading and withdrawals', 'over $8 billion in customer deposits']],
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
