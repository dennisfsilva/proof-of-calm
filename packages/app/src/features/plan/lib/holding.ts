// The holding rule editor's value (docs/JURISDICTIONS.md §5, docs/DOMAIN.md §2.1): the country's rule, or the
// person's own, its count as typed and read with the formatting locale (ADR-0034). An own rule equal to the
// country's gives back the country's, so its acquisition-date overrides still apply (`holdingContext`).
import { type CountryProfile, GENERIC_COUNTRY, holdingRuleSource } from '@proofofcalm/content';
import {
  type CalendarDate,
  type CountryCode,
  type CountryRules,
  compare,
  type Decimal,
  decimal,
  err,
  type HoldingEffect,
  type HoldingRule,
  ok,
  type Result,
  round,
  sameHoldingRule,
  underReview,
} from '@proofofcalm/core';
import { createNumberInput, type Formatters, type NumberInput, type NumberInputError } from '../../../lib/format';

/**
 * The country's rule as its card shows it: the country by name, the rule, its review date formatted by the host
 * and the URL of the rule's source (null until known, and for good when the profile does not load). The rule in
 * words shows only once its source is known, so no rule is ever on screen without its source (docs/LEGAL.md §6
 * question 13). A profile with no reviewed rule (the generic one, docs/JURISDICTIONS.md "Generic profile `XX`")
 * has no source and sets `unreviewed`: its own status and holding-rule text (each null until known), shown in
 * place of the rule, and a date line that names the general profile as what was reviewed. A card more than twelve
 * months past its review sets `underReview` and has no source (docs/JURISDICTIONS.md §1), so it shows as a card
 * with no source does: the country by name and no rule in words, with the under-review date line. `conditions`
 * are the profile's `holdingRuleConditions`, what the app cannot verify about a date under the rule
 * (docs/JURISDICTIONS.md §2): the early-opening notice shows them under its date, under review as well.
 */
export type HoldingCountry = {
  readonly code: CountryCode;
  readonly name: string;
  readonly rule: HoldingRule;
  readonly reviewed: string;
  readonly conditions?: readonly string[];
  readonly source: string | null;
  readonly unreviewed?: { readonly status: string | null; readonly text: string | null };
  readonly underReview?: true;
};

/**
 * The card of a country's rules: the source is the one `ruleSources.holdingRule` names, the law that sets the
 * rule, wherever it stands in the list; none for XX, which is never under review, or for a card under review.
 */
export function holdingCountryOf(
  rules: CountryRules,
  reviewed: string,
  profile: CountryProfile | null,
  today: CalendarDate,
): HoldingCountry {
  const card = {
    code: rules.code,
    name: rules.name,
    rule: rules.holdingRule,
    reviewed,
    conditions: rules.holdingRuleConditions,
  };
  if (rules.code === GENERIC_COUNTRY) {
    return {
      ...card,
      source: null,
      unreviewed: { status: profile?.card.classification ?? null, text: profile?.card.holdingRuleText ?? null },
    };
  }
  if (underReview(rules.status, today)) return { ...card, source: null, underReview: true };
  return { ...card, source: profile === null ? null : holdingRuleSource(profile) };
}

export type HoldingValue = {
  readonly source: 'country' | 'own';
  readonly kind: HoldingRule['kind'];
  /** The typed count of days or years; unused for `none`. */
  readonly count: string;
  readonly effect: HoldingEffect;
};

type CountPath = readonly ['holdingRule', 'count'];
export type HoldingIssue =
  | (NumberInputError & { readonly path: CountPath })
  | { readonly code: 'count-whole'; readonly path: CountPath }
  /** The bounds in the locale's format (`36,500`), as the message shows them (docs/CONTENT-STYLE.md §4). */
  | { readonly code: 'count-range'; readonly path: CountPath; readonly min: string; readonly max: string }
  /** The country's rule chosen while the country's rules are not loaded. */
  | { readonly code: 'country-unknown'; readonly path: readonly ['holdingRule', 'source'] };

/** HoldingRuleSchema's bounds (packages/core/src/schema/holding-rule.ts); a test checks them against it. */
export const COUNT_BOUNDS = { days: [1, 36_500], years: [1, 100] } as const;

/** The editor's value for the plan's rule: the country's when the two are the same rule. */
export function holdingValueOf(rule: HoldingRule, country: HoldingRule | null, numberInput: NumberInput): HoldingValue {
  const source = country !== null && sameHoldingRule(rule, country) ? 'country' : 'own';
  if (rule.kind === 'none') return { source, kind: 'none', count: '', effect: 'exempt' };
  const count = rule.kind === 'days' ? rule.days : rule.years;
  return { source, kind: rule.kind, count: numberInput.format(decimal(String(count))), effect: rule.effect };
}

/** The rule the value makes, or why it cannot: a count that does not read as a whole number within bounds. */
export function holdingRuleOf(
  value: HoldingValue,
  country: HoldingRule | null,
  numberInput: NumberInput,
): Result<HoldingRule, HoldingIssue[]> {
  if (value.source === 'country') {
    return country === null ? err([{ code: 'country-unknown', path: ['holdingRule', 'source'] }]) : ok(country);
  }
  const rule = ownRule(value, numberInput);
  if (!rule.ok) return err([rule.error]);
  return ok(country !== null && sameHoldingRule(rule.value, country) ? country : rule.value);
}

function ownRule({ kind, count, effect }: HoldingValue, numberInput: NumberInput): Result<HoldingRule, HoldingIssue> {
  if (kind === 'none') return ok({ kind });
  const path = ['holdingRule', 'count'] as const;
  const read = numberInput.parse(count);
  if (!read.ok) return err({ ...read.error, path });
  if (compare(round(read.value, 0, 'down'), read.value) !== 0) return err({ code: 'count-whole', path });
  const [min, max] = COUNT_BOUNDS[kind];
  const within = (bound: number) => decimal<Decimal>(String(bound));
  if (compare(read.value, within(min)) < 0 || compare(read.value, within(max)) > 0) {
    return err({
      code: 'count-range',
      path,
      min: numberInput.format(within(min)),
      max: numberInput.format(within(max)),
    });
  }
  const whole = Number(read.value);
  return ok(kind === 'days' ? { kind, days: whole, effect } : { kind, years: whole, effect });
}

/**
 * The message of the rule in words (`plan.holdingRule.text.*`) and its values; the count's figure is grouped as
 * the plan's number locale groups it (`1.000 days`; docs/CONTENT-STYLE.md §4).
 */
export function holdingRuleText(
  rule: HoldingRule,
  format: Formatters,
): {
  key: 'none' | 'days' | 'years';
  values: Record<string, string | number>;
} {
  if (rule.kind === 'none') return { key: 'none', values: {} };
  const count = rule.kind === 'days' ? rule.days : rule.years;
  return {
    key: rule.kind,
    values: {
      count,
      figure: createNumberInput(format.locales.numbers).format(decimal(String(count))),
      effect: rule.effect,
    },
  };
}
