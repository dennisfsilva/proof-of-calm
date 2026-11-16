// The Netherlands' profile (docs/JURISDICTIONS.md §7.8): only what no content review can change
// (docs/ENGINEERING.md §2, the review-safe test rule); the country facts are §7.8's rows, which the review
// compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('NL');
if (profile === null) throw new Error('no NL profile');
const rules = countryRules(profile);

describe('the Netherlands profile (docs/JURISDICTIONS.md §7.8)', () => {
  it('maps to rules the core’s own schema accepts', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
  });

  it('boots the shell on the generated rules file, which equals the rules mapped from the profile (ADR-0049)', async () => {
    expect(await loadRules('NL')).toEqual(rules);
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
