// The core's view of each country, `CountryRules` (docs/DOMAIN.md §4), generated from its profile into
// packages/content/rules by `pnpm --filter @proofofcalm/content rules` (ADR-0049). The shell boots on this small
// generated file (the measurement: ADR-0049); the profile with its card text and sources, several kilobytes,
// loads only where a card, a source link or the picker shows it (`loadProfile` in ./countries.ts).
import type { CountryRules } from '@proofofcalm/core';
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

const isRulesCode = (code: string): code is ProfileCode => Object.hasOwn(RULES, code);

// The files are the script's output over profiles that pass the schema in CI and in this package's tests, and
// the tests parse each with the core's schema, so they are not parsed again on the device.
/** The rules of a country, or null where no profile exists yet (the shell then takes the generic profile's). */
export async function loadRules(code: string): Promise<CountryRules | null> {
  return isRulesCode(code) ? ((await RULES[code]()).default as CountryRules) : null;
}
