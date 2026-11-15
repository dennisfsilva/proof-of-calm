import { readdirSync, readFileSync } from 'node:fs';
import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { TemplateSchema } from './schema/template.ts';
import { fillTemplateDates, PLACEHOLDER, templateDatePaths } from './template-dates.ts';
import { type ContentFile, validateContent } from './validate.ts';

const { $comment: _, ...allow } = allowList;
const options = { today: '2026-10-17', allow };
const root = new URL('../templates/', import.meta.url);
const shipped = readdirSync(root)
  .filter((name) => name.endsWith('.json'))
  .map((name) => TemplateSchema.parse(JSON.parse(readFileSync(new URL(name, root), 'utf8'))));
const shippedById = (id: string) => {
  const found = shipped.find((each) => each.id === id);
  if (found === undefined) throw new Error(`no template ${id}`);
  return found;
};

/** A date as `format.date` writes it (packages/app/src/lib/format): the locale's short month, no-break spaces. */
const formatter = (locale: string, month: 'short' | 'long' = 'short') => {
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' });
  return (day: CalendarDate) => format.format(new Date(`${day}T00:00:00Z`)).replaceAll(' ', ' ');
};
const plain = (text: string) => text.replaceAll(' ', ' ');

const drawdown = (coin: string, high: string, low: string) => ({
  coin,
  high,
  low,
  fall: '78',
  source: `https://www.bitstamp.net/api/v2/ohlc/${coin.toLowerCase()}usd/?step=86400`,
  publisher: 'Bitstamp',
  accessed: '2026-10-16',
});
const template = (overrides: Record<string, unknown> = {}) => ({
  id: 'two-coins',
  name: 'Two coins',
  oneLine: 'Bitcoin and Ether, bought each month and held.',
  riskLabel: 'High risk',
  explanation: 'Bitcoin fell 78 % from its high on {date:drawdowns.BTC.high} to its low on {date:drawdowns.BTC.low}.',
  coins: [
    { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
    { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
  ],
  split: { BTC: '70', ETH: '30' },
  sellWindow: null,
  references: {},
  drawdowns: [drawdown('BTC', '2021-11-10', '2022-11-21'), drawdown('ETH', '2021-11-10', '2022-06-18')],
  lastReviewed: '2026-10-16',
  reviewedBy: 'owner',
  ...overrides,
});
const TWO = 'packages/content/templates/two-coins.json';
const file = (path: string, json: unknown): ContentFile => ({ path, json });
/** The date problems only: the fixture's other checks are validate.test.ts's business. */
const dateCodes = (files: ContentFile[]) =>
  validateContent(files, options)
    .filter((problem) => problem.code.startsWith('template-date'))
    .map((problem) => `${problem.path.includes('/i18n/') ? 'pt-PT ' : ''}${problem.code}: ${problem.detail}`);

describe('templateDatePaths (docs/CONTENT-STYLE.md §6, docs/DOMAIN.md §5)', () => {
  it('names every date field of a template by its path', () => {
    const cycle = templateDatePaths(shippedById('cycle-plan'));
    expect([...cycle.keys()].sort()).toEqual(
      [
        'drawdowns.BTC.high',
        'drawdowns.BTC.low',
        'drawdowns.ETH.high',
        'drawdowns.ETH.low',
        'drawdowns.LINK.high',
        'drawdowns.LINK.low',
        'drawdowns.SOL.high',
        'drawdowns.SOL.low',
        'lastBuy',
        'references.halving',
        'references.lastThird',
        'references.peakFrom',
        'references.peakTo',
        'references.secondThird',
        'sellWindow.closes',
        'sellWindow.exitBy',
        'sellWindow.opens',
        'validUntil',
      ].sort(),
    );
    expect(cycle.get('sellWindow.opens')).toBe('2029-06-01');
    expect(cycle.get('drawdowns.LINK.high')).toBe('2021-05-10');
    expect([...templateDatePaths(shippedById('btc-only-hold')).keys()]).toEqual([
      'drawdowns.BTC.high',
      'drawdowns.BTC.low',
    ]);
  });

  it('resolves every placeholder in every shipped template, and leaves no date written out', () => {
    for (const each of shipped) {
      const dates = templateDatePaths(each);
      for (const text of [each.oneLine, each.explanation]) {
        for (const [, path] of text.matchAll(PLACEHOLDER))
          expect(dates.has(path ?? ''), `${each.id}: ${path}`).toBe(true);
        expect(fillTemplateDates(text, dates, formatter('en-GB')), each.id).not.toContain('{');
      }
    }
    expect(dateCodes(shipped.map((each) => file(`packages/content/templates/${each.id}.json`, each)))).toEqual([]);
  });

  it('renders the English text word for word as before, with each date from its field', () => {
    const cycle = shippedById('cycle-plan');
    const long = formatter('en-GB', 'long');
    const dates = templateDatePaths(cycle);
    expect(plain(fillTemplateDates(cycle.oneLine, dates, long))).toBe(
      '4 coins bought monthly until 1 June 2028, held, then sold in thirds from 1 June 2029 to 31 October 2029. The plan rests on a forecast that may not come true.',
    );
    const explanation = plain(fillTemplateDates(cycle.explanation, dates, long));
    expect(explanation).toContain('the next between 1 September 2029 and 31 October 2029.');
    expect(explanation).toContain('after the halving it places on 15 April 2028.');
    expect(explanation).toContain('thirds to sell from 1 June 2029, 1 August 2029, and 1 October 2029, whatever');
    expect(explanation).toContain('Nothing is held after 31 December 2029.');
    expect(explanation).toContain('Chainlink fell 91 % from its high on 10 May 2021 to its low on 10 June 2023.');
    expect(explanation).toMatch(/From 1 June 2028 its dates no longer fill in/);
  });

  it('keeps the no-break spaces of a formatted en-GB date, and orders a US date the US way', () => {
    const cycle = shippedById('cycle-plan');
    const dates = templateDatePaths(cycle);
    const british = fillTemplateDates(cycle.oneLine, dates, formatter('en-GB'));
    expect(british).toContain('until 1 Jun 2028, held');
    expect(british).toContain('from 1 Jun 2029 to 31 Oct 2029.');
    expect(british).not.toMatch(/\d [A-Z][a-z]{2}|[A-Z][a-z]{2,3} \d/);
    expect(fillTemplateDates(cycle.oneLine, dates, formatter('en-US'))).toContain('until Jun 1, 2028, held');
  });
});

describe('the template date check (docs/CONTENT-STYLE.md §4)', () => {
  it('refuses a placeholder that names no date of the template', () => {
    const explanation = 'Sold from {date:sellWindow.opens}. Solana fell from {date:drawdowns.SOL.high}. {date:lastBuy';
    expect(dateCodes([file(TWO, template({ explanation, oneLine: 'Held until {date:validUntil}.' }))])).toEqual([
      'template-date-unresolved: oneLine: {date:validUntil} names no date of this template',
      'template-date-unresolved: explanation: {date:sellWindow.opens} names no date of this template',
      'template-date-unresolved: explanation: {date:drawdowns.SOL.high} names no date of this template',
      'template-date-unresolved: explanation: "{date:lastBuy" is not a whole placeholder',
    ]);
  });

  it('refuses a placeholder in the name or the risk label, which the app shows as written', () => {
    expect(dateCodes([file(TWO, template({ name: 'Two coins to {date:drawdowns.BTC.low}' }))])).toEqual([
      'template-date-field: name: a date goes in oneLine or explanation, as {date:<field>}',
    ]);
  });

  it.each([
    ['en', 'name', 'Two coins from June'],
    ['en', 'oneLine', 'Bought each month until 1 Sept 2028.'],
    ['en', 'riskLabel', 'High risk until December'],
    ['en', 'explanation', 'Bought each month from Nov 10, 2021.'],
    ['pt', 'explanation', 'Comprado todos os meses até junho de 2028.'],
    ['pt', 'oneLine', 'Comprado até 1 out. 2028.'],
    ['de', 'explanation', 'Jeden Monat gekauft, bis zum 1. März 2028.'],
    ['de', 'riskLabel', 'Hohes Risiko bis 1. Okt. 2028'],
  ])('refuses a month name in %s in %s', (_language, field, text) => {
    const [problem] = dateCodes([file(TWO, template({ [field]: text }))]);
    expect(problem).toMatch(
      new RegExp(`^template-date-month: ${field}: ".+" is a month name; write \\{date:<field>\\}`),
    );
  });

  it('reads “may”, “out” and “set” as words, not months', () => {
    const oneLine = 'The plan may not come true; set it once, and money comes out.';
    expect(dateCodes([file(TWO, template({ oneLine }))])).toEqual([]);
  });

  it('runs on a pt-PT overlay’s changed text', () => {
    const overlay = file('packages/content/i18n/pt-PT/templates/two-coins.json', {
      explanation: 'A Bitcoin caiu 78 % do máximo de 10 de novembro de 2021 ao mínimo de {date:drawdowns.BTC.low}.',
      oneLine: 'Comprado todos os meses até {date:lastBuy}.',
    });
    expect(dateCodes([file(TWO, template()), overlay])).toEqual([
      'pt-PT template-date-unresolved: oneLine: {date:lastBuy} names no date of this template',
      'pt-PT template-date-month: explanation: "novembro" is a month name; write {date:<field>} (docs/CONTENT-STYLE.md §4)',
    ]);
  });
});
