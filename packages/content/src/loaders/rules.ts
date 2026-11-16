// The core's view of each country, `CountryRules` (docs/DOMAIN.md §4), generated from its profile into
// packages/content/rules by `pnpm --filter @proofofcalm/content rules` (ADR-0049). The shell boots on this small
// generated file (the measurement: ADR-0049); the profile with its card text and sources, several kilobytes,
// loads only where a card, a source link or the picker shows it (`loadProfile` in ./countries.ts).
import type { CountryRules } from '@proofofcalm/core';
import type { ContentLanguage, OverlayLanguage } from '../i18n/overlay.ts';
import type { ProfileCode } from './countries.ts';

// One dynamic import per file, so that a bundler splits them. Only bundlers and Vitest run these (the script
// reads the profiles from disk), so they need no `with { type: 'json' }` attribute. The record's keys are the
// profile codes, so a profile without a rules import fails the typecheck.
const RULES: Readonly<Record<ProfileCode, () => Promise<{ readonly default: unknown }>>> = {
  DE: () => import('../../rules/de.json'),
  ES: () => import('../../rules/es.json'),
  FR: () => import('../../rules/fr.json'),
  GB: () => import('../../rules/gb.json'),
  IE: () => import('../../rules/ie.json'),
  IT: () => import('../../rules/it.json'),
  NL: () => import('../../rules/nl.json'),
  PT: () => import('../../rules/pt.json'),
  US: () => import('../../rules/us.json'),
  XX: () => import('../../rules/xx.json'),
};

// The rules over each translated profile (ADR-0057), generated into rules/<language>/ for each language with a
// folder under packages/content/i18n; a language without one takes the English files.
const TRANSLATED: Readonly<Partial<Record<OverlayLanguage, typeof RULES>>> = {
  'pt-PT': {
    DE: () => import('../../rules/pt-PT/de.json'),
    ES: () => import('../../rules/pt-PT/es.json'),
    FR: () => import('../../rules/pt-PT/fr.json'),
    GB: () => import('../../rules/pt-PT/gb.json'),
    IE: () => import('../../rules/pt-PT/ie.json'),
    IT: () => import('../../rules/pt-PT/it.json'),
    NL: () => import('../../rules/pt-PT/nl.json'),
    PT: () => import('../../rules/pt-PT/pt.json'),
    US: () => import('../../rules/pt-PT/us.json'),
    XX: () => import('../../rules/pt-PT/xx.json'),
  },
};

/** The languages with generated rules files, for the stale test. */
export const RULES_LANGUAGES = Object.keys(TRANSLATED);

const isRulesCode = (code: string): code is ProfileCode => Object.hasOwn(RULES, code);

const english = async (code: ProfileCode) => (await RULES[code]()).default as CountryRules;

// A language's chunk sits outside the worker's precache, so offline before it was ever fetched it fails to load:
// the English file then answers; it holds the same holding rule, numbers and dates (ADR-0057), so on Today only the
// words are English. Read the file inside the try: Vite's preload wrapper can resolve a failed import to undefined
// (ADR-0057, Corrections of 2026-11-16).
const inLanguage = async (code: ProfileCode, language: ContentLanguage) => {
  const files = language === 'en' ? undefined : TRANSLATED[language];
  if (files === undefined) return english(code);
  try {
    return (await files[code]()).default as CountryRules;
  } catch {
    return english(code);
  }
};

// The files are the script's output over profiles that pass the schema in CI and in this package's tests, and
// the tests parse each with the core's schema, so they are not parsed again on the device.
/** The rules of a country in a language, or null where no profile exists yet (the shell then takes the generic's). */
export async function loadRules(code: string, language: ContentLanguage = 'en'): Promise<CountryRules | null> {
  return isRulesCode(code) ? inLanguage(code, language) : null;
}
