import { readdirSync, readFileSync } from 'node:fs';
import {
  CalendarDateSchema,
  TemplateSchema as CoreTemplateSchema,
  CountryRulesSchema,
  underReview,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { CountryProfileSchema } from './schema/jurisdiction.ts';
import { TemplateSchema } from './schema/template.ts';
import { type ContentFile, percentJoiner, validateContent } from './validate.ts';

const { $comment: _, ...allow } = allowList;
const options = { today: '2026-10-17', allow };
const source = (url: string, kind = 'authority') => ({
  title: 'Código do IRS, artigo 10.º',
  url,
  publisher: 'Autoridade Tributária e Aduaneira',
  kind,
  published: null,
  accessed: '2026-10-16',
});
const keyed = (key: string, url: string, kind = 'authority') => ({ key, ...source(url, kind) });
const CIRS = 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs';
const ruleSources = {
  holdingRule: 'pt-cirs',
  lotRule: 'pt-cirs',
  rates: 'pt-cirs',
  losses: 'pt-cirs',
  reporting: 'pt-cirs',
};
// A complete profile for the tests only; the real profiles arrive with M1, sourced and reviewed.
const profile = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  code: 'PT',
  name: 'Portugal',
  currency: 'EUR',
  locales: ['pt-PT'],
  numberFormatLocale: 'pt-PT',
  dateFormatLocale: 'pt-PT',
  timezones: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
  englishConfidence: 'low',
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Gains go in the annual return filed between April and June.',
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
  holdingRuleOverrides: [],
  holdingRuleConditions: ['The counterparty is in the EU or the EEA.'],
  lotRule: 'fifo',
  lotScope: 'per-venue',
  lotRuleNote: 'Lots are matched per platform.',
  card: {
    classification: 'Crypto held privately is a capital asset.',
    taxableEvents: [{ event: 'sale-to-fiat', taxable: 'depends', note: 'Tax-free after 365 days of holding.' }],
    rates: [{ label: 'Flat rate on gains', value: '28%', validFrom: '2023-01-01', validTo: null }],
    allowances: [],
    holdingRuleText: 'A purchase held for 365 days or more can be sold without tax on the gain.',
    lotRuleText: 'First in, first out, per platform.',
    losses: 'Losses on purchases held under 365 days offset gains of the same kind.',
    reporting: ['Annex G of the IRS return.'],
    caveats: ['A professional should confirm how a swap counts.'],
    summary60:
      'Purchases held for 365 days or more are tax-free when sold. Gains on purchases held for less are taxed at 28%.',
  },
  pendingChanges: [],
  sources: [keyed('pt-cirs', CIRS)],
  ruleSources,
  status: {
    confidence: 'high',
    version: 1,
    changedOn: '2026-01-01',
    changeNotice: null,
    lastReviewed: '2026-10-16',
    nextReviewDue: '2027-01-15',
    reviewedBy: 'owner',
  },
  ...overrides,
});
const drawdown = (coin: string, low: string, fall: string, overrides: Record<string, unknown> = {}) => ({
  coin,
  high: '2021-11-10',
  low,
  fall,
  source: `https://www.bitstamp.net/api/v2/ohlc/${coin.toLowerCase()}usd/?step=86400`,
  publisher: 'Bitstamp',
  accessed: '2026-10-16',
  ...overrides,
});
const template = (overrides: Record<string, unknown> = {}) => ({
  id: 'two-coins',
  name: 'Two coins',
  oneLine: 'Bitcoin and Ether, bought each month and held.',
  riskLabel: 'High risk',
  explanation: 'Two of the largest assets by market value, bought each month and held.',
  coins: [
    { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
    { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
  ],
  split: { BTC: '70', ETH: '30' },
  sellWindow: null,
  references: {},
  drawdowns: [drawdown('BTC', '2022-11-21', '78'), drawdown('ETH', '2022-06-18', '82')],
  lastReviewed: '2026-10-16',
  reviewedBy: 'owner',
  ...overrides,
});
const fact = (overrides: Record<string, unknown> = {}) => ({
  key: 'q.red-day-frequency',
  value: 'A seven-day fall of 10 % or more on 5.7 % of days, 2021-10-16 to 2026-10-16.',
  unit: '% of days',
  date: '2026-10-16',
  source: 'https://www.bitstamp.net/api/',
  publisher: 'Bitstamp',
  accessed: '2026-10-16',
  confidence: 'high',
  lastReviewed: '2026-10-16',
  reviewedBy: 'owner',
  ...overrides,
});
const file =(path: string, json: unknown): ContentFile => ({ path, json });
const codes = (files: ContentFile[]) =>
  validateContent(files, options).map((problem) => `${problem.code}: ${problem.detail}`);
const banned = (rule: string, field: string, match: string) =>
  `banned-${rule}: ${field}: "${match}" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)`;

describe('validateContent: jurisdictions (docs/JURISDICTIONS.md §2)', () => {
  const pt = 'packages/content/jurisdictions/pt.json';
  const UNAPPLIED =
    'overrides-unapplied: holdingRuleOverrides: the early-window check does not apply them yet (docs/JURISDICTIONS.md §2)';

  it('passes a complete, reviewed, sourced profile, which the core reads too', () => {
    expect(codes([file(pt, profile())])).toEqual([]);
    expect(CountryRulesSchema.safeParse(CountryProfileSchema.parse(profile())).success).toBe(true);
  });

  it('reports schema problems with their place', () => {
    expect(codes([file(pt, profile({ currency: 'SEK' }))])).toEqual([expect.stringMatching(/^schema: currency: /)]);
  });

  it('wants the owner’s review, a matching file name and a review not more than twelve months overdue', () => {
    const status = { ...profile().status, reviewedBy: 'agent-draft', nextReviewDue: '2025-10-16' };
    expect(codes([file('packages/content/jurisdictions/de.json', profile({ status }))])).toEqual([
      'file-name: expected pt.json',
      'agent-draft: the owner sets reviewedBy to owner after the review',
      'review-overdue: nextReviewDue 2025-10-16',
    ]);
    const due = { ...profile().status, nextReviewDue: '2025-10-17' };
    expect(codes([file(pt, profile({ status: due }))])).toEqual([]);
  });

  it('the build refuses a profile from the day its card is under review', () => {
    const nextReviewDue = '2027-01-01';
    const status = { ...profile().status, nextReviewDue };
    const on = (today: string) => ({
      refused: validateContent([file(pt, profile({ status }))], { ...options, today }).map(({ code }) => code),
      shown: underReview({ nextReviewDue: CalendarDateSchema.parse(nextReviewDue) }, CalendarDateSchema.parse(today)),
    });
    expect(on('2028-01-01')).toEqual({ refused: [], shown: false });
    expect(on('2028-01-02')).toEqual({ refused: ['review-overdue'], shown: true });
  });

  it('holds the card to 60 words and keeps banned words out of what users read', () => {
    const long = { ...profile().card, summary60: Array.from({ length: 61 }, () => 'word').join(' ') };
    expect(codes([file(pt, profile({ card: long }))])).toEqual(['summary-too-long: 61 words']);
    const advice = { ...profile().card, caveats: ['We recommend an accountant.'], losses: 'A safe bet.' };
    expect(
      codes([file(pt, profile({ card: advice, status: { ...profile().status, changeNotice: 'Guaranteed.' } }))]),
    ).toEqual([
      banned('advice', 'card.losses', 'safe'),
      banned('advice', 'card.caveats.0', 'recommend'),
      banned('advice', 'status.changeNotice', 'Guaranteed'),
    ]);
  });

  it('lints the name, the taxable events, the rates, the overrides and the pending changes, which the card shows too', () => {
    const card = {
      ...profile().card,
      taxableEvents: [{ event: 'sale-to-fiat', taxable: 'yes', note: 'A safe bet after a year.' }],
      rates: [
        { label: 'Guaranteed rate', value: 'a 12% return', validFrom: '2023-01-01', validTo: null, note: 'Robust.' },
      ],
    };
    const pendingChanges = [
      {
        title: 'Our pick for 2027',
        status: 'proposed',
        effectiveFrom: null,
        summary: 'Prices will rise.',
        source: source('https://info.portaldasfinancas.gov.pt/x'),
      },
    ];
    const holdingRuleOverrides = [
      { acquiredFrom: '2027-01-01', rule: { kind: 'none' }, note: 'Recommended for new purchases.' },
    ];
    const value = profile({ name: 'Portugal, the safe haven', card, pendingChanges, holdingRuleOverrides });
    expect(codes([file(pt, value)])).toEqual([
      UNAPPLIED,
      banned('advice', 'name', 'safe'),
      banned('advice', 'card.taxableEvents.0.note', 'safe'),
      banned('advice', 'card.rates.0.label', 'Guaranteed'),
      banned('return-percentage', 'card.rates.0.value', '12% return'),
      banned('filler', 'card.rates.0.note', 'Robust'),
      banned('advice', 'holdingRuleOverrides.0.note', 'Recommended'),
      banned('advice', 'pendingChanges.0.title', 'Our pick'),
      banned('advice', 'pendingChanges.0.summary', 'will rise'),
    ]);
  });

  it('wants https sources on the country’s allow-list, a secondary source never the only one', () => {
    const sources = [
      keyed('pt-cirs', 'http://info.portaldasfinancas.gov.pt/x'),
      keyed('example-law', 'https://example.com/law'),
      keyed('pt-dre', 'https://dre.pt/web/guest/legislacao'),
      keyed('pt-pwc', 'https://www.pwc.com/pt', 'secondary'),
      keyed('eu-mica', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj'),
    ];
    const pending = [
      {
        title: 'OE2027',
        status: 'proposed',
        effectiveFrom: null,
        summary: 'A draft.',
        source: source('https://news.example/x'),
      },
    ];
    expect(codes([file(pt, profile({ sources, pendingChanges: pending }))])).toEqual([
      'insecure-source: http://info.portaldasfinancas.gov.pt/x',
      'source-not-allowed: https://example.com/law',
      'source-not-allowed: https://news.example/x',
    ]);
    const secondaryOnly = [keyed('pt-cirs', 'https://www.pwc.com/pt', 'secondary')];
    expect(codes([file(pt, profile({ sources: secondaryOnly }))])).toEqual([
      'no-primary-source: a secondary source is never the only evidence',
    ]);
  });

  it('rejects a ruleSources key no source has', () => {
    const named = { ...ruleSources, lotRule: 'pt-cirs-art43', reporting: 'pt-lei-26-2026' };
    expect(codes([file(pt, profile({ ruleSources: named }))])).toEqual([
      'source-key-unknown: ruleSources.lotRule: pt-cirs-art43',
      'source-key-unknown: ruleSources.reporting: pt-lei-26-2026',
    ]);
    const { reporting: _reporting, ...unnamed } = ruleSources;
    expect(codes([file(pt, profile({ ruleSources: unnamed }))])).toEqual([
      expect.stringMatching(/^schema: ruleSources\.reporting: /),
    ]);
    expect(codes([file(pt, profile({ sources: [keyed('PT CIRS', CIRS)] }))])).toEqual([
      expect.stringMatching(/^schema: sources\.0\.key: /),
    ]);
  });

  it('rejects two sources with one key', () => {
    const sources = [keyed('pt-cirs', CIRS), keyed('pt-cirs', 'https://dre.pt/web/guest/legislacao')];
    expect(codes([file(pt, profile({ sources }))])).toEqual(['source-key-duplicate: pt-cirs']);
  });

  it('rejects holdingRuleOverrides while the core ignores them', () => {
    const holdingRuleOverrides = [{ acquiredFrom: '2027-01-01', rule: { kind: 'none' }, note: 'Bought from 2027.' }];
    expect(codes([file(pt, profile({ holdingRuleOverrides }))])).toEqual([UNAPPLIED]);
  });
});

describe('validateContent: the percent sign keeps its number locale’s spacing (docs/CONTENT-STYLE.md §4)', () => {
  const pt = 'packages/content/jurisdictions/pt.json';
  const NBSP = String.fromCodePoint(0xa0);
  const NNBSP = String.fromCodePoint(0x20_2f);
  const JOINER = { 'pt-PT': '', 'de-DE': NBSP } as const;
  const NAME = { 'pt-PT': 'none', 'de-DE': 'U+00A0' } as const;
  type Locale = keyof typeof JOINER;
  // A profile in the locale whose one caveat is `text`; its own rate and card write the locale's joiner.
  const inLocale = (locale: Locale, text: string, overrides: Record<string, unknown> = {}) => {
    const base = profile();
    const rate = { ...base.card.rates[0], value: `28${JOINER[locale]}%` };
    const summary60 = base.card.summary60.replace('28%', `28${JOINER[locale]}%`);
    const card = { ...base.card, rates: [rate], summary60, caveats: [text] };
    const at = { locales: [locale], numberFormatLocale: locale, dateFormatLocale: locale };
    return codes([file(pt, profile({ ...at, card, ...overrides }))]);
  };
  const refused = (locale: Locale, excerpt: string, found: string) =>
    `percent-joiner: card.caveats.0: ${JSON.stringify(excerpt)} has ${found}, expected ${NAME[locale]}`;

  it('pins the joiners Intl gives: none in Portugal, a no-break space in Germany, Spain and France', () => {
    expect(['pt-PT', 'de-DE', 'es-ES', 'fr-FR'].map(percentJoiner)).toEqual(['', NBSP, NBSP, NBSP]);
    expect(['en-GB', 'en-IE', 'en-US', 'it-IT', 'nl-NL', 'und'].map(percentJoiner)).toEqual(['', '', '', '', '', '']);
  });

  describe.each(['pt-PT', 'de-DE'] as const)('in a %s profile', (locale) => {
    const j = JOINER[locale];

    it('refuses an ordinary space at the start of a text, and allows the locale’s joiner there', () => {
      expect(inLocale(locale, '5 % of the gain is taxed.')).toEqual([refused(locale, '5 %', 'U+0020')]);
      expect(inLocale(locale, `5${j}% of the gain is taxed.`)).toEqual([]);
    });

    it('refuses the sign with no joiner where the locale has one', () => {
      const expected = locale === 'pt-PT' ? [] : [refused(locale, '5%', 'none')];
      expect(inLocale(locale, '5% of the gain is taxed.')).toEqual(expected);
    });

    it('checks a sign at the end of a text, after a separator, and at the end of a range', () => {
      expect(inLocale(locale, 'Gains are taxed at 28 %')).toEqual([refused(locale, '28 %', 'U+0020')]);
      expect(inLocale(locale, 'A flat rate (28 %) applies.')).toEqual([refused(locale, '28 %', 'U+0020')]);
      expect(inLocale(locale, 'Rates run from 10 to 30 % by bracket.')).toEqual([refused(locale, '30 %', 'U+0020')]);
      expect(inLocale(locale, `Taxed at 28${j}%`)).toEqual([]);
      expect(inLocale(locale, `A flat rate (28${j}%) applies.`)).toEqual([]);
      expect(inLocale(locale, `Rates run from 10 to 30${j}% by bracket.`)).toEqual([]);
    });

    it('refuses two spaces, a tab and a line break before the sign', () => {
      expect(inLocale(locale, 'At 5  %, 6\t% or 7\n%.')).toEqual([
        refused(locale, '5  %', 'U+0020 U+0020'),
        refused(locale, '6\t%', 'U+0009'),
        refused(locale, '7\n%', 'U+000A'),
      ]);
    });

    it('refuses the no-break character the locale does not use', () => {
      const others = locale === 'pt-PT' ? [NBSP, NNBSP] : [NNBSP];
      for (const other of others) {
        const name = `U+${other.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`;
        expect(inLocale(locale, `Taxed at 28${other}%.`)).toEqual([refused(locale, `28${other}%`, name)]);
      }
    });

    it('allows a sign with no numeral before it, and a URL that holds a sign after a numeral', () => {
      expect(inLocale(locale, 'A rate in % of the gain; see https://example.org/rate-5%-gains.')).toEqual([]);
      const sources = [keyed('pt-cirs', `${CIRS}/art1%20b`)];
      expect(inLocale(locale, `Taxed at 28${j}%.`, { sources })).toEqual([]);
    });

    it('reads a percent-escape in a URL without a scheme as an escape, and still judges the signs beside it', () => {
      const letter = 'See bundesfinanzministerium.de/Content/a1%20b for the letter.';
      expect(inLocale(locale, letter)).toEqual([]);
      const expected = [
        refused(locale, '28 %', 'U+0020'),
        ...(locale === 'pt-PT' ? [] : [refused(locale, '28%', 'none')]),
      ];
      expect(inLocale(locale, `Taxed at 28 % or 28%. ${letter}`)).toEqual(expected);
    });
  });

  it('refuses a profile whose locales disagree with its number locale on the joiner', () => {
    expect(codes([file(pt, profile({ locales: ['pt-PT', 'de-DE'] }))])).toEqual([
      'percent-joiner: locales: de-DE writes U+00A0, numberFormatLocale pt-PT writes none',
    ]);
    expect(codes([file(pt, profile({ locales: ['pt-PT', 'en-GB'] }))])).toEqual([]);
  });

  it('reports a malformed locale tag for its file, and goes on with the other checks and files', () => {
    const other = file(pt, profile({ name: 'Country, with a spaced 5 %' }));
    const run = (overrides: Record<string, unknown>) => () => codes([file(pt, profile(overrides)), other]);
    const otherFile = 'percent-joiner: name: "5 %" has U+0020, expected none';
    expect(run({ numberFormatLocale: 'de_DE' })).not.toThrow();
    expect(run({ numberFormatLocale: 'de_DE' })()).toEqual(['locale-tag: numberFormatLocale: de_DE', otherFile]);
    expect(run({ locales: ['pt-PT', 'pt_PT'] })()).toEqual(['locale-tag: locales.1: pt_PT', otherFile]);
    expect(run({ dateFormatLocale: 'pt_PT' })()).toEqual(['locale-tag: dateFormatLocale: pt_PT', otherFile]);
  });

  it('refuses the profiles as main wrote them, with an ordinary space before every sign', () => {
    const folder = new URL('../jurisdictions/', import.meta.url);
    const asMain = readdirSync(folder).map((name) => {
      const json = JSON.stringify(JSON.parse(readFileSync(new URL(name, folder), 'utf8')));
      const text = json.replaceAll(new RegExp(String.raw`(\d)${NBSP}?%(?!\w)`, 'g'), '$1 %');
      return file(`packages/content/jurisdictions/${name}`, JSON.parse(text));
    });
    const problems = validateContent(asMain, options).filter(({ code }) => code === 'percent-joiner');
    expect(problems).toHaveLength(97);
    expect(new Set(problems.map(({ path }) => path.slice(-7)))).toEqual(
      new Set(['de.json', 'es.json', 'fr.json', 'gb.json', 'ie.json', 'it.json', 'nl.json', 'pt.json', 'us.json']),
    );
    expect(problems.every(({ detail }) => detail.includes('has U+0020, expected '))).toBe(true);
  });
});

describe('validateContent: templates (docs/DOMAIN.md §5)', () => {
  const path = 'packages/content/templates/two-coins.json';

  it('passes a reviewed template, which the core reads too', () => {
    expect(codes([file(path, template())])).toEqual([]);
    expect(CoreTemplateSchema.safeParse(TemplateSchema.parse(template())).success).toBe(true);
  });

  it('wants the owner’s sign-off, a matching file name, a split of exactly 100 over its coins, and no advice', () => {
    const problems = codes([
      file(
        'packages/content/templates/other.json',
        template({ reviewedBy: 'agent-draft', split: { BTC: '70.0001', SOL: '30' } }),
      ),
    ]);
    expect(problems).toEqual([
      'file-name: expected two-coins.json',
      'agent-draft: template names and copy need the owner’s sign-off',
      'split-unknown-coin: SOL',
      'split-sum: the shares must sum to exactly 100',
    ]);
    expect(
      codes([file(path, template({ name: 'Recommended: two coins', split: { BTC: '69.5', ETH: '30.5' } }))]),
    ).toEqual([banned('advice', 'name', 'Recommended')]);
    expect(codes([file(path, template({ name: '' }))])).toEqual([expect.stringMatching(/^schema: name: /)]);
  });

  it('keeps each paragraph of the explanation to five sentences (docs/CONTENT-STYLE.md §1 rule 4)', () => {
    const six = 'One. Two. Three costs 0.7× the money. Four? Five. Six.';
    const five = 'One. Two. Three costs 0.7× the money. Four? Five.';
    expect(codes([file(path, template({ explanation: `${five}\n\n${five}` }))])).toEqual([]);
    expect(codes([file(path, template({ explanation: `${five}\n\n${six}` }))])).toEqual([
      'paragraph-too-long: explanation, paragraph 2: 6 sentences',
    ]);
  });

  it('wants dated drawdowns: each fall sourced off the facts list and read no later than the review (LEGAL §4)', () => {
    const { drawdowns: _, ...without } = template();
    expect(codes([file(path, without)])).toEqual([expect.stringMatching(/^schema: drawdowns: /)]);
    expect(codes([file(path, template({ drawdowns: [] }))])).toEqual([expect.stringMatching(/^schema: drawdowns: /)]);
    const { accessed: __, ...undated } = drawdown('BTC', '2022-11-21', '78');
    expect(codes([file(path, template({ drawdowns: [undated] }))])).toEqual([
      expect.stringMatching(/^schema: drawdowns\.0\.accessed: /),
    ]);
    expect(codes([file(path, template({ riskBand: 'Fell 78 %' }))])).toEqual([expect.stringMatching(/^schema: /)]);
    const drawdowns = [
      drawdown('BTC', '2022-11-21', '78', { source: 'https://news.example/btc', accessed: '2026-10-17' }),
      drawdown('ETH', '2022-06-18', '81', { source: 'http://www.bitstamp.net/api/' }),
      drawdown('ETH', '2022-06-18', '82', { lowSource: 'https://news.example/eth' }),
    ];
    expect(codes([file(path, template({ drawdowns }))])).toEqual([
      'source-not-allowed: https://news.example/btc',
      'insecure-source: http://www.bitstamp.net/api/',
      'source-not-allowed: https://news.example/eth',
      'accessed-after-review: drawdowns.0 accessed 2026-10-17, last reviewed 2026-10-16',
    ]);
  });

  it('refuses a fall whose low comes before its high, whose coin the template does not buy, or outside 0 to 100', () => {
    const wrong = [
      drawdown('BTC', '2021-11-09', '78'),
      drawdown('SOL', '2022-12-29', '97'),
      drawdown('ETH', '2022-06-18', '780'),
    ];
    expect(codes([file(path, template({ drawdowns: wrong }))])).toEqual([
      'drawdown-low-before-high: drawdowns.0 high 2021-11-10, low 2021-11-09',
      'drawdown-unknown-coin: drawdowns.1 SOL',
      'drawdown-fall-out-of-range: drawdowns.2 fall 780',
    ]);
    const edges = [drawdown('BTC', '2022-11-21', '0'), drawdown('ETH', '2022-06-18', '100.01')];
    expect(codes([file(path, template({ drawdowns: edges }))])).toEqual([
      'drawdown-fall-out-of-range: drawdowns.0 fall 0',
      'drawdown-fall-out-of-range: drawdowns.1 fall 100.01',
    ]);
    const bounds = [drawdown('BTC', '2021-11-10', '100.00'), drawdown('ETH', '2022-06-18', '0.5')];
    expect(codes([file(path, template({ drawdowns: bounds }))])).toEqual([]);
  });

  it('takes a second source for a low that the high’s series does not reach, from the facts list too', () => {
    const coinbase = 'https://api.exchange.coinbase.com/products/SOL-USD/candles?granularity=86400';
    const sol = drawdown('SOL', '2022-12-29', '97', {
      high: '2021-11-06',
      source: `${coinbase}&start=2021-10-01T00:00:00Z&end=2022-07-27T00:00:00Z`,
      lowSource: `${coinbase}&start=2022-07-27T00:00:00Z&end=2023-01-31T00:00:00Z`,
    });
    const coins = [...template().coins, { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 }];
    const solana = (each: Record<string, unknown>) =>
      template({ coins, split: { BTC: '70', ETH: '20', SOL: '10' }, drawdowns: [each] });
    expect(codes([file(path, solana(sol))])).toEqual([]);
    expect(codes([file(path, solana({ ...sol, lowSource: 'not a url' }))])).toEqual([
      expect.stringMatching(/^schema: drawdowns\.0\.lowSource: /),
    ]);
  });

  it('wants every coin to match its entry in the coin catalogue, when the catalogue is checked with it', () => {
    const catalogue = file('packages/content/coins.json', [
      { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
      { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
    ]);
    expect(codes([catalogue, file(path, template())])).toEqual([]);
    const coins = [
      { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 4 },
      { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
      { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 },
    ];
    const split = { BTC: '50', ETH: '30', SOL: '20' };
    expect(codes([catalogue, file(path, template({ coins, split }))])).toEqual([
      'coin-differs-from-catalogue: BTC',
      'coin-not-in-catalogue: SOL',
    ]);
  });
});

describe('validateContent: the coin catalogue (ADR-0036)', () => {
  const path = 'packages/content/coins.json';
  const coin = (id: string, geckoId: string, name = id) => ({ id, name, geckoId, decimals: 4 });

  it('passes unique tickers and CoinGecko ids listed by ticker', () => {
    expect(codes([file(path, [coin('AAVE', 'aave'), coin('BTC', 'bitcoin'), coin('ETH', 'ethereum')])])).toEqual([]);
  });

  it('reports a repeated ticker or CoinGecko id, a coin out of ticker order, a banned word and a bad entry', () => {
    expect(
      codes([
        file(path, [
          coin('BTC', 'bitcoin'),
          coin('AAVE', 'aave'),
          coin('AAVE', 'bitcoin'),
          coin('SAFE', 'safe-coin', 'Safe Coin'),
        ]),
      ]),
    ).toEqual([
      'coin-order: AAVE after BTC',
      'duplicate-coin: AAVE',
      'duplicate-gecko-id: bitcoin',
      banned('advice', '3.name', 'Safe'),
    ]);
    expect(codes([file(path, [])])).toEqual([expect.stringMatching(/^schema: /)]);
    expect(codes([file(path, [{ ...coin('btc', 'bitcoin') }])])).toEqual([expect.stringMatching(/^schema: 0\.id: /)]);
  });

  it('skips the template check when the catalogue itself does not parse', () => {
    expect(codes([file(path, { coins: [] }), file('packages/content/templates/two-coins.json', template())])).toEqual([
      expect.stringMatching(/^schema: /),
    ]);
  });
});

describe('validateContent: facts (docs/CONTENT-OPS.md §7)', () => {
  const path = 'packages/content/facts/red-day.json';

  it('passes facts with allow-listed https sources and unique keys', () => {
    expect(codes([file(path, [fact(), fact({ key: 'a.btc-drawdowns', source: 'https://mempool.space/' })])])).toEqual(
      [],
    );
  });

  it('reports a duplicate key across files, a source off the list, a bad fact and a file that is not a list', () => {
    expect(
      codes([
        file(path, [fact()]),
        file('packages/content/facts/more.json', [
          fact(),
          fact({ key: 'b.x', source: 'https://news.example/' }),
          { key: 'bad' },
        ]),
        file('packages/content/facts/broken.json', { key: 'q.x' }),
      ]),
    ).toEqual([
      'duplicate-key: q.red-day-frequency',
      'source-not-allowed: https://news.example/',
      expect.stringMatching(/^schema: key: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      expect.stringMatching(/^schema: /),
      'schema: expected a list of facts',
    ]);
  });

  // CONTENT-OPS §1: the review job proposes a fact at agent-draft, and CI blocks it until the owner flips it.
  it('reports a fact still at agent-draft, as it does a profile or a template', () => {
    expect(codes([file(path, [fact({ reviewedBy: 'agent-draft' })])])).toEqual([
      'agent-draft: the owner sets reviewedBy to owner after the review',
    ]);
  });

  it('wants reviewedBy on every fact', () => {
    const { reviewedBy: _, ...unreviewed } = fact();
    expect(codes([file(path, [unreviewed])])).toEqual([expect.stringMatching(/^schema: reviewedBy: /)]);
  });
});

describe('validateContent: cycles (docs/EDUCATION.md §2 and §6)', () => {
  const path = 'packages/content/cycles/drawdowns.json';
  const catalogue = file('packages/content/coins.json', [
    { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
    { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
  ]);
  const cycle = (coin: string, high: string, low: string, fall: string, overrides: Record<string, unknown> = {}) => ({
    ...drawdown(coin, low, fall, { high }),
    confidence: 'high',
    ...overrides,
  });
  const cycles = (drawdowns: unknown[], overrides: Record<string, unknown> = {}) => ({
    lastReviewed: '2026-10-16',
    reviewedBy: 'owner',
    drawdowns,
    ...overrides,
  });
  const rows = [
    cycle('BTC', '2017-12-17', '2018-12-15', '84'),
    cycle('BTC', '2021-11-10', '2022-11-21', '78'),
    cycle('ETH', '2021-11-10', '2022-06-18', '82', { confidence: 'medium' }),
  ];

  it('passes reviewed rows in catalogue order with whole falls from the facts list', () => {
    expect(codes([catalogue, file(path, cycles(rows))])).toEqual([]);
    expect(codes([catalogue, file(path, cycles([]))])).toEqual([expect.stringMatching(/^schema: drawdowns: /)]);
    const { confidence: _, ...unrated } = rows[0] ?? {};
    expect(codes([catalogue, file(path, cycles([unrated]))])).toEqual([
      expect.stringMatching(/^schema: drawdowns\.0\.confidence: /),
    ]);
    expect(codes([catalogue, file(path, cycles(rows, { halvings: [] }))])).toEqual([
      expect.stringMatching(/^schema: /),
    ]);
  });

  it('reports a low before its high, a coin the catalogue lacks, a fall outside 0 to 100 or not whole, a source off the facts list, and accessed after the review', () => {
    const wrong = [
      cycle('BTC', '2021-11-10', '2021-11-09', '78', { source: 'https://news.example/btc' }),
      cycle('ETH', '2021-11-10', '2022-06-18', '100.5'),
      cycle('ETH', '2021-11-11', '2022-06-18', '81.9', { accessed: '2026-10-17' }),
      cycle('SOL', '2021-11-06', '2022-12-29', '97'),
    ];
    expect(codes([catalogue, file(path, cycles(wrong))])).toEqual([
      'source-not-allowed: https://news.example/btc',
      'drawdown-low-before-high: drawdowns.0 high 2021-11-10, low 2021-11-09',
      'drawdown-fall-out-of-range: drawdowns.1 fall 100.5',
      'accessed-after-review: drawdowns.2 accessed 2026-10-17, last reviewed 2026-10-16',
      'drawdown-unknown-coin: drawdowns.3 SOL',
      'drawdown-fall-not-whole: drawdowns.1 fall 100.5',
      'drawdown-fall-not-whole: drawdowns.2 fall 81.9',
    ]);
  });

  it('reports rows out of catalogue order or two rows with one coin and high', () => {
    expect(codes([catalogue, file(path, cycles([rows[2], rows[0], rows[1]]))])).toEqual([
      'cycles-out-of-order: drawdowns.1 BTC 2017-12-17 after ETH 2021-11-10',
    ]);
    expect(codes([catalogue, file(path, cycles([rows[1], rows[0], rows[2]]))])).toEqual([
      'cycles-out-of-order: drawdowns.1 BTC 2017-12-17 after BTC 2021-11-10',
    ]);
    const twice = [...rows, cycle('ETH', '2021-11-10', '2022-06-19', '81')];
    expect(codes([catalogue, file(path, cycles(twice))])).toEqual(['cycles-duplicate: drawdowns.3 ETH 2021-11-10']);
  });

  it("wants the owner's sign-off and the file name drawdowns.json", () => {
    expect(codes([catalogue, file(path, cycles(rows, { reviewedBy: 'agent-draft' }))])).toEqual([
      'agent-draft: the owner sets reviewedBy to owner after the review',
    ]);
    expect(codes([catalogue, file(path, cycles(rows, { reviewedBy: 'nobody' }))])).toEqual([
      expect.stringMatching(/^schema: reviewedBy: /),
    ]);
    expect(codes([catalogue, file('packages/content/cycles/btc.json', cycles(rows))])).toEqual([
      'file-name: expected drawdowns.json',
    ]);
  });

  it('skips the coin check when the catalogue does not parse', () => {
    const sol = [cycle('SOL', '2021-11-06', '2022-12-29', '97')];
    expect(codes([file('packages/content/coins.json', { coins: [] }), file(path, cycles(sol))])).toEqual([
      expect.stringMatching(/^schema: /),
    ]);
    expect(codes([file(path, cycles(sol))])).toEqual([]);
  });
});

describe('validateContent: Learn modules (docs/EDUCATION.md §10, ADR-0048)', () => {
  const path = 'packages/content/learn/noise.mdx';
  const FRONT = {
    slug: 'noise',
    title: 'Noise',
    idea: 'A number on a screen is not news about your plan.',
    caveat: 'A calm plan can still lose money.',
    chart: 'none',
    facts: 'a.btc-drawdowns',
    lastReviewed: '2026-10-16',
    nextReviewDue: '2027-10-16',
    reviewedBy: 'owner',
  };
  const moduleFile = (fields: Record<string, string> = {}, body = 'One short line.\n', at = path) => ({
    path: at,
    source: [
      '---',
      ...Object.entries({ ...FRONT, ...fields }).map(([key, value]) => `${key}: ${value}`),
      '---',
      '',
      body,
    ].join('\n'),
  });
  const FACTS = file('packages/content/facts/drawdowns.json', [fact({ key: 'a.btc-drawdowns' })]);
  const checked = (modules: readonly { path: string; source: string }[], files = [FACTS]) =>
    validateContent(files, { ...options, modules }).map((problem) => `${problem.code}: ${problem.detail}`);
  const body = (fields: Record<string, string>, text: string) => checked([moduleFile(fields, text)]);
  const BODY_LINE = 13;

  it('passes a reviewed module, wherever its facts file sits among the files', () => {
    expect(checked([moduleFile()])).toEqual([]);
    expect(checked([moduleFile()], [file('packages/content/facts/red-day.json', [fact()]), FACTS])).toEqual([]);
    expect(checked([moduleFile()], [FACTS, file('packages/content/facts/red-day.json', [fact()])])).toEqual([]);
  });

  it('passes no modules at all', () => {
    expect(codes([FACTS])).toEqual([]);
  });

  it('passes a module that cites no fact, with no facts files', () => {
    expect(checked([moduleFile({ facts: '' })], [])).toEqual([]);
  });

  it('reports what the parser refuses, with the file', () => {
    expect(validateContent([], { ...options, modules: [{ path, source: 'No front matter.\n' }] })).toEqual([
      { path, code: 'module-front-matter', detail: 'Open the file with front matter between 2 --- lines' },
    ]);
    expect(checked([moduleFile({ title: '' })])).toEqual(['schema: title: Add a title']);
  });

  it('checks the slug against the file name', () => {
    expect(checked([moduleFile({}, undefined, 'packages/content/learn/cycles.mdx')])).toEqual([
      'file-name: rename the file to noise.mdx',
    ]);
  });

  it('a module over 400 words fails', () => {
    const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
    expect(body({}, words(400))).toEqual([]);
    expect(body({}, words(401))).toEqual(['module-too-long: 401 words; cut the body to 400 words']);
  });

  it('an unknown facts key fails', () => {
    expect(body({ facts: 'a.btc-drawdowns, z.nothing' }, 'Text.')).toEqual([
      'module-fact-unknown: z.nothing: no fact has this key; use a key from packages/content/facts or remove it',
    ]);
  });

  it('a stale facts key fails', () => {
    const facts = (lastReviewed: string) => [
      file('packages/content/facts/drawdowns.json', [fact({ key: 'a.btc-drawdowns', lastReviewed })]),
    ];
    expect(checked([moduleFile()], facts('2025-10-17'))).toEqual([]);
    expect(checked([moduleFile()], facts('2025-10-16'))).toEqual([
      'module-fact-stale: a.btc-drawdowns: last reviewed 2025-10-16, more than 12 months ago; the owner reviews it and sets lastReviewed',
    ]);
  });

  it('a module over 18 months old fails', () => {
    expect(body({ lastReviewed: '2025-04-17' }, 'Text.')).toEqual([]);
    expect(body({ lastReviewed: '2025-04-16' }, 'Text.')).toEqual([
      'module-stale: last reviewed 2025-04-16, more than 18 months ago; the owner reviews it and sets lastReviewed',
    ]);
  });

  it('an agent draft fails until the owner signs it', () => {
    expect(body({ reviewedBy: 'agent-draft' }, 'Text.')).toEqual([
      'agent-draft: the owner sets reviewedBy to owner after the review',
    ]);
  });

  it('an import or {expression} fails', () => {
    expect(body({}, 'import Chart from "./chart"')).toEqual([
      `module-syntax: line ${BODY_LINE}: this line is code in MDX. Reword it or remove it`,
    ]);
    expect(body({}, 'Text.\n\nexport const a = 1')).toEqual([
      `module-syntax: line ${BODY_LINE + 2}: this line is code in MDX. Reword it or remove it`,
    ]);
    expect(body({}, 'Fell {2 + 2} points.')).toEqual([
      `module-syntax: line ${BODY_LINE}: write \\{ to show a brace; a module carries text, never an expression`,
    ]);
  });

  it('a Markdown link in a body fails', () => {
    const LINK = 'a module holds no link; the screen that shows it links to it (ADR-0048)';
    expect(body({}, 'See [the plan](/plan) for this.')).toEqual([`module-syntax: line ${BODY_LINE}: ${LINK}`]);
    expect(body({}, 'Text.\n\n![A chart](/chart.png)')).toEqual([`module-syntax: line ${BODY_LINE + 2}: ${LINK}`]);
    expect(body({}, 'A price [in brackets] (in dollars) stays text.')).toEqual([]);
  });

  it('a prose line that continues a paragraph may open with import or export', () => {
    expect(body({}, 'Keep the plan on this device, and\nexport the log as a file.\n\nImport duties differ.')).toEqual(
      [],
    );
    expect(body({}, '- One item, and\nexport the log.')).toEqual([]);
    expect(body({}, 'Text\nimport duties from abroad differ.')).toEqual([]);
    expect(body({}, 'Text\nexport constant values.')).toEqual([]);
  });

  it('a line with a statement’s shape at column 1 fails wherever it stands, and costs one re-wrap', () => {
    const CODE = 'this line is code in MDX. Reword it or remove it';
    expect(body({}, 'Text\nimport Chart from "./chart"')).toEqual([`module-syntax: line ${BODY_LINE + 1}: ${CODE}`]);
    for (const statement of [
      'import "./chart"',
      "import a from 'b'",
      'import { a } from "b"',
      'import * as a from "b"',
      'export { a }',
      'export * from "b"',
      'export default a',
      'export const a = 1',
      'export let a',
      'export var a',
      'export function a() {}',
      'export class A {}',
      'export async function a() {}',
    ]) {
      expect(body({}, `Text\n${statement}`)).toContain(`module-syntax: line ${BODY_LINE + 1}: ${CODE}`);
    }
  });

  it.each([
    '>\nimport a from "b"',
    '*\nimport a from "b"',
    '1.\nimport a from "b"',
    '> ```\n> x\n> ```\nimport a from "b"',
    '- ```\n  x\n  ```\nimport a from "b"',
    '- ```\n  x\n  ```\n\nimport a from "b"',
    '> Title\n> ===\nimport a from "b"',
    '    # A title\nimport a from "b"',
    '\t# A title\nimport a from "b"',
    'Text.\n\n    ---\nexport const a = 1',
    'Title\n    ===\nexport const a = 1',
  ])('a statement fails in %j', (text) => {
    expect(body({}, text)).toEqual([
      `module-syntax: line ${BODY_LINE + text.split('\n').length - 1}: this line is code in MDX. Reword it or remove it`,
    ]);
  });

  it.each([
    '- item\n--\nexport the log as a file.',
    '> q\n===\nexport the log as a file.',
    '=\nexport the log as a file.',
  ])('a line with no statement’s shape and text above it passes in %j', (text) => {
    expect(body({}, text)).toEqual([]);
  });

  it('import or export at the start of a block fails, in prose too, because the compiler refuses it', () => {
    const code = (line: number) => [`module-syntax: line ${line}: this line is code in MDX. Reword it or remove it`];
    expect(body({}, 'import duties differ.')).toEqual(code(BODY_LINE));
    expect(body({}, 'Text.\n\nexport the log as a file.')).toEqual(code(BODY_LINE + 2));
    expect(body({}, 'Text.\n  \nexport the log as a file.')).toEqual(code(BODY_LINE + 2));
  });

  it('an indented line is not at column 1, so it is no statement', () => {
    expect(body({}, 'Text.\n\n  import duties differ.')).toEqual([]);
    expect(body({}, 'Text\n  import a from "b"')).toEqual([]);
  });

  it('a line right after a heading, rule, or closing fence opens a block, so an import there fails', () => {
    const code = (line: number) => [`module-syntax: line ${line}: this line is code in MDX. Reword it or remove it`];
    expect(body({}, '# A title\nimport Chart from "./chart"\n\nText.')).toEqual(code(BODY_LINE + 1));
    expect(body({}, '#\nimport Chart from "./chart"')).toEqual(code(BODY_LINE + 1));
    expect(body({}, 'Text.\n\n---\nexport const a = 1')).toEqual(code(BODY_LINE + 3));
    expect(body({}, 'Text.\n\n* * *\nexport const a = 1')).toEqual(code(BODY_LINE + 3));
    expect(body({}, 'Title\n===\nexport const a = 1')).toEqual(code(BODY_LINE + 2));
    expect(body({}, 'Title\n---\nexport const a = 1')).toEqual(code(BODY_LINE + 2));
    expect(body({}, '```\ncode\n```\nexport const a = 1')).toEqual(code(BODY_LINE + 3));
    expect(body({}, '~~~~ text\ncode\n~~~\n~~~~~\nexport const a = 1')).toEqual(code(BODY_LINE + 4));
  });

  it('the first line of the body opens a block', () => {
    const { source } = moduleFile({}, 'import Chart from "./chart"');
    expect(checked([{ path, source: source.replace('---\n\n', '---\n') }])).toEqual([
      `module-syntax: line ${BODY_LINE - 1}: this line is code in MDX. Reword it or remove it`,
    ]);
  });

  it('a statement inside a code fence fails too: the check reads no block structure', () => {
    const code = (line: number) => `module-syntax: line ${line}: this line is code in MDX. Reword it or remove it`;
    expect(body({}, '```\nimport Chart from "./chart"\n\nexport const a = 1\n```\n\nText.')).toEqual([
      code(BODY_LINE + 1),
      code(BODY_LINE + 3),
    ]);
    expect(body({}, '```js\nimport Chart from "./chart"\n~~~\nexport const a = 1\n```')).toEqual([
      code(BODY_LINE + 1),
      code(BODY_LINE + 3),
    ]);
  });

  it('an unescaped < fails, an escaped one passes', () => {
    const ANGLE = 'write \\< to show a less-than sign; the elements a body holds are <PastPerformance /> and <Chart />';
    expect(body({}, 'Falls \\< 10 % and \\{ both.')).toEqual([]);
    expect(body({}, 'Falls < 10 %.')).toEqual([`module-syntax: line ${BODY_LINE}: ${ANGLE}`]);
    expect(body({}, '<Foo />')).toEqual([`module-syntax: line ${BODY_LINE}: ${ANGLE}`]);
    expect(body({}, 'A backslash \\\\< is not an escape.')).toHaveLength(1);
  });

  // The renderer draws the front matter's chart where the body writes the element, so the two agree.
  describe('a module holds one <Chart /> exactly when its front matter names a chart', () => {
    const chart = { chart: 'drawdowns-bar' };
    const NONE = 'module-chart: remove <Chart />: the front matter says chart: none';
    const ONE = 'module-chart: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';

    it('passes a chart with its element, and no chart without one', () => {
      expect(body(chart, 'Text.\n\n<Chart />\n\nMore text.')).toEqual([]);
      expect(body({}, 'Text.')).toEqual([]);
    });

    it('refuses the element on a module without a chart', () => {
      expect(body({}, 'Text.\n\n<Chart />')).toEqual([NONE]);
    });

    it('refuses a chart with no element, or with two', () => {
      expect(body(chart, 'Text.')).toEqual([ONE]);
      expect(body(chart, '<Chart />\n\nText.\n\n<Chart />')).toEqual([ONE]);
    });
  });

  describe('the past-performance sentence and its Risk link are one element (docs/LEGAL.md §4)', () => {
    const line = 'Past performance is not a reliable indicator of future results.';
    const refused = [
      'module-past-performance: write <PastPerformance /> in place of these words: it sets the sentence and the Risk link together (docs/LEGAL.md §4)',
    ];

    it.each([
      ['after the source', 'Bitstamp closes, 1 Jan 2020 to 1 Jan 2021. <PastPerformance />'],
      ['across a line end', 'Bitstamp closes, 1 Jan 2020 to\n1 Jan 2021. <PastPerformance />'],
      ['on its own line', 'Bitstamp closes.\n<PastPerformance />'],
      ['twice', 'Bitstamp closes. <PastPerformance />\n\nMore text.\n\nKraken closes. <PastPerformance />'],
      ['the two words apart', 'The past was hard, and its performance varied.'],
      ['a word that holds them', 'The compassed performance of a pastperformance.'],
    ])('passes %s', (_, text) => {
      expect(body({}, text)).toEqual([]);
    });

    // The words a reader would see, however the source writes them: the element is the only way to show them.
    it.each([
      ['the sentence', line],
      ['the sentence beside the element', `${line} <PastPerformance />`],
      ['other words', 'Bitstamp closes, and past performance is no guide.'],
      ['capitals', 'PAST PERFORMANCE IS NO GUIDE.'],
      ['a mark inside', 'Past *performance* is no guide.'],
      ['a mark around', '**Past performance** is no guide.'],
      ['a line end', 'Past\nperformance is no guide.'],
      ['a hard break', 'Past\\\nperformance is no guide.'],
      ['a no-break space', 'Past\u00A0performance is no guide.'],
      ['an entity', 'Past&nbsp;performance is no guide.'],
      ['a numeric entity', 'Past&#160;performance is no guide.'],
      ['a hyphen', 'Past-performance figures are no guide.'],
      ['an escaped hyphen', 'Past\\-performance figures are no guide.'],
      ['a no-break hyphen', 'Past\u2011performance figures are no guide.'],
      ['an en dash', 'Past\u2013performance figures are no guide.'],
      ['a quote', '> Past performance is no guide.'],
      ['a quote across lines', '> Past\n> performance is no guide.'],
      ['a list', '- Past performance is no guide.'],
      ['a heading', '## Why past performance misleads\n\nThe 2021 high is one data point.'],
    ])('refuses %s', (_, text) => {
      expect(body({}, text)).toEqual(refused);
    });

    it('refuses the words in the idea and the caveat too', () => {
      expect(body({ caveat: 'Past performance is no guide.' }, 'One short line.')).toEqual(refused);
      expect(body({ idea: 'Past performance is no guide.' }, 'One short line.')).toEqual(refused);
    });
  });

  it('counts the body line from the top of the file', () => {
    const source = moduleFile({}, 'Line one.\n{').source;
    expect(source.split('\n').indexOf('{') + 1).toBe(BODY_LINE + 1);
    expect(checked([{ path, source: source.replaceAll('\n', '\r\n') }])).toEqual([
      `module-syntax: line ${BODY_LINE + 1}: write \\{ to show a brace; a module carries text, never an expression`,
    ]);
  });

  it('banned words in a body fail', () => {
    expect(body({}, 'A plan.\n\n- **Buy Bitcoin** now.')).toEqual([banned('imperative', 'body', 'Buy Bitcoin now')]);
    expect(body({}, 'This is the safe choice.')).toEqual([banned('advice', 'body', 'safe')]);
  });

  it('a phrase broken across lines fails like one on a single line', () => {
    expect(body({}, 'This plan never tries to buy the\ndip when prices fall.')).toEqual([
      banned('advice', 'body', 'buy the dip'),
    ]);
    expect(body({}, 'A plan.\n\nBuy\nBitcoin now.')).toEqual([banned('imperative', 'body', 'Buy Bitcoin now')]);
    expect(body({}, 'Perhaps you\nshould wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, 'The price will\nrise.')).toEqual([banned('advice', 'body', 'will rise')]);
    expect(body({}, 'The price will\n**rise**.')).toEqual([banned('advice', 'body', 'will rise')]);
  });

  it('a phrase fails across a hard break, inside a list item, and inside a quote', () => {
    expect(body({}, 'Perhaps you  \nshould wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '- Perhaps you\n  should wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '> Perhaps you\n> should wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '> Perhaps you\nshould wait.')).toEqual([banned('advice', 'body', 'you should')]);
  });

  it('a quote mark with no space after it is a mark too, as in Markdown', () => {
    expect(body({}, '> Perhaps you should wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '> Perhaps you\n>should wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '> The price will\n>rise.')).toEqual([banned('advice', 'body', 'will rise')]);
    expect(body({}, '>Buy Bitcoin')).toEqual([banned('imperative', 'body', 'Buy Bitcoin')]);
  });

  it('an allow-listed phrase holds across a line', () => {
    expect(body({}, 'This app never asks for an exchange API\nkey.')).toEqual([]);
    expect(body({}, 'It lists providers authorised\nunder MiCA.')).toEqual([]);
    expect(body({}, 'nach MiCA\nzugelassenen Anbieter')).toEqual([]);
    expect(body({}, 'prestadores autorizados ao\nabrigo do MiCA')).toEqual([]);
  });

  it('a hard-break backslash at a line end is no part of a finding', () => {
    expect(body({}, 'Buy Bitcoin\\\nnow.')).toEqual([banned('imperative', 'body', 'Buy Bitcoin')]);
  });

  it('a list item, a quote, or a heading keeps its own line for the lint', () => {
    const imperative = [banned('imperative', 'body', 'Buy Bitcoin')];
    expect(body({}, 'Your plan\n- **Buy Bitcoin**')).toEqual(imperative);
    expect(body({}, '- Your plan\n- Buy Bitcoin')).toEqual(imperative);
    expect(body({}, 'Your plan\n1. Buy Bitcoin')).toEqual(imperative);
    expect(body({}, 'Your plan\n> Buy Bitcoin')).toEqual(imperative);
    expect(body({}, '> Your plan\n> - Buy Bitcoin')).toEqual(imperative);
    expect(body({}, 'Your plan\n# Buy Bitcoin')).toEqual(imperative);
    expect(body({}, '# Buy Bitcoin\nYour plan')).toEqual(imperative);
    expect(body({}, 'Buy Bitcoin\n===\nYour plan')).toEqual(imperative);
    expect(body({}, 'Your plan\n```\nBuy Bitcoin\n```')).toEqual(imperative);
    expect(body({}, 'Your plan\n\nBuy Bitcoin')).toEqual(imperative);
  });

  it('a blank line keeps its break for the lint', () => {
    expect(body({}, 'Perhaps you\n\nshould wait.')).toEqual([]);
    expect(body({}, 'Perhaps you\n  \nshould wait.')).toEqual([]);
    expect(body({}, 'Perhaps you\n\n\nshould wait.')).toEqual([]);
  });

  it('every single newline reads as a space, so a false finding costs a re-wrap', () => {
    expect(body({}, '- Perhaps you\n- should wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, '# Perhaps you\nshould wait.')).toEqual([banned('advice', 'body', 'you should')]);
    expect(body({}, 'You can\nbuy Bitcoin')).toEqual([banned('imperative', 'body', 'buy Bitcoin')]);
    expect(body({}, 'You can\nbuy Bitcoin, and you can hold it.')).toEqual([
      banned('imperative', 'body', 'buy Bitcoin, and you can hold it'),
    ]);
  });

  it.each([
    'Your plan  \nBuy Bitcoin',
    'Your plan\\\nBuy Bitcoin',
    '> # Your plan\n> Buy Bitcoin',
    '> ---\n> Buy Bitcoin',
    '> Title\n> ===\n> Buy Bitcoin',
    '> ```\n> x\n> ```\n> Buy Bitcoin',
    '    # Your plan\nBuy Bitcoin',
  ])('a line that opens with an imperative fires in %j', (text) => {
    expect(body({}, text)).toEqual([banned('imperative', 'body', 'Buy Bitcoin')]);
  });

  it('a line that opens with an imperative after a hard break keeps its words to the full stop', () => {
    expect(body({}, 'Steps  \nBuy Bitcoin now.')).toEqual([banned('imperative', 'body', 'Buy Bitcoin now')]);
  });

  it('a phrase fails across a hard break written with a backslash', () => {
    expect(body({}, 'Perhaps you\\\nshould wait.')).toEqual([banned('advice', 'body', 'you should')]);
  });

  it('reports a finding once when both reads of the body find it', () => {
    expect(body({}, 'This is safe.\nThe next line.')).toEqual([banned('advice', 'body', 'safe')]);
    expect(body({}, 'Buy Bitcoin\nnow.')).toEqual([banned('imperative', 'body', 'Buy Bitcoin')]);
    expect(body({}, 'A gain of 10 %\nor more.')).toHaveLength(1);
    expect(body({}, 'A 10 %\nreturn.')).toHaveLength(1);
    expect(body({}, 'It is safe.\n\nIt is safe.')).toHaveLength(2);
  });

  it('a body with CRLF line ends reads like one with LF', () => {
    const crlf = (text: string) => checked([{ path, source: moduleFile({}, text).source.replaceAll('\n', '\r\n') }]);
    expect(crlf('This plan never tries to buy the\ndip when prices fall.')).toEqual([
      banned('advice', 'body', 'buy the dip'),
    ]);
    expect(crlf('Your plan\nBuy Bitcoin')).toEqual([banned('imperative', 'body', 'Buy Bitcoin')]);
    expect(crlf('Perhaps you\n\nshould wait.')).toEqual([]);
  });

  it('banned words in the front matter fail', () => {
    expect(body({ title: 'A safe plan', caveat: 'Unlock calm.' }, 'Text.')).toEqual([
      banned('advice', 'title', 'safe'),
      banned('filler', 'caveat', 'Unlock'),
    ]);
  });
});

describe('validateContent: messages and other files', () => {
  it('lints every string of a message file, nested or not', () => {
    const messages = { today: { title: 'Today', empty: { noPlan: 'Set up a plan. Buy the dip.' } }, count: 3 };
    expect(codes([file('packages/app/src/features/today/messages/en.json', messages)])).toEqual([
      banned('advice', 'today.empty.noPlan', 'Buy the dip'),
    ]);
    expect(codes([file('apps/web/messages/en.json', ['Safe and sound'])])).toEqual([banned('advice', '0', 'Safe')]);
  });

  it('refuses a file it does not know', () => {
    expect(codes([file('packages/content/notes.json', {})])).toEqual(['unknown-file: not a content or message file']);
  });
});
