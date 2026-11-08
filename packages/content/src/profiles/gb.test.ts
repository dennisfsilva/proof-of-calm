// The United Kingdom's profile (docs/JURISDICTIONS.md §7.4): what the core reads of it, the holding status of a
// buy, the source each rule links to, the rate change of 30 October 2024 and the suggestion rows of §3 that name GB.
import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const kingdom = (() => {
  const found = profiles.find((profile) => profile.code === 'GB');
  if (found === undefined) throw new Error('no profile GB');
  return found;
})();
const rules = countryRules(kingdom);

describe('United Kingdom (docs/JURISDICTIONS.md §7.4)', () => {
  it('gives the core what it reads, which the core’s own schema accepts', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(rules).toMatchObject({
      code: 'GB',
      name: 'United Kingdom',
      currency: 'GBP',
      locales: ['en-GB', 'cy-GB'],
      numberFormatLocale: 'en-GB',
      dateFormatLocale: 'en-GB',
      timezones: ['Europe/London'],
      taxYear: { start: '04-06', end: '04-05' },
      computationModel: { kind: 'per-lot' },
      holdingRule: { kind: 'none' },
      holdingRuleOverrides: [],
      holdingRuleConditions: [],
      lotRule: 'pooled',
      lotScope: 'global',
      status: { version: 1, changedOn: '2024-10-30', changeNotice: null },
    });
    expect('englishConfidence' in rules).toBe(false);
  });

  it('boots the shell on the generated rules file, equal to the profile’s rules (ADR-0049)', async () => {
    expect(await loadRules('GB')).toEqual(rules);
  });

  it('no holding rule, so a unit bought on 2026-03-15 is never labelled "tax-free from"', () => {
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it('links every rule to a law or an authority', () => {
    for (const rule of ['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'] as const) {
      const source = kingdom.sources.find((candidate) => candidate.key === kingdom.ruleSources[rule]);
      expect(source?.kind, rule).toMatch(/^(law|authority)$/);
      expect(ruleSource(kingdom, rule)).toBe(source?.url);
    }
  });

  it('splits 2024/25 by disposal date: 10 % and 20 % to 29 October 2024, 18 % and 24 % from 30 October 2024', () => {
    const rates = kingdom.card.rates.map(({ value, validFrom, validTo }) => ({ value, validFrom, validTo }));
    expect(rates).toContainEqual({ value: '18 %', validFrom: '2024-10-30', validTo: null });
    expect(rates).toContainEqual({ value: '24 %', validFrom: '2024-10-30', validTo: null });
    expect(rates).toContainEqual({ value: '10 %', validFrom: '2024-04-06', validTo: '2024-10-29' });
    expect(rates).toContainEqual({ value: '20 %', validFrom: '2024-04-06', validTo: '2024-10-29' });
  });

  it('keeps the Finance Bill measure a proposal (§2: a proposal is never a rule), effective from 6 April 2027', () => {
    const measure = kingdom.pendingChanges.find((change) => change.effectiveFrom === '2027-04-06');
    expect(measure?.status).toBe('proposed');
    expect(measure?.source.kind).toBe('authority');
  });
});

describe('suggestCountry with the United Kingdom among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['en-GB'], 'Europe/London', 'GB high'],
    [['cy-GB'], 'Europe/London', 'GB high'],
    [['en'], 'Europe/London', 'GB medium'],
    [['en-IE'], 'Europe/London', 'GB medium'],
    [['en-GB'], null, 'GB low'],
    // Dublin is Ireland's timezone and English one of its languages: the table's row reads "IE medium".
    [['en-GB'], 'Europe/Dublin', 'IE medium'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
