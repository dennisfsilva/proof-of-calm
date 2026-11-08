// The country profiles (packages/content/jurisdictions, docs/JURISDICTIONS.md §2) and what the shell derives
// from them: the core's `CountryRules`, the profiles the locale-and-timezone suggestion reads (§3), and the
// order of the country picker. A profile is several kilobytes of card text and sources, so each file is its
// own chunk, loaded where a card, a source link or the picker shows it: the shell boots on the country's
// generated rules file instead (./rules.ts, ADR-0049); the onboarding and Settings load every profile.
import type { CountryRules, CountrySuggestion, SuggestProfile } from '@proofofcalm/core';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { asDate } from './brands.ts';

/** The generic profile for every country without a reviewed rule set; never suggested (docs/JURISDICTIONS.md §2). */
export const GENERIC_COUNTRY = 'XX';

export const COUNTRY_CODES = ['DE', 'ES', 'FR', 'GB', 'IE', 'IT', 'NL', 'PT', 'US', 'XX'] as const;
export type ProfileCode = (typeof COUNTRY_CODES)[number];

// One dynamic import per file, so that a bundler splits them. Only bundlers and Vitest run these (the
// validation CLI reads the files from disk), so they need no `with { type: 'json' }` attribute.
const FILES: Readonly<Record<ProfileCode, () => Promise<{ readonly default: unknown }>>> = {
  DE: () => import('../../jurisdictions/de.json'),
  ES: () => import('../../jurisdictions/es.json'),
  FR: () => import('../../jurisdictions/fr.json'),
  GB: () => import('../../jurisdictions/gb.json'),
  IE: () => import('../../jurisdictions/ie.json'),
  IT: () => import('../../jurisdictions/it.json'),
  NL: () => import('../../jurisdictions/nl.json'),
  PT: () => import('../../jurisdictions/pt.json'),
  US: () => import('../../jurisdictions/us.json'),
  XX: () => import('../../jurisdictions/xx.json'),
};

const isProfileCode = (code: string): code is ProfileCode => Object.hasOwn(FILES, code);

const loaded = new Map<string, CountryProfile>();

// The files pass the schema in CI and in this package's tests, so they are not parsed again on the device.
const load = async (code: ProfileCode) => {
  const profile = (await FILES[code]()).default as CountryProfile;
  loaded.set(code, profile);
  return profile;
};

/** The profile of a country, or null where none exists yet (the shell then offers the generic one). */
export async function loadProfile(code: string): Promise<CountryProfile | null> {
  return isProfileCode(code) ? load(code) : null;
}

/** Every profile, for the suggestion and the picker. */
export function loadProfiles(): Promise<CountryProfile[]> {
  return Promise.all(COUNTRY_CODES.map(load));
}

/** The profile once any load has read it, at once, else null: the shell boots on the rules file, not on this one. */
export function loadedProfile(code: string): CountryProfile | null {
  return loaded.get(code) ?? null;
}

/**
 * The URL of the source a rule's `ruleSources` key names, wherever it stands in the list, or null where no
 * source holds that key (docs/JURISDICTIONS.md §2): the card links each rule to it.
 */
export function ruleSource(profile: CountryProfile, rule: keyof CountryProfile['ruleSources']): string | null {
  const key = profile.ruleSources[rule];
  return profile.sources.find((source) => source.key === key)?.url ?? null;
}

/** The URL of the source `ruleSources.holdingRule` names, the law that sets the rule. */
export function holdingRuleSource(profile: CountryProfile): string | null {
  return ruleSource(profile, 'holdingRule');
}

/** What the core consumes of a profile (docs/DOMAIN.md §4); the card and the sources stay with the profile. */
export function countryRules(profile: CountryProfile): CountryRules {
  const { status } = profile;
  return {
    code: profile.code,
    name: profile.name,
    currency: profile.currency,
    locales: profile.locales,
    numberFormatLocale: profile.numberFormatLocale,
    dateFormatLocale: profile.dateFormatLocale,
    timezones: profile.timezones,
    ...(profile.englishConfidence === undefined ? {} : { englishConfidence: profile.englishConfidence }),
    taxYear: profile.taxYear,
    computationModel: profile.computationModel,
    holdingRule: profile.holdingRule,
    holdingRuleOverrides: profile.holdingRuleOverrides.map((override) => ({
      ...override,
      acquiredFrom: asDate(override.acquiredFrom),
    })),
    holdingRuleConditions: profile.holdingRuleConditions,
    lotRule: profile.lotRule,
    lotScope: profile.lotScope,
    status: {
      version: status.version,
      changedOn: asDate(status.changedOn),
      changeNotice: status.changeNotice,
      lastReviewed: asDate(status.lastReviewed),
      nextReviewDue: asDate(status.nextReviewDue),
    },
  };
}

/**
 * The profiles `suggestCountry` reads. The generic profile is left out: it names no country, so no
 * language or timezone can point to it; it is offered first in the picker when nothing is suggested.
 */
export function suggestionProfiles(profiles: readonly CountryProfile[]): SuggestProfile[] {
  return profiles.filter((profile) => profile.code !== GENERIC_COUNTRY).map(countryRules);
}

export type CountryChoice = Pick<CountryProfile, 'code' | 'name'>;

/**
 * The picker's order (docs/JURISDICTIONS.md §3): the suggested country first, the others by name, and the
 * generic profile last; with no suggestion, the generic profile first ("pt-BR in São Paulo: XX first").
 */
export function countryChoices(
  profiles: readonly CountryProfile[],
  suggestion: Pick<CountrySuggestion, 'country'> | null,
): CountryChoice[] {
  const choices = profiles.map(({ code, name }): CountryChoice => ({ code, name }));
  const generic = choices.filter((choice) => choice.code === GENERIC_COUNTRY);
  const named = choices
    .filter((choice) => choice.code !== GENERIC_COUNTRY)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (suggestion === null) return [...generic, ...named];
  const first = named.filter((choice) => choice.code === suggestion.country);
  return [...first, ...named.filter((choice) => choice.code !== suggestion.country), ...generic];
}
