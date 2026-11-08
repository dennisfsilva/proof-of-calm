// Which locales format what (ADR-0023): numbers follow the country (its profile's locale in the UI
// language where it has one, so Belgium formats as nl-BE or fr-BE); dates in copy, month and weekday
// names follow the UI language. English copy is British (docs/CONTENT-STYLE.md), so English is en-GB.
import type { CountryRules } from '@proofofcalm/core';

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

type Profile = Pick<CountryRules, 'locales' | 'numberFormatLocale' | 'dateFormatLocale'>;

export function localesFor(language: UiLanguage, profile: Profile | null): Locales {
  const ui = UI_LOCALES[language];
  if (profile === null) return { ui, numbers: ui, dates: ui };
  const base = language.split('-')[0];
  const spoken = profile.locales.find((locale) => locale.split('-')[0] === base);
  return { ui, numbers: spoken ?? profile.numberFormatLocale, dates: spoken ?? profile.dateFormatLocale };
}
