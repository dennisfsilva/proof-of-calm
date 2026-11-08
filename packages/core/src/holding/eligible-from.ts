// When a purchase passes the holding rule (docs/DOMAIN.md §3.7). The core returns dates and effects,
// never words: the UI says "tax-free from" for `exempt`, "long-term rate from" for `lower-rate`, and
// nothing where the rule is `none`.
import { addDays, addYearsClamped, type CalendarDate } from '../dates/calendar';
import { assertNever } from '../result';
import type { HoldingEffect, HoldingRule, HoldingRuleOverride } from '../schema/holding-rule';

/**
 * `days: n` → eligible n calendar days after the purchase (Portugal: bought 2026-03-01, eligible
 * 2027-03-01); `years: n` → the day after the anniversary, with 29 February clamped to 28 February
 * (Germany's "more than one year": bought 2026-03-15, eligible 2027-03-16); `none` → the purchase date.
 */
export function eligibleFrom(acquired: CalendarDate, rule: HoldingRule): CalendarDate {
  switch (rule.kind) {
    case 'none':
      return acquired;
    case 'days':
      return addDays(acquired, rule.days);
    case 'years':
      return addDays(addYearsClamped(acquired, rule.years), 1);
    default:
      return assertNever(rule);
  }
}

/**
 * The rule for a purchase on `acquired`: the latest override whose `acquiredFrom` is on or before
 * that date (on equal dates, the later entry in the list), otherwise `rule`. Overrides hold only
 * enacted rules (docs/JURISDICTIONS.md §2).
 */
export function ruleFor(
  acquired: CalendarDate,
  rule: HoldingRule,
  overrides: readonly HoldingRuleOverride[] = [],
): HoldingRule {
  let chosen: HoldingRuleOverride | null = null;
  for (const override of overrides) {
    if (override.acquiredFrom <= acquired && (chosen === null || override.acquiredFrom >= chosen.acquiredFrom)) {
      chosen = override;
    }
  }
  return chosen === null ? rule : chosen.rule;
}

function ruleKey(rule: HoldingRule): string {
  if (rule.kind === 'none') return 'none';
  return rule.kind === 'days' ? `days:${rule.days}:${rule.effect}` : `years:${rule.years}:${rule.effect}`;
}

/** Whether two rules are the same rule, whatever the order of their fields. */
export function sameHoldingRule(a: HoldingRule, b: HoldingRule): boolean {
  return ruleKey(a) === ruleKey(b);
}

export type HoldingStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'dated'; readonly from: CalendarDate; readonly effect: HoldingEffect };

/** What the UI may say about one purchase: nothing where no rule applies, else the date and its effect. */
export function holdingStatus(
  acquired: CalendarDate,
  rule: HoldingRule,
  overrides: readonly HoldingRuleOverride[] = [],
): HoldingStatus {
  const applied = ruleFor(acquired, rule, overrides);
  if (applied.kind === 'none') return { kind: 'none' };
  return { kind: 'dated', from: eligibleFrom(acquired, applied), effect: applied.effect };
}
