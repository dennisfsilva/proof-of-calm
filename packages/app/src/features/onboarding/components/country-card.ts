import { type CountryProfile, contentLanguageOf, countryRules } from '@proofofcalm/content';
import type { CalendarDate, Template } from '@proofofcalm/core';
import type { Formatters } from '../../../lib/format';
import {
  type EarlyNotice,
  earlyOpenOf,
  type HoldingCountry,
  holdingCountryOf,
  ruleNameOf,
  sellWindowValueOf,
} from '../../plan';

// The country's card and the template's early window under its rule, as the numbers step and the summary show them.

/** The early opening the template's own dates ask to accept under the country's rule, if any, with its card. */
export function earlyOf(
  template: Template,
  profile: CountryProfile,
  format: Formatters,
  today: CalendarDate,
): EarlyNotice | null {
  const rules = countryRules(profile);
  const { holdingRule } = rules;
  if (template.lastBuy === undefined) return null;
  const early = earlyOpenOf({ lastBuy: template.lastBuy, holdingRule }, sellWindowValueOf(template.sellWindow));
  if (early === null) return null;
  return { ...early, rule: ruleNameOf(holdingRule, rules), country: cardOf(profile, format, today) };
}

/** The country's card from its profile; `countryRules` gives a copy, which carries no mark: the profile's (ADR-0057). */
export function cardOf(profile: CountryProfile, format: Formatters, today: CalendarDate): HoldingCountry {
  const rules = countryRules(profile);
  const card = holdingCountryOf(rules, format.date(rules.status.lastReviewed), profile, today);
  return { ...card, language: contentLanguageOf(profile) };
}
