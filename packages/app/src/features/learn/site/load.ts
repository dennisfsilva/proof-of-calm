/// <reference path="../learn-modules.d.ts" />
import { LEARN_BODIES, LEARN_MODULES } from 'virtual:learn-modules';
import { countryRules, GENERIC_COUNTRY, type LearnModuleMeta, loadProfiles } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import {
  type CountryCardModel,
  type CountryEntry,
  countryCardModel,
  countryEntries,
} from '../../../lib/services/countries';
import { pastFalls } from '../../../lib/services/red-day-model';
import type { PastFall } from '../../../lib/services/red-day-types';
import { DRAWDOWN_COINS } from '../components/module-chart';
import type { ModuleViewProps } from '../components/module-view';
import type { HoldingRules } from './holding-tool.ts';

// What the static Learn pages read, loaded before the web host's prerender renders them: a static render cannot
// suspend on a lazy body or wait for the cycles file, so every body is awaited here, and every profile.

export type Body = ModuleViewProps['Body'];

export type LearnSite = {
  readonly modules: readonly LearnModuleMeta[];
  /** Every module's body by its slug. */
  readonly bodies: ReadonlyMap<string, Body>;
  /** The cycles file's rows of every coin it holds, in its order, for a module's chart. */
  readonly falls: readonly PastFall[];
};

export async function loadLearnSite(): Promise<LearnSite> {
  const [bodies, falls] = await Promise.all([
    Promise.all(Object.entries(LEARN_BODIES).map(async ([slug, load]) => [slug, (await load()).default] as const)),
    pastFalls(DRAWDOWN_COINS),
  ]);
  return { modules: LEARN_MODULES, bodies: new Map(bodies), falls };
}

export type CountrySite = {
  /** The library's countries by name: every profile but the generic one, at the today passed in. */
  readonly entries: CountryEntry[];
  /** Each listed country's card by its upper-case code, at the same today. */
  readonly cards: ReadonlyMap<string, CountryCardModel>;
  /** Each listed country's holding rule and overrides by the same code, for the holding-date tool. */
  readonly rules: ReadonlyMap<string, HoldingRules>;
};

/** Every profile, derived as the app's countries port derives them, at the day the prerender passes in. */
export async function loadCountrySite(today: CalendarDate): Promise<CountrySite> {
  const profiles = await loadProfiles();
  const listed = profiles.filter((profile) => profile.code !== GENERIC_COUNTRY);
  return {
    entries: countryEntries(listed, today),
    cards: new Map(listed.map((profile) => [profile.code, countryCardModel(profile, today)])),
    rules: new Map(
      listed.map((profile) => {
        const rules = countryRules(profile);
        return [profile.code, { rule: rules.holdingRule, overrides: rules.holdingRuleOverrides }];
      }),
    ),
  };
}
