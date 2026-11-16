// The United States' profile (docs/JURISDICTIONS.md §7.5): only what no content review can change
// (docs/ENGINEERING.md §2, Tests and content reviews); the country facts are §7.5's rows, which the review
// compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const us = profiles.find((candidate) => candidate.code === 'US');
if (us === undefined) throw new Error('no US profile');
const rules = countryRules(us);

describe('the United States profile (docs/JURISDICTIONS.md §7.5)', () => {
  it('parses to the rules the core reads, and the timezones the suggestion reads', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(us.timezones).toEqual([
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ]);
  });

  it('the generated rules file answers the same rules as the profile (ADR-0049)', async () => {
    expect(await loadRules('US')).toEqual(rules);
  });

  describe('suggestCountry with the profiles so far (docs/JURISDICTIONS.md §3)', () => {
    const suggest = (languages: string[], timeZone: string | null) => {
      const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
      return suggestion === null
        ? null
        : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
    };

    it.each([
      [['en-US'], 'America/New_York', 'US high'],
      [['en'], 'America/New_York', 'US medium'],
      [['es-US'], 'America/Chicago', 'US medium'],
      // Toronto is a zone of no profile: nothing is suggested.
      [['en-US'], 'America/Toronto', null],
      [['en-US'], 'Europe/Berlin', 'DE medium'],
      [['en-US'], null, 'US low'],
      [['pt-BR'], 'America/Sao_Paulo', null],
    ])('%j in %s suggests %s', (languages, timeZone, expected) => {
      expect(suggest(languages, timeZone)).toBe(expected);
    });
  });
});
