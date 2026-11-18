import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type SuggestProfile, suggestCountry } from './suggest';

// A handful of profiles, a zone two of them share, and tags that name them, others and nothing.
const PROFILES: SuggestProfile[] = [
  { code: 'PT', locales: ['pt-PT'], timezones: ['Europe/Lisbon'], englishConfidence: 'low' },
  { code: 'DE', locales: ['de-DE'], timezones: ['Europe/Berlin', 'Europe/Shared'] },
  { code: 'BE', locales: ['nl-BE', 'fr-BE'], timezones: ['Europe/Brussels', 'Europe/Shared'] },
  { code: 'US', locales: ['en-US'], timezones: ['America/New_York'] },
];
const CODES = new Set(PROFILES.map((profile) => profile.code));
const UNUSABLE = [null, '', 'UTC', 'Etc/UTC', 'Etc/GMT+1'];
const ZONES = [
  ...UNUSABLE,
  'Europe/Lisbon',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Shared',
  'America/New_York',
  'Asia/Tokyo',
];
const TAGS = [
  'pt-PT',
  'pt-BR',
  'pt',
  'de-DE',
  'de-AT',
  'nl-BE',
  'fr-BE',
  'en-US',
  'en-GB',
  'en',
  'es-419',
  '*',
  'x-private',
];

const devices = fc.record({
  languages: fc.array(fc.constantFrom(...TAGS), { maxLength: 4 }),
  timeZone: fc.constantFrom(...ZONES),
});

// docs/JURISDICTIONS.md §3: the first readable tag is not English, has a region, and that region is a
// profile other than the one named (any profile when nothing is named).
function expectedLine(languages: readonly string[], country: string | null): boolean {
  const first = languages.find((tag) => /^[a-z]{2,3}(?:-|$)/i.test(tag));
  if (first === undefined) return false;
  const [language, region] = first.split('-');
  return language !== 'en' && region !== undefined && region !== country && CODES.has(region);
}

describe('suggestCountry (properties)', () => {
  it('names nothing without a usable timezone', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...TAGS), { maxLength: 4 }),
        fc.constantFrom(...UNUSABLE),
        (languages, timeZone) => {
          const suggestion = suggestCountry({ languages, timeZone }, PROFILES);
          expect(suggestion.country).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('gives a confidence exactly when it names a country', () => {
    fc.assert(
      fc.property(devices, (device) => {
        const suggestion = suggestCountry(device, PROFILES);
        expect(suggestion.confidence === null).toBe(suggestion.country === null);
      }),
      { numRuns: 100 },
    );
  });

  it('shows the residence line by the first language alone, never with medium', () => {
    fc.assert(
      fc.property(devices, (device) => {
        const suggestion = suggestCountry(device, PROFILES);
        expect(suggestion.languageDiffers).toBe(expectedLine(device.languages, suggestion.country));
        if (suggestion.confidence === 'medium') expect(suggestion.languageDiffers).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
