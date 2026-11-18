// The country suggestion from the device's languages and timezone (docs/JURISDICTIONS.md §3), never from
// an IP address (ADR-0014). Residence, not language, decides tax: without a usable timezone,
// or with one outside every profile, nothing is named, and the onboarding shows the full list beside any suggestion.
import type { CountryRules } from '../schema/country';
import type { CountryCode } from '../schema/ids';

/** What the suggestion reads of a profile; `englishConfidence` defaults to `medium`. */
export type SuggestProfile = Pick<CountryRules, 'code' | 'locales' | 'timezones' | 'englishConfidence'>;

/**
 * A named country with its confidence, or nothing named (no usable timezone, or one that no profile or
 * several list). `languageDiffers`: the device's first language names another country we serve, so the
 * step says "residence, not language, decides tax".
 */
export type CountrySuggestion =
  | {
      readonly country: CountryCode;
      readonly confidence: 'high' | 'medium' | 'low';
      readonly languageDiffers: boolean;
    }
  | { readonly country: null; readonly confidence: null; readonly languageDiffers: boolean };

type Tag = { readonly language: string; readonly region: string | null };

// BCP 47: a language, an optional script, then an optional region of two letters or three digits.
const TAG = /^([a-z]{2,3})(?:-[a-z]{4})?(?:-([a-z]{2}|\d{3}))?(?:-|$)/i;

function readTag(tag: string): Tag | null {
  const match = TAG.exec(tag);
  if (match === null) return null;
  const [, language = '', region] = match;
  return { language: language.toLowerCase(), region: region === undefined ? null : region.toUpperCase() };
}

/** A timezone that says where the device is; a missing one, `UTC` and `Etc/*` say nothing. */
const usableZone = (timeZone: string | null): timeZone is string =>
  timeZone !== null && timeZone !== '' && timeZone !== 'UTC' && !timeZone.startsWith('Etc/');

export function suggestCountry(
  device: { readonly languages: readonly string[]; readonly timeZone: string | null },
  profiles: readonly SuggestProfile[],
): CountrySuggestion {
  const tags = device.languages.flatMap((tag) => readTag(tag) ?? []);
  const codes = new Set(profiles.map((profile) => profile.code));
  // English is a lingua franca; another first language that names a country we serve points elsewhere.
  const [first] = tags;
  const pointsElsewhere = (country: CountryCode | null) =>
    first !== undefined &&
    first.language !== 'en' &&
    first.region !== null &&
    first.region !== country &&
    codes.has(first.region);

  const { timeZone } = device;
  const listing = usableZone(timeZone) ? profiles.filter((candidate) => candidate.timezones.includes(timeZone)) : [];
  const [profile, ...others] = listing;
  if (profile === undefined || others.length > 0) {
    return { country: null, confidence: null, languageDiffers: pointsElsewhere(null) };
  }
  const country = profile.code;
  const spoken = new Set(profile.locales.map((locale) => readTag(locale)?.language));
  if (tags.some((tag) => tag.region === country && spoken.has(tag.language))) {
    return { country, confidence: 'high', languageDiffers: pointsElsewhere(country) };
  }
  if (pointsElsewhere(country)) return { country, confidence: 'low', languageDiffers: true };
  const visitor = first?.language === 'en' && profile.englishConfidence === 'low';
  return { country, confidence: visitor ? 'low' : 'medium', languageDiffers: false };
}
