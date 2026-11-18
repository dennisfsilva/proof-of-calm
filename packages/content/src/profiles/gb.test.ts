// The United Kingdom's profile (docs/JURISDICTIONS.md §7.4): only what no content review can change
// (docs/ENGINEERING.md §2, Tests and content reviews), and the suggestion rows of §3 that name GB; the country
// facts are §7.4's rows, which the review compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
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
      locales: ['en-GB', 'cy-GB'],
      numberFormatLocale: 'en-GB',
      dateFormatLocale: 'en-GB',
      timezones: ['Europe/London'],
    });
    expect('englishConfidence' in rules).toBe(false);
  });

  it('boots the shell on the generated rules file, equal to the profile’s rules (ADR-0049)', async () => {
    expect(await loadRules('GB')).toEqual(rules);
  });
});

describe('suggestCountry with the United Kingdom among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    const named = suggestion.country === null ? 'none' : `${suggestion.country} ${suggestion.confidence}`;
    return `${named}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['en-GB'], 'Europe/London', 'GB high'],
    [['cy-GB'], 'Europe/London', 'GB high'],
    [['en'], 'Europe/London', 'GB medium'],
    [['en-IE'], 'Europe/London', 'GB medium'],
    [['en-GB'], null, 'none'],
    // Dublin is Ireland's timezone and English one of its languages: the table's row reads "IE medium".
    [['en-GB'], 'Europe/Dublin', 'IE medium'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
