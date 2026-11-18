// France's profile (docs/JURISDICTIONS.md §7.10): only what no content review can change (docs/ENGINEERING.md §2,
// Tests and content reviews); the country facts are §7.10's rows, which the review compares and the owner reads.
import { CountryRulesSchema, suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('FR');
if (profile === null) throw new Error('no profile FR');
const rules = CountryRulesSchema.parse(countryRules(profile));

describe("France's profile (docs/JURISDICTIONS.md §7.10)", () => {
  it('loads with the identity fields of the design note', () => {
    expect([profile.code, profile.locales]).toEqual(['FR', ['fr-FR']]);
    expect([profile.numberFormatLocale, profile.dateFormatLocale]).toEqual(['fr-FR', 'fr-FR']);
    expect(profile.timezones).toContain('Europe/Paris');
  });

  it('boots the shell on the generated rules file, which equals the rules mapped from the profile (ADR-0049)', async () => {
    expect(await loadRules('FR')).toEqual(rules);
  });
});

describe('suggestCountry with France (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    const named = suggestion.country === null ? 'none' : `${suggestion.country} ${suggestion.confidence}`;
    return `${named}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['fr-FR'], 'Europe/Paris', 'FR high'],
    [['fr-FR'], 'Indian/Reunion', 'FR high'],
    [['fr-CH'], 'Europe/Paris', 'FR medium'],
    [['en-US'], 'Europe/Paris', 'FR medium'],
    // Belgium has no profile: a region the profiles do not know is no evidence of another country.
    [['fr-BE'], 'Europe/Paris', 'FR medium'],
    [['de-DE'], 'Europe/Paris', 'FR low*'],
    [['fr-CH'], 'Europe/Zurich', 'none'],
    [['fr-FR'], 'Europe/Monaco', 'none*'],
    [['fr'], null, 'none'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
