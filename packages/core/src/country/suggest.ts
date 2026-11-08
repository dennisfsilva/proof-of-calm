// The country suggestion from the device's languages and timezone (docs/JURISDICTIONS.md §3), never from
// an IP address (ADR-0014). Residence, not language, decides tax: a known timezone outside every profile
// suggests nothing, and the onboarding shows the full list beside any suggestion.
import type { CountryRules } from '../schema/country';
import type { CountryCode } from '../schema/ids';

/** What the suggestion reads of a profile; `englishConfidence` defaults to `medium`. */
export type SuggestProfile = Pick<CountryRules, 'code' | 'locales' | 'timezones' | 'englishConfidence'>;

export type CountrySuggestion = {
  readonly country: CountryCode;
  readonly confidence: 'high' | 'medium' | 'low';
  /** The device's first language names another country we serve: "residence, not language, decides tax". */
  readonly languageDiffers: boolean;
};

type Tag = { readonly language: string; readonly region: string | null };

// BCP 47: a language, an optional script, then an optional region of two letters or three digits.
const TAG = /^([a-z]{2,3})(?:-[a-z]{4})?(?:-([a-z]{2}|\d{3}))?(?:-|$)/i;

function readTag(tag: string): Tag | null {
  const match = TAG.exec(tag);
  if (match === null) return null;
  const [, language = '', region] = match;
  return { language: language.toLowerCase(), region: region === undefined ? null : region.toUpperCase() };
}

/** A timezone that says where the device is; `UTC` and `Etc/*` say nothing. */
const usableZone = (timeZone: string | null) =>
  timeZone === null || timeZone === '' || timeZone === 'UTC' || timeZone.startsWith('Etc/') ? null : timeZone;

/** Without a usable timezone: a language's region that is a profile, else a bare language that names one. */
function fromLanguages(tags: readonly Tag[], codes: ReadonlySet<string>): CountrySuggestion | null {
  const regional = tags.find((tag) => tag.region !== null && codes.has(tag.region));
  const bare = tags.find((tag) => tag.region === null && codes.has(tag.language.toUpperCase()));
  const country = regional?.region ?? bare?.language.toUpperCase();
  return country === undefined ? null : { country, confidence: 'low', languageDiffers: false };
}

export function suggestCountry(
  device: { readonly languages: readonly string[]; readonly timeZone: string | null },
  profiles: readonly SuggestProfile[],
): CountrySuggestion | null {
  const tags = device.languages.flatMap((tag) => readTag(tag) ?? []);
  const codes = new Set(profiles.map((profile) => profile.code));
  const zone = usableZone(device.timeZone);
  if (zone === null) return fromLanguages(tags, codes);

  const [profile, ...others] = profiles.filter((candidate) => candidate.timezones.includes(zone));
  if (profile === undefined || others.length > 0) return null;
  const spoken = new Set(profile.locales.map((locale) => readTag(locale)?.language));
  if (tags.some((tag) => tag.region === profile.code && spoken.has(tag.language))) {
    return { country: profile.code, confidence: 'high', languageDiffers: false };
  }
  // English is a lingua franca; another language that names a country we serve points elsewhere.
  const [first] = tags;
  const elsewhere =
    first !== undefined &&
    first.language !== 'en' &&
    first.region !== null &&
    first.region !== profile.code &&
    codes.has(first.region);
  if (elsewhere) return { country: profile.code, confidence: 'low', languageDiffers: true };
  const visitor = first?.language === 'en' && profile.englishConfidence === 'low';
  return { country: profile.code, confidence: visitor ? 'low' : 'medium', languageDiffers: false };
}
