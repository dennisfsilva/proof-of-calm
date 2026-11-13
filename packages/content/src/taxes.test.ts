import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import facts from '../facts/education.json' with { type: 'json' };
import { parseModule, plainText } from './loaders/modules.ts';
import { moduleProblems } from './modules-validate.ts';
import { findBanned } from './style/banned.ts';

// docs/EDUCATION.md §4: Taxes where you live. Its body is #24's D2 sentences P1 to P11, word for word, with #159's
// two replacements (the sentence on rules not loaded, and P10's button), under D2's six headings; its five dated
// examples quote only what their trimmed facts hold (D7, the delegated read of 2026-11-12).
const path = 'packages/content/learn/taxes-where-you-live.mdx';
const source = readFileSync(new URL('../learn/taxes-where-you-live.mdx', import.meta.url), 'utf8');
const context = { facts: new Map(facts.map((fact) => [fact.key, fact.lastReviewed])), today: '2026-11-12' };
const KEYS = ['k.pt-2023', 'k.de-2024', 'k.it-2026', 'k.be-2026', 'k.gb-2024'] as const;
const MONTH = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';

const P1 =
  'If your plan has a holding rule, each purchase and each entry of coins added in the Log shows, when you open it, the day it passes that rule, counted from the date you recorded: “Tax-free from”, or “Long-term rate from” where the rule lowers the rate.';
const P2 = "Proof of Calm cannot check the rule's other conditions, so the date alone does not settle how a sale is taxed.";
const P3 =
  'With entries in the Log, you can export a tax-year file in Settings, under Currency & data: figures from your entries for one tax year, for you or an accountant to work from.';
const P4 = 'The file says it is data from your log, not a tax computation.';
const P5 =
  'Proof of Calm works out no taxable gain or loss, applies no tax rate to your figures, tests nothing against an allowance or a money threshold, and shows no tax due.';
const P6 =
  "Portfolio's P/L is not a taxable gain either: it covers the whole plan, not one tax year, and does not take off the fees you log.";
const P7 = "Where your plan follows a country's rule with no holding period, no date appears.";
const P8 =
  "Where your plan follows the general profile's rule, no date appears either, but your country may still have a holding period.";
// #159 change 2: the Log strips every date while the rules are not loaded (settings en.json's own words).
const NOT_LOADED = "No date appears either while your country's rules are not loaded on this device.";
const P9 =
  "A holding period of your own, set in Settings under Hold & sell, dates your purchases in the Log, while the country cards and the tax-year file keep the country's rule.";
// #159 change 3: the notice asks through its Review button, not in its words (rule-change-banner.tsx).
const P10 =
  "When Proof of Calm updates the rules for your plan's country, Today shows a dated notice with a button to review your plan.";
const P11 = 'Your plan keeps its holding rule until you change it.';

const SECTIONS = [
  ['What Proof of Calm shows', [[P1, P2]]],
  ['The tax-year file', [[P3, P4]]],
  ['What it does not compute', [[P5, P6]]],
  ['When no date appears', [[P7, P8, NOT_LOADED], [P9]]],
  ['When a rule changes', [[P10, P11]]],
] as const;
const EXAMPLES_HEADING = 'How fast rules change';

// One example per fact, in the facts line's order, with its figures, dates and law names.
const EXAMPLES = [
  [
    'k.pt-2023',
    'Portugal, from 1 Jan 2023: crypto gains taxed, with a 365‑day exclusion under conditions (Lei 24-D/2022).',
    ['Lei 24-D/2022', 'under conditions'],
  ],
  [
    'k.de-2024',
    'Germany, from 1 Jan 2024: the private-sales Freigrenze rose from €600 to €1,000 (BGBl. 2024 I Nr. 108).',
    ['BGBl. 2024 I Nr. 108', 'private-sales Freigrenze'],
  ],
  [
    'k.it-2026',
    'Italy, from 1 Jan 2026: the substitute tax on crypto gains rose from 26 % to 33 % (L. 207/2024).',
    ['L. 207/2024', 'substitute tax'],
  ],
  [
    'k.be-2026',
    'Belgium, from 1 Jan 2026: a 10 % tax on gains on financial assets, crypto included (law of 6 Apr 2026).',
    ['law of 6 Apr 2026', 'crypto included'],
  ],
  [
    'k.gb-2024',
    "The UK's annual exempt amount fell from £12,300 to £6,000 for 2023 to 2024, then £3,000 for 2024 to 2025.",
    ['annual exempt amount', '2023 to 2024', '2024 to 2025'],
  ],
] as const;

// The five facts as the delegated read trimmed them (D7; EDUCATION §9 row k follows them, facts.test.ts).
const TRIMMED = {
  'k.pt-2023': [
    'Portugal taxed crypto gains from 1 Jan 2023, with a 365-day exclusion under conditions (Lei 24-D/2022).',
    'days',
    '2022-12-30',
  ],
  'k.de-2024': [
    'Germany raised the private-sales Freigrenze from €600 to €1,000 with effect from 1 Jan 2024 (BGBl. 2024 I Nr. 108).',
    'EUR per year',
    '2024-03-27',
  ],
  'k.it-2026': [
    'Italy raised the substitute tax on crypto gains realised from 1 Jan 2026 from 26 % to 33 % (L. 207/2024).',
    '% rate',
    '2024-12-30',
  ],
  'k.be-2026': [
    'Belgium introduced a 10 % tax on gains on financial assets, crypto included, from 1 Jan 2026 (law of 6 Apr 2026).',
    '% rate',
    '2026-04-06',
  ],
  'k.gb-2024': [
    'The UK cut the CGT annual exempt amount from £12,300 to £6,000 for 2023 to 2024 and to £3,000 for 2024 to 2025.',
    'GBP per year',
    '2024-04-06',
  ],
} as const;

/** The no-break forms read as their plain ones: U+2011 as U+002D, U+00A0 as U+0020. */
const plain = (text: string) => text.replaceAll('‑', '-').replaceAll(' ', ' ');
/** Words by the loader's own rule: the plain text, then the tokens that hold a letter or a digit. */
const words = (text: string) =>
  plainText(text)
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
const collapse = (text: string) => text.replace(/[ \n]+/gu, ' ').trim();

function read() {
  const parsed = parseModule(path, source);
  if (!parsed.ok) throw new Error(path);
  return parsed.value;
}

/** Each `## ` section as its heading and its blocks, a block's lines joined by one space. */
function sections(body: string) {
  return body
    .split(/^## /mu)
    .slice(1)
    .map((part) => {
      const [heading = '', ...rest] = part.split('\n');
      const blocks = rest
        .join('\n')
        .split(/\n[ \t]*\n/u)
        .map(collapse)
        .filter((block) => block !== '');
      return { heading, blocks };
    });
}

const exampleLines = (body: string) =>
  body
    .slice(body.indexOf(`## ${EXAMPLES_HEADING}`))
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));

describe('the Taxes where you live module', () => {
  it('passes the module gate, with no banned word, read under the delegation of 2026-11-12', () => {
    const module = read();
    expect(moduleProblems({ path, source }, context)).toEqual([]);
    expect([module.title, module.idea, module.caveat].flatMap((text) => findBanned(text))).toEqual([]);
    expect([module.slug, module.title, module.chart]).toEqual(['taxes-where-you-live', 'Taxes where you live', 'none']);
    expect(module.idea).toBe('Where you live decides what holding means for tax, and the rules keep changing.');
    expect(module.caveat).toBe(
      'This is general information with a date on it, not advice; a local accountant knows your situation.',
    );
    expect([module.lastReviewed, module.nextReviewDue, module.reviewedBy]).toEqual([
      '2026-11-12',
      '2027-01-01',
      'owner',
    ]);
  });

  it('lists the five facts its examples quote, and k.ie-2026 stays out', () => {
    expect(read().facts).toEqual([...KEYS]);
  });

  it("holds P1 to P11 word for word under D2's six headings, in D2's order", () => {
    const found = sections(read().body);
    expect(found.map(({ heading }) => heading)).toEqual([...SECTIONS.map(([heading]) => heading), EXAMPLES_HEADING]);
    for (const [heading, paragraphs] of SECTIONS) {
      const section = found.find((item) => item.heading === heading);
      expect(section?.blocks, heading).toEqual(paragraphs.map((sentences) => sentences.join(' ')));
    }
  });

  it('gives one dated example per fact, each at most 20 words, in the facts line order', () => {
    const lines = exampleLines(read().body);
    expect(lines).toEqual(EXAMPLES.map(([, example]) => example));
    for (const line of lines) expect(words(`- ${line}`), line).toBeLessThanOrEqual(20);
  });

  it("quotes every figure, date and law name of an example from its own fact's value", () => {
    const DATE = new RegExp(`\\d{1,2} (?:${MONTH}) \\d{4}`, 'gu');
    const FIGURE = /[£€]?\d[\d,]*(?:\.\d+)?(?: %)?/gu;
    for (const [key, example, names] of EXAMPLES) {
      const value = plain(facts.find((fact) => fact.key === key)?.value ?? '');
      const text = plain(example);
      const quoted = [...(text.match(DATE) ?? []), ...(text.match(FIGURE) ?? []), ...names];
      expect(quoted.filter((item) => !value.includes(item)), key).toEqual([]);
    }
  });

  it('trims each fact to what the module quotes and its one source holds, read on 2026-11-12', () => {
    for (const key of KEYS) {
      const fact = facts.find((item) => item.key === key);
      const [value, unit, date] = TRIMMED[key];
      expect([fact?.value, fact?.unit, fact?.date], key).toEqual([value, unit, date]);
      expect([fact?.accessed, fact?.lastReviewed, fact?.reviewedBy], key).toEqual(['2026-11-12', '2026-11-12', 'owner']);
    }
    expect(facts.find((item) => item.key === 'k.de-2024')?.source).toBe(
      'https://www.recht.bund.de/bgbl/1/2024/108/regelungstext.pdf?__blob=publicationFile&v=1',
    );
  });

  it('stays at 400 words or fewer by the loader count', () => {
    const module = read();
    expect(module.words).toBe(words(module.body));
    expect(module.words).toBeLessThanOrEqual(400);
  });

  it('joins every percentage with U+00A0, 365-day with U+2011, and keeps each date whole', () => {
    const { body } = read();
    expect(body.match(/(?<!\d )%/gu)).toBeNull();
    expect(body).toContain('365‑day');
    expect(body).not.toContain('365-day');
    const breaks = [new RegExp(`\\d{1,2}[ \\n](?:${MONTH})`, 'gu'), new RegExp(`(?:${MONTH})[ \\n]\\d{4}`, 'gu')];
    expect(breaks.flatMap((rule) => body.match(rule) ?? [])).toEqual([]);
  });

  it('draws no chart, writes no past-performance line, and leaves the your-country id to the card', () => {
    const { body } = read();
    expect(body).not.toContain('<PastPerformance />');
    expect(body).not.toContain('<Chart />');
    const ids = sections(body).map(({ heading }) => heading.toLowerCase().replace(/[^a-z0-9]+/gu, '-'));
    expect(ids).not.toContain('your-country');
  });

  // With no plan, or a profile that fails to load, there is no card, so no sentence points at one.
  it('points at nothing on the page: no above, below or card of its own', () => {
    const sentences = collapse(read().body).split(/(?<=[.?:])\s/u);
    const pointing = /\b(?:above|below|the card|your card|this card)\b/iu;
    expect(sentences.filter((sentence) => pointing.test(sentence))).toEqual([]);
    expect(collapse(read().body)).toContain('the country cards');
  });
});
