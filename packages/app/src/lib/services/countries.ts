// The countries port (docs/ARCHITECTURE.md "Inside packages/app"): the Learn screens' country library as plain
// models, the list's rows and one country's card, derived here from the profiles of packages/content and the
// core's `underReview` at the clock's today. The lazy Learn chunk reads them through Services and imports no
// value of content or core: Rolldown groups modules by the set of entries that reach them, so a value import of a
// module the app entry reaches too would split it out of the entry's shared chunk and cost Today bytes
// (docs/ENGINEERING.md §4). `browser.ts` hands the port the real loaders, `testing.ts` the profiles in memory.
import { type CountryProfile, countryRules, GENERIC_COUNTRY, ruleSource } from '@proofofcalm/content';
import { type CalendarDate, underReview } from '@proofofcalm/core';
import type { Clock } from '../ports';

type RuleKey = keyof CountryProfile['ruleSources'];

/** A row of the library's list: a reviewed country, with the words its card's date line takes (docs/LEGAL.md §4). */
export type CountryEntry = {
  readonly code: string;
  readonly name: string;
  readonly lastReviewed: CalendarDate;
  readonly nextReviewDue: CalendarDate;
  /** From the day after twelve months past `nextReviewDue` (docs/JURISDICTIONS.md §1). */
  readonly underReview: boolean;
};

/** What a country's card renders (docs/JURISDICTIONS.md §1 and §2, docs/EDUCATION.md §4). */
export type CountryCardModel = {
  readonly name: string;
  /** The generic profile: the generic date line, no source link, never under review. */
  readonly generic: boolean;
  readonly underReview: boolean;
  readonly lastReviewed: CalendarDate;
  readonly card: CountryProfile['card'];
  readonly holdingRuleConditions: CountryProfile['holdingRuleConditions'];
  /** Each rule's source, the URL its `ruleSources` key names; null where none holds the key, and for the generic profile. */
  readonly ruleSources: Readonly<Record<RuleKey, string | null>>;
  /** The profile's sources in the file's order, which also back the rules without a link. */
  readonly sources: CountryProfile['sources'];
};

export type Countries = {
  /** The library's countries by name: every profile but the generic one, which names no country (docs/JURISDICTIONS.md §2). */
  list(): Promise<CountryEntry[]>;
  /** One library country's card by its upper-case code; null for any other code, the generic one's too. */
  card(code: string): Promise<CountryCardModel | null>;
  /**
   * The card of the rules a plan in `code` runs on, which leads Taxes where you live (docs/EDUCATION.md §4): the
   * country's, or the generic profile's for `XX` and for a code with no profile file; it rejects when a load fails.
   */
  planCard(code: string): Promise<CountryCardModel>;
};

/** The profile loaders of packages/content, or the profiles in memory: `one` answers null for a code with no file. */
export type ProfileLoaders = {
  readonly all: () => Promise<CountryProfile[]>;
  readonly one: (code: string) => Promise<CountryProfile | null>;
};

const RULES: readonly RuleKey[] = ['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'];

export function countryEntries(profiles: readonly CountryProfile[], today: CalendarDate): CountryEntry[] {
  return profiles
    .filter((profile) => profile.code !== GENERIC_COUNTRY)
    .map((profile) => {
      const { status } = countryRules(profile);
      return {
        code: profile.code,
        name: profile.name,
        lastReviewed: status.lastReviewed,
        nextReviewDue: status.nextReviewDue,
        underReview: underReview(status, today),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function countryCardModel(profile: CountryProfile, today: CalendarDate): CountryCardModel {
  const generic = profile.code === GENERIC_COUNTRY;
  const { status } = countryRules(profile);
  return {
    name: profile.name,
    generic,
    underReview: !generic && underReview(status, today),
    lastReviewed: status.lastReviewed,
    card: profile.card,
    holdingRuleConditions: profile.holdingRuleConditions,
    ruleSources: Object.fromEntries(
      RULES.map((rule) => [rule, generic ? null : ruleSource(profile, rule)]),
    ) as CountryCardModel['ruleSources'],
    sources: profile.sources,
  };
}

/**
 * The port over the loaders: each answer is derived at the clock's today when it is asked, as `rules` answers.
 * Like the other ports it keeps nothing; the screen keeps the promise it reads with `use()`, which wants the
 * same instance on every render, and that code lives in the lazy chunk, where it costs Today nothing.
 */
export function createCountries(load: ProfileLoaders, clock: Clock): Countries {
  return {
    list: async () => countryEntries(await load.all(), clock.today()),
    card: async (code) => {
      const profile = code === GENERIC_COUNTRY ? null : await load.one(code);
      return profile === null ? null : countryCardModel(profile, clock.today());
    },
    planCard: async (code) => {
      const profile = (await load.one(code)) ?? (await load.one(GENERIC_COUNTRY));
      if (profile === null) throw new Error('The generic profile has no file.');
      return countryCardModel(profile, clock.today());
    },
  };
}
