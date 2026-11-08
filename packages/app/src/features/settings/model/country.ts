// What the country change lists before the person confirms it (docs/DOMAIN.md §6 "Change country"): one row
// per field the change moves, the holding rules in words (`plan.holdingRule.text.*`), the day the last buy
// passes each country's rule when that moves, and the countries the select offers, by name with the generic
// profile last (docs/JURISDICTIONS.md §3).
import { GENERIC_COUNTRY } from '@proofofcalm/content';
import {
  type CalendarDate,
  type CountryChange,
  type CountryCode,
  type CountryRules,
  type CurrencyCode,
  eligibleFrom,
  type HoldingEffect,
  type HoldingRule,
} from '@proofofcalm/core';
import type { Formatters } from '../../../lib/format';
import { type HoldingCountry, holdingRuleText, ruleNameOf } from '../../plan';

export type RuleWords = ReturnType<typeof holdingRuleText>;

export type SummaryRow =
  | { readonly field: 'country'; readonly from: CountryCode; readonly to: CountryCode }
  | { readonly field: 'payCurrency' | 'displayCurrency'; readonly from: CurrencyCode; readonly to: CurrencyCode }
  | { readonly field: 'holdingRule'; readonly from: RuleWords; readonly to: RuleWords }
  | {
      readonly field: 'lastBuyEligible';
      readonly from: CalendarDate;
      readonly to: CalendarDate;
      readonly effect: HoldingEffect;
    };

type Opened = { readonly code: CountryCode; readonly holdingRule: HoldingRule } | null;

/**
 * The rows of a change, `opened` being the old country's rules (null while not loaded). Right after the holding
 * rules, the day the last buy passes each, when one country's rule replaces another's with the same effect and
 * that day moves; the person's own rule and the generic profile's give no country's date to compare. A rule's
 * count is grouped in `format`'s number locale, the plan's.
 */
export function countrySummary(change: CountryChange, opened: Opened, format: Formatters): readonly SummaryRow[] {
  return change.changes.flatMap((row): SummaryRow[] => {
    if (row.field !== 'holdingRule') return [row];
    const rules = {
      field: row.field,
      from: holdingRuleText(row.from, format),
      to: holdingRuleText(row.to, format),
    } as const;
    const { from, to } = row;
    if (
      ruleNameOf(from, opened) !== 'country' ||
      change.plan.country === GENERIC_COUNTRY ||
      from.kind === 'none' ||
      to.kind === 'none' ||
      from.effect !== to.effect
    ) {
      return [rules];
    }
    const before = eligibleFrom(change.plan.lastBuy, from);
    const after = eligibleFrom(change.plan.lastBuy, to);
    return before === after
      ? [rules]
      : [rules, { field: 'lastBuyEligible', from: before, to: after, effect: to.effect }];
  });
}

/** The profiles that loaded, by name, the generic profile last. */
export function countryOptions(loaded: readonly (CountryRules | null)[]): readonly CountryRules[] {
  const known = loaded.filter((rules): rules is CountryRules => rules !== null);
  const named = known
    .filter((rules) => rules.code !== GENERIC_COUNTRY)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [...named, ...known.filter((rules) => rules.code === GENERIC_COUNTRY)];
}

/**
 * What follows a rule's name in the change list, as Hold & sell's card reads it: the person's own rule (no card)
 * and a country's rule with a known source in words, the generic profile's own text, and nothing while the
 * source is unknown (the profile did not load), so the list names the rule without its words.
 */
export function ruleWordsOf(
  card: HoldingCountry | null,
  words: RuleWords,
): RuleWords | { readonly text: string } | null {
  if (card === null) return words;
  if (card.unreviewed !== undefined) return card.unreviewed.text === null ? null : { text: card.unreviewed.text };
  return card.source === null ? null : words;
}
