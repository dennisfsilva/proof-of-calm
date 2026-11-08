import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('NL');
if (profile === null) throw new Error('no NL profile');
const rules = countryRules(profile);

describe('the Netherlands profile (docs/JURISDICTIONS.md §7.8)', () => {
  it('maps to the core rules of a wealth snapshot on 1 January with no holding rule and no lot rule', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(rules.holdingRule).toEqual({ kind: 'none' });
    expect(rules.lotRule).toBe('unspecified');
    expect(rules.lotScope).toBe('global');
    expect(rules.computationModel).toEqual({ kind: 'wealth-snapshot', date: '01-01' });
    expect(rules.status.version).toBe(1);
  });

  it('boots the shell on the generated rules file, which equals the rules mapped from the profile (ADR-0049)', async () => {
    expect(await loadRules('NL')).toEqual(rules);
  });

  it('gives no holding status to a purchase, whatever its date', () => {
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it.each(['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'] as const)(
    'links the %s to a law or an authority',
    (rule) => {
      const url = ruleSource(profile, rule);
      expect(url).not.toBeNull();
      const source = profile.sources.find((candidate) => candidate.url === url);
      expect(source?.kind).toMatch(/^(law|authority)$/);
    },
  );

  it('links the rate to the crypto page, which holds the 36 % and the deemed percentages the note states', () => {
    const url = ruleSource(profile, 'rates');
    const source = profile.sources.find((candidate) => candidate.url === url);
    expect(source?.title).toBe("Moet ik aangifte doen en belasting betalen over mijn crypto's?");
  });

  it('keeps only the sources a card line cites (the readTable of the PR body)', () => {
    expect(profile.sources.map((source) => source.key).sort()).toEqual([
      'nl-bd-aangifte-termijn',
      'nl-bd-crypto',
      'nl-bd-cryptobezittingen',
      'nl-bd-erfbelasting',
      'nl-bd-heffingsvrij-vermogen',
      'nl-bd-schenkbelasting',
      'nl-bd-uitstel',
      'nl-bd-werkelijk-rendement',
    ]);
  });
});

describe('the suggestion for the Netherlands (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['nl-NL'], 'Europe/Amsterdam', 'NL high'],
    [['en-GB'], 'Europe/Amsterdam', 'NL medium'],
    [['nl-BE'], 'Europe/Amsterdam', 'NL medium'],
    [['nl-BE'], 'Europe/Brussels', null],
    [['nl'], null, 'NL low'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
