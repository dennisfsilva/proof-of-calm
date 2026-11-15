// Each country's number and date locales (ADR-0023), generated with the rules files into
// packages/content/rules/locales.json by `pnpm --filter @proofofcalm/content rules` (ADR-0049, Deviations of
// 2026-11-15). The file is read at once, unlike the rules files, so a plan whose rules chunk did not arrive still
// reads, writes and stores numbers as its country does, never in the UI language's locale (#261 A).
import type { CountryCode, CountryRules } from '@proofofcalm/core';
import file from '../../rules/locales.json' with { type: 'json' };

export type CountryLocales = Pick<CountryRules, 'locales' | 'numberFormatLocale' | 'dateFormatLocale'>;

const LOCALES: Readonly<Record<string, CountryLocales>> = file;

/** A country's locales as its profile holds them; the generic profile's (XX) for a code without one. */
export function countryLocales(code: CountryCode): CountryLocales {
  return (Object.hasOwn(LOCALES, code) ? LOCALES[code] : undefined) ?? file.XX;
}
