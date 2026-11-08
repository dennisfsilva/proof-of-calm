import { CountryRulesSchema, holdingStatus, lots, suggestCountry } from '@proofofcalm/core';
import { anEntry, date, instant, money, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const italy = () => {
  const found = profiles.find((candidate) => candidate.code === 'IT');
  if (found === undefined) throw new Error('no profile IT');
  return found;
};

describe('Italy (docs/JURISDICTIONS.md §7.1)', () => {
  it('parses into the rules the core consumes', () => {
    const rules = CountryRulesSchema.parse(countryRules(italy()));
    expect(rules).toMatchObject({
      code: 'IT',
      currency: 'EUR',
      timezones: ['Europe/Rome'],
      computationModel: { kind: 'per-lot' },
      holdingRule: { kind: 'none' },
      holdingRuleOverrides: [],
      lotRule: 'lifo',
      lotScope: 'global',
    });
  });

  it('ships its generated rules file as the rules the profile maps to (ADR-0049)', async () => {
    expect(await loadRules('IT')).toEqual(countryRules(italy()));
  });

  it('has no holding rule: a unit bought on 2026-03-15 is never labelled "tax-free from"', () => {
    const rules = countryRules(italy());
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it('consumes the most recently bought lot first', () => {
    const BTC = 'BTC' as never;
    const buy = (day: string, quantity: string) =>
      anEntry({
        kind: 'extra',
        slot: null,
        coin: BTC,
        date: date(day),
        units: units(quantity),
        amount: money('100'),
        venue: null,
        createdAt: instant('2026-01-01T09:00:00Z'),
      });
    const sell = anEntry({
      kind: 'sell',
      slot: null,
      coin: BTC,
      date: date('2026-03-01'),
      units: units('0.5'),
      amount: money('100'),
      venue: null,
    });
    const { lotRule, lotScope } = countryRules(italy());
    const entries = [buy('2026-01-01', '1'), buy('2026-02-01', '1'), sell];
    const remaining = lots(entries, BTC, lotScope, lotRule).map((lot) => [lot.date, lot.remainingUnits]);
    expect(remaining).toEqual([
      ['2026-01-01', '1'],
      ['2026-02-01', '0.5'],
    ]);
  });

  it('backs every rule with a law or an authority', () => {
    const profile = italy();
    for (const key of Object.values(profile.ruleSources)) {
      const source = profile.sources.find((candidate) => candidate.key === key);
      expect(source, key).toBeDefined();
      expect(['law', 'authority']).toContain(source?.kind);
    }
  });

  describe('the suggestion (docs/JURISDICTIONS.md §3)', () => {
    const suggest = (languages: string[], timeZone: string | null) => {
      const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
      return suggestion === null
        ? null
        : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
    };

    it.each([
      [['it-IT'], 'Europe/Rome', 'IT high'],
      [['en-US'], 'Europe/Rome', 'IT medium'],
      [['de-DE'], 'Europe/Rome', 'IT low*'],
      [['it-CH'], 'Europe/Rome', 'IT medium'],
      [['it-CH'], 'Europe/Zurich', null],
      [['it'], null, 'IT low'],
    ])('%j in %s suggests %s', (languages, timeZone, expected) => {
      expect(suggest(languages, timeZone)).toBe(expected);
    });
  });
});
