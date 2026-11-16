// Which locales format what (ADR-0023): numbers follow the country (its profile's locale in the UI
// language where it has one, so Belgium formats as nl-BE or fr-BE); dates in copy, month and weekday
// names follow the UI language. English copy is British (docs/CONTENT-STYLE.md), so English is en-GB.
// A plan's country gives its profile's locales even when its rules did not load (`countryLocales`, ADR-0049).
import { type CountryLocales, numberLocaleFor, spokenLocale } from '@proofofcalm/content';

export const UI_LANGUAGES = ['en', 'pt-PT', 'de'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

const UI_LOCALES: Readonly<Record<UiLanguage, string>> = { en: 'en-GB', 'pt-PT': 'pt-PT', de: 'de-DE' };

export type Locales = {
  /** Month and weekday names, relative time, lists. */
  readonly ui: string;
  /** Money, units and percentages. */
  readonly numbers: string;
  /** The country's order for a date in digits, where one is needed; copy never writes one (ADR-0023). */
  readonly dates: string;
};

/** The locales of a country's profile in the UI language; the UI language's own with no country (no plan). */
export function localesFor(language: UiLanguage, profile: CountryLocales | null): Locales {
  const ui = UI_LOCALES[language];
  if (profile === null) return { ui, numbers: ui, dates: ui };
  const numbers = numberLocaleFor(language, profile);
  return { ui, numbers, dates: spokenLocale(language, profile) ?? profile.dateFormatLocale };
}
