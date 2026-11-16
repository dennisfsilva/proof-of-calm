// Spain's profile (docs/JURISDICTIONS.md §7.9): only what no content review can change (docs/ENGINEERING.md §2,
// Tests and content reviews); the country facts are §7.9's rows, which the review compares and the owner reads.
import { suggestCountry } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('ES');
if (profile === null) throw new Error('no profile ES');

describe('Spain (docs/JURISDICTIONS.md §7.9)', () => {
  it('ships the same rules in its generated rules file (ADR-0049)', async () => {
    expect(await loadRules('ES')).toEqual(countryRules(profile));
  });
});

describe('suggestCountry with Spain among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['es-ES'], 'Europe/Madrid', 'ES high'],
    [['ca-ES'], 'Europe/Madrid', 'ES high'],
    [['es-ES'], 'Atlantic/Canary', 'ES high'],
    [['es-MX'], 'Europe/Madrid', 'ES medium'],
    [['de-DE'], 'Europe/Madrid', 'ES low*'],
    [['es-MX'], 'America/Mexico_City', null],
    [['es-ES'], 'Europe/Andorra', null],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
