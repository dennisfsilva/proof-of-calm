// Italy's profile (docs/JURISDICTIONS.md §7.1): only what no content review can change (docs/ENGINEERING.md §2,
// Tests and content reviews); the lot rule's code is the core's, tested on fixtures, and the country facts are
// §7.1's rows, which the review compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
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
    expect(rules).toMatchObject({ code: 'IT', timezones: ['Europe/Rome'] });
  });

  it('ships its generated rules file as the rules the profile maps to (ADR-0049)', async () => {
    expect(await loadRules('IT')).toEqual(countryRules(italy()));
  });

  describe('the suggestion (docs/JURISDICTIONS.md §3)', () => {
    const suggest = (languages: string[], timeZone: string | null) => {
      const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
      const named = suggestion.country === null ? 'none' : `${suggestion.country} ${suggestion.confidence}`;
      return `${named}${suggestion.languageDiffers ? '*' : ''}`;
    };

    it.each([
      [['it-IT'], 'Europe/Rome', 'IT high'],
      [['en-US'], 'Europe/Rome', 'IT medium'],
      [['de-DE'], 'Europe/Rome', 'IT low*'],
      [['it-CH'], 'Europe/Rome', 'IT medium'],
      [['it-CH'], 'Europe/Zurich', 'none'],
      [['it'], null, 'none'],
    ])('%j in %s suggests %s', (languages, timeZone, expected) => {
      expect(suggest(languages, timeZone)).toBe(expected);
    });
  });
});
