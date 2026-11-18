// Ireland's profile (docs/JURISDICTIONS.md §7.3): only what no content review can change (docs/ENGINEERING.md
// §2, Tests and content reviews), and the suggestion rows of §3 that name IE; the country facts are §7.3's
// rows, which the review compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const ireland = (() => {
  const found = profiles.find((profile) => profile.code === 'IE');
  if (found === undefined) throw new Error('no profile IE');
  return found;
})();
const rules = countryRules(ireland);

describe('Ireland (docs/JURISDICTIONS.md §7.3)', () => {
  it('gives the core what it reads, which the core’s own schema accepts', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(rules).toMatchObject({
      code: 'IE',
      locales: ['en-IE', 'ga-IE'],
      numberFormatLocale: 'en-IE',
      dateFormatLocale: 'en-IE',
      timezones: ['Europe/Dublin'],
    });
    expect('englishConfidence' in rules).toBe(false);
  });

  it('boots the shell on the generated rules file, equal to the profile’s rules (ADR-0049)', async () => {
    expect(await loadRules('IE')).toEqual(rules);
  });
});

describe('suggestCountry with Ireland among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    const named = suggestion.country === null ? 'none' : `${suggestion.country} ${suggestion.confidence}`;
    return `${named}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['en-IE'], 'Europe/Dublin', 'IE high'],
    [['ga-IE'], 'Europe/Dublin', 'IE high'],
    [['en-GB'], 'Europe/Dublin', 'IE medium'],
    [['en'], 'Europe/Dublin', 'IE medium'],
    [['en-IE'], null, 'none'],
    // London is the United Kingdom's timezone and English one of its languages: the table's row reads "GB medium".
    [['en-IE'], 'Europe/London', 'GB medium'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
