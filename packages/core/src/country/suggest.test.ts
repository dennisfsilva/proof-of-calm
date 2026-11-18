import { describe, expect, it } from 'vitest';
import { type SuggestProfile, suggestCountry } from './suggest';

// The profiles of docs/JURISDICTIONS.md as the suggestion reads them: languages and timezones only.
const US_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Puerto_Rico',
];
const PROFILES: SuggestProfile[] = [
  {
    code: 'PT',
    locales: ['pt-PT'],
    timezones: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
    englishConfidence: 'low',
  },
  { code: 'DE', locales: ['de-DE'], timezones: ['Europe/Berlin', 'Europe/Busingen'] },
  { code: 'NL', locales: ['nl-NL'], timezones: ['Europe/Amsterdam'] },
  { code: 'ES', locales: ['es-ES', 'ca-ES'], timezones: ['Europe/Madrid', 'Africa/Ceuta', 'Atlantic/Canary'] },
  { code: 'FR', locales: ['fr-FR'], timezones: ['Europe/Paris'] },
  { code: 'IT', locales: ['it-IT'], timezones: ['Europe/Rome'] },
  { code: 'BE', locales: ['nl-BE', 'fr-BE', 'de-BE'], timezones: ['Europe/Brussels'] },
  { code: 'IE', locales: ['en-IE', 'ga-IE'], timezones: ['Europe/Dublin'] },
  { code: 'GB', locales: ['en-GB'], timezones: ['Europe/London'] },
  { code: 'US', locales: ['en-US'], timezones: US_ZONES },
  { code: 'XX', locales: ['en'], timezones: ['UTC'] },
];
type Row = readonly [languages: string[], timeZone: string | null, expected: string];

// The ambiguity table of docs/JURISDICTIONS.md §3, one row per signal: "PT high", "ES low*", "none" (* the
// device language names another country we serve, so the page says residence, not language, decides).
const TABLE: Row[] = [
  [['pt-BR'], 'America/Sao_Paulo', 'none'],
  [['nl-BE'], 'Europe/Brussels', 'BE high'],
  [['fr-BE'], 'Europe/Brussels', 'BE high'],
  [['fr-CH', 'de-CH'], 'Europe/Zurich', 'none'],
  [['de-AT'], 'Europe/Vienna', 'none'],
  [['en-GB'], 'Europe/Dublin', 'IE medium'],
  [['en-IE'], 'Europe/London', 'GB medium'],
  [['en-US'], 'Europe/Berlin', 'DE medium'],
  [['es-MX'], 'America/Mexico_City', 'none'],
  [['en'], 'America/New_York', 'US medium'],
  ...US_ZONES.map((zone): Row => [['en-US'], zone, 'US high']),
  ...['America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo'].map(
    (zone): Row => [['en-US'], zone, 'none'],
  ),
  [['es-US'], 'America/Los_Angeles', 'US medium'],
  [['en-CA', 'fr-CA'], 'America/Toronto', 'none'],
  [['it-CH'], 'Europe/Zurich', 'none'],
  [['en-GB'], 'Europe/Rome', 'IT medium'],
  [['en-US'], 'Europe/Brussels', 'BE medium'],
  [['pt-BR'], 'Europe/Lisbon', 'PT medium'],
  ...['de-AT', 'de-CH', 'de-LU'].map((tag): Row => [[tag], 'Europe/Berlin', 'DE medium']),
  ...['fr-CH', 'fr-LU', 'fr-CA'].map((tag): Row => [[tag], 'Europe/Paris', 'FR medium']),
  // The table listed fr-BE with these; Belgium is a profile, so it reads as nl-BE in Amsterdam does.
  [['fr-BE'], 'Europe/Paris', 'FR low*'],
  ...['es-MX', 'es-AR', 'es-419'].flatMap((tag): Row[] => [
    [[tag], 'Europe/Madrid', 'ES medium'],
    [[tag], 'Atlantic/Canary', 'ES medium'],
  ]),
  [['nl-BE'], 'Europe/Amsterdam', 'NL low*'],
  [['en-GB'], 'Europe/Lisbon', 'PT low'],
  [['en-US'], 'Europe/Lisbon', 'PT low'],
  ...['Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Paris'].map(
    (zone): Row => [['en-GB'], zone, `${PROFILES.find((p) => p.timezones.includes(zone))?.code} medium`],
  ),
  [['de-DE'], 'Europe/Madrid', 'ES low*'],
  // A zone outside every profile names nothing; a language that names a profile still adds the line.
  ...[
    ['fr-FR', 'Europe/Monaco', 'none*'],
    ['es-ES', 'Europe/Andorra', 'none*'],
    ['en-GB', 'Europe/Gibraltar', 'none'],
    ['fr-FR', 'Europe/Luxembourg', 'none*'],
    ['de-DE', 'Europe/Vienna', 'none*'],
    ['de-DE', 'Europe/Zurich', 'none*'],
    ['en-US', 'Asia/Tokyo', 'none'],
    ['en-GB', 'Australia/Sydney', 'none'],
  ].map(([tag, zone, expected]): Row => [[tag as string], zone as string, expected as string]),
  // Without a usable timezone nothing is named; the line still shows for a language naming a country we serve.
  [['pt-PT'], 'UTC', 'none*'],
  [['en-US'], null, 'none'],
  [['de'], 'Etc/UTC', 'none'],
  [['nl'], '', 'none'],
  [['en'], 'UTC', 'none'],
  [['en-US', 'en'], 'UTC', 'none'],
  [['en-US', 'en'], 'Atlantic/Reykjavik', 'none'],
  // The line follows the first language at every confidence and when nothing is named.
  [['pt-PT', 'de-DE'], 'Europe/Berlin', 'DE high*'],
  [['pt-PT'], 'Europe/Berlin', 'DE low*'],
  [['pt-PT'], 'America/Toronto', 'none*'],
  [['de-DE'], 'Europe/Lisbon', 'PT low*'],
  [['de-DE', 'pt-PT'], 'Europe/Lisbon', 'PT high*'],
];

const describeSuggestion = (languages: string[], timeZone: string | null) => {
  const suggestion = suggestCountry({ languages, timeZone }, PROFILES);
  const named = suggestion.country === null ? 'none' : `${suggestion.country} ${suggestion.confidence}`;
  return `${named}${suggestion.languageDiffers ? '*' : ''}`;
};

describe('suggestCountry (docs/JURISDICTIONS.md §3)', () => {
  it.each(TABLE)('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(describeSuggestion(languages, timeZone)).toBe(expected);
  });

  it('takes any of the languages that names the timezone country in its own language as certain', () => {
    expect(describeSuggestion(['en-US', 'pt-PT'], 'Europe/Lisbon')).toBe('PT high');
    expect(describeSuggestion(['en-PT'], 'Europe/Lisbon')).toBe('PT low');
  });

  it('ignores tags it cannot read and works without languages', () => {
    expect(describeSuggestion(['*', 'x-private', 'zh-Hant-TW', 'de-DE'], 'Europe/Berlin')).toBe('DE high');
    expect(describeSuggestion([], 'Europe/Paris')).toBe('FR medium');
    expect(describeSuggestion([], null)).toBe('none');
  });

  it('suggests nothing for a timezone that two profiles list', () => {
    const shared = [...PROFILES, { code: 'LU', locales: ['fr-LU'], timezones: ['Europe/Brussels'] }];
    expect(suggestCountry({ languages: ['fr-BE'], timeZone: 'Europe/Brussels' }, shared)).toEqual({
      country: null,
      confidence: null,
      languageDiffers: true,
    });
  });
});
