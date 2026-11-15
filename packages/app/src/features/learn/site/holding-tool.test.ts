import type { CalendarDate, HoldingRule, HoldingRuleOverride } from '@proofofcalm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  decodeHoldingRule,
  effectsOf,
  encodeHoldingRule,
  HOLDING_MIN,
  holdingAnswer,
  holdingFragment,
  holdingMax,
  parseHoldingFragment,
} from './holding-tool.ts';
import { type CountrySite, loadCountrySite } from './load';

// The holding-date tool's pure half (docs/JURISDICTIONS.md §1 and §2): what the page's script reads from the URL's
// fragment, and the date it states for a purchase under a country's rule, with no clock read.

const TODAY = '2026-11-15' as CalendarDate;
const day = (value: string) => value as CalendarDate;
const CODES = ['DE', 'ES', 'PT', 'US'];
const BOUNDS = { min: HOLDING_MIN, max: holdingMax(TODAY) };

const PT: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
const DE: HoldingRule = { kind: 'years', years: 1, effect: 'exempt' };
const US: HoldingRule = { kind: 'years', years: 1, effect: 'lower-rate' };
const dated = (from: string, effect: 'exempt' | 'lower-rate') => ({ kind: 'dated', from, effect });

let site: CountrySite;
beforeAll(async () => {
  site = await loadCountrySite(TODAY);
});

describe('the fragment', () => {
  it('reads a listed country in lower case and a purchase date, with or without the #', () => {
    expect(parseHoldingFragment('#country=pt&bought=2026-03-01', CODES, BOUNDS)).toEqual({
      country: 'pt',
      bought: '2026-03-01',
    });
    expect(parseHoldingFragment('bought=2026-03-01&country=de', CODES, BOUNDS)).toEqual({
      country: 'de',
      bought: '2026-03-01',
    });
  });

  it('accepts a country alone, and an empty fragment as nothing chosen', () => {
    expect(parseHoldingFragment('#country=us', CODES, BOUNDS)).toEqual({ country: 'us' });
    expect(parseHoldingFragment('', CODES, BOUNDS)).toEqual({});
    expect(parseHoldingFragment('#', CODES, BOUNDS)).toEqual({});
  });

  it('refuses an unknown or upper-case code, a non-date, an extra key and a duplicated key', () => {
    for (const hash of [
      '#country=xx',
      '#country=gb',
      '#country=PT',
      '#country=',
      '#bought=2025-02-29',
      '#bought=2026-3-1',
      '#country=pt&amount=100',
      '#retention',
      '#country=pt&country=de',
      '#bought=2026-03-01&bought=2026-03-02',
    ]) {
      expect(parseHoldingFragment(hash, CODES, BOUNDS), hash).toBeNull();
    }
  });

  it('refuses a key an object inherits, which a plain object would swallow', () => {
    for (const hash of [
      '#__proto__=x&country=pt',
      '#__proto__=a&__proto__=b&country=pt',
      '#constructor=x&country=pt',
      '#toString=x&country=pt',
      '#hasOwnProperty=x&country=pt',
    ]) {
      expect(parseHoldingFragment(hash, CODES, BOUNDS), hash).toBeNull();
    }
  });

  it('refuses a date outside min and max, which are the first block and the build’s day plus one year', () => {
    expect(BOUNDS).toEqual({ min: '2009-01-03', max: '2027-11-15' });
    expect(holdingMax(day('2028-02-29'))).toBe('2029-02-28');
    expect(parseHoldingFragment('#bought=2009-01-02', CODES, BOUNDS)).toBeNull();
    expect(parseHoldingFragment('#bought=2027-11-16', CODES, BOUNDS)).toBeNull();
    expect(parseHoldingFragment('#bought=2009-01-03', CODES, BOUNDS)).toEqual({ bought: '2009-01-03' });
    expect(parseHoldingFragment('#bought=2027-11-15', CODES, BOUNDS)).toEqual({ bought: '2027-11-15' });
  });

  it('writes what it reads, country first, and leaves out what is not chosen', () => {
    const both = { country: 'pt', bought: day('2026-03-01') };
    expect(holdingFragment(both)).toBe('country=pt&bought=2026-03-01');
    expect(parseHoldingFragment(holdingFragment(both), CODES, BOUNDS)).toEqual(both);
    expect(holdingFragment({ bought: day('2026-03-01') })).toBe('bought=2026-03-01');
    expect(holdingFragment({})).toBe('');
  });
});

describe('the answer', () => {
  it('states nothing but the review for a country under review, whatever its rule', () => {
    expect(holdingAnswer(day('2026-03-01'), { rule: PT, overrides: [], underReview: true })).toEqual({
      kind: 'under-review',
    });
  });

  it('states no date where the rule is none', () => {
    expect(holdingAnswer(day('2026-03-01'), { rule: { kind: 'none' }, overrides: [], underReview: false })).toEqual({
      kind: 'none',
    });
  });

  it('applies an override to purchases from its acquiredFrom on', () => {
    const overrides: HoldingRuleOverride[] = [
      { acquiredFrom: day('2027-01-01'), rule: { kind: 'years', years: 10, effect: 'exempt' }, note: 'From 2027.' },
    ];
    const answer = (bought: string) => holdingAnswer(day(bought), { rule: DE, overrides, underReview: false });
    expect(answer('2026-12-31')).toEqual(dated('2028-01-01', 'exempt'));
    expect(answer('2027-01-01')).toEqual(dated('2037-01-02', 'exempt'));
  });

  it('counts the days and the years as the core does, across 29 February', () => {
    const answer = (bought: string, rule: HoldingRule) =>
      holdingAnswer(day(bought), { rule, overrides: [], underReview: false });
    expect(answer('2027-03-01', PT)).toEqual(dated('2028-02-29', 'exempt'));
    expect(answer('2024-02-29', PT)).toEqual(dated('2025-02-28', 'exempt'));
    expect(answer('2028-02-29', DE)).toEqual(dated('2029-03-01', 'exempt'));
    expect(answer('2024-02-29', DE)).toEqual(dated('2025-03-01', 'exempt'));
    expect(answer('2024-02-29', US)).toEqual(dated('2025-03-01', 'lower-rate'));
  });

  // The oracle: each dated card's own worked example ("bought on 1 March 2026 … on 1 March 2027") gives the card's date.
  it('gives each dated card’s example purchase the card’s own result date', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, index, 1)),
    );
    const iso = (d: string, m: string, y: string) =>
      `${y}-${String(months.indexOf(m) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
    const checked: string[] = [];
    for (const [code, rules] of site.rules) {
      if (rules.rule.kind === 'none') continue;
      const text = site.cards.get(code)?.card.holdingRuleText ?? '';
      const dates = [...text.matchAll(new RegExp(`(\\d{1,2}) (${months.join('|')}) (\\d{4})`, 'g'))].map((match) =>
        iso(match[1] ?? '', match[2] ?? '', match[3] ?? ''),
      );
      const [bought] = dates;
      expect(bought, code).toBeDefined();
      expect(holdingAnswer(day(bought ?? ''), { ...rules, underReview: false }), code).toMatchObject({
        from: dates.at(-1),
      });
      checked.push(code);
    }
    expect(checked.sort()).toEqual(['DE', 'PT', 'US']);
  });
});

describe('the effects a country can state', () => {
  it('lists each effect of the rule and its overrides once, the rule’s first, and none for none', () => {
    expect(effectsOf(PT, [])).toEqual(['exempt']);
    expect(effectsOf({ kind: 'none' }, [])).toEqual([]);
    const overrides: HoldingRuleOverride[] = [
      { acquiredFrom: day('2027-01-01'), rule: US, note: 'From 2027.' },
      { acquiredFrom: day('2028-01-01'), rule: { kind: 'none' }, note: 'From 2028.' },
      { acquiredFrom: day('2029-01-01'), rule: DE, note: 'From 2029.' },
    ];
    expect(effectsOf(PT, overrides)).toEqual(['exempt', 'lower-rate']);
    expect(effectsOf({ kind: 'none' }, overrides)).toEqual(['lower-rate', 'exempt']);
  });
});

describe('the rule a radio carries', () => {
  it('decodes what it encodes, for every profile', () => {
    expect(site.rules.size).toBe(site.entries.length);
    for (const [code, rules] of site.rules) {
      expect(decodeHoldingRule(encodeHoldingRule(rules)), code).toEqual(rules);
    }
  });

  it('refuses anything else', () => {
    for (const text of [
      '',
      'x',
      '{}',
      '{"rule":{"kind":"days","days":0,"effect":"exempt"},"overrides":[]}',
      '{"rule":{"kind":"none"},"overrides":[],"extra":1}',
      '{"rule":{"kind":"none"}}',
    ]) {
      expect(decodeHoldingRule(text), text).toBeNull();
    }
  });
});
