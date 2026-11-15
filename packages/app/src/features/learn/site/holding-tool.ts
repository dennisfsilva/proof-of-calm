import {
  addYearsClamped,
  type CalendarDate,
  CalendarDateSchema,
  type HoldingEffect,
  type HoldingRule,
  type HoldingRuleOverride,
  HoldingRuleOverrideSchema,
  HoldingRuleSchema,
  type HoldingStatus,
  holdingStatus,
} from '@proofofcalm/core';
import * as z from 'zod/mini';

// The holding-date tool's pure half, exported as `@proofofcalm/app/features/learn/site/tool` for the page's script
// (its design check of 2026-11-15): the inputs live in the URL's fragment, which no request
// carries; the answer is the core's `holdingStatus` and states a date only, never whether it has passed, so nothing
// here reads a clock. Dates are written through the one formatting layer (ADR-0023), re-exported for the script.
export { createDateFormatter } from '../../../lib/format';

/** The genesis block's day: no purchase of a listed coin is older. */
export const HOLDING_MIN = '2009-01-03' as CalendarDate;

/** The latest purchase date the tool takes: the build's day plus one year, so a purchase can be planned. */
export function holdingMax(today: CalendarDate): CalendarDate {
  return addYearsClamped(today, 1);
}

export type HoldingBounds = { readonly min: CalendarDate; readonly max: CalendarDate };

export const HoldingFragmentSchema = z.strictObject({
  /** A listed country's code in lower case. */
  country: z.optional(z.string().check(z.regex(/^[a-z]{2}$/))),
  bought: z.optional(CalendarDateSchema),
});
export type HoldingFragment = z.infer<typeof HoldingFragmentSchema>;

/**
 * `#country=pt&bought=2026-03-01` read: null for an extra or repeated key, a code not in `codes` (upper case, as the
 * library keys them), a non-date or a date outside `bounds`; an empty fragment is nothing chosen.
 */
export function parseHoldingFragment(
  hash: string,
  codes: readonly string[],
  bounds: HoldingBounds,
): HoldingFragment | null {
  // A Map, not an object literal: a key such as `__proto__` would hit Object.prototype's setter and vanish.
  const raw = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ''))) {
    if (raw.has(key)) return null;
    raw.set(key, value);
  }
  const parsed = HoldingFragmentSchema.safeParse(Object.fromEntries(raw));
  if (!parsed.success) return null;
  const { country, bought } = parsed.data;
  if (country !== undefined && !codes.some((code) => code.toLowerCase() === country)) return null;
  if (bought !== undefined && (bought < bounds.min || bought > bounds.max)) return null;
  return parsed.data;
}

/** The fragment for `q`, without the `#`: the country first, a missing input left out. */
export function holdingFragment(q: HoldingFragment): string {
  const params = new URLSearchParams();
  if (q.country !== undefined) params.set('country', q.country);
  if (q.bought !== undefined) params.set('bought', q.bought);
  return params.toString();
}

const HoldingRulesSchema = z.strictObject({ rule: HoldingRuleSchema, overrides: z.array(HoldingRuleOverrideSchema) });
/** A country's holding rule and its enacted overrides, as its profile holds them (docs/JURISDICTIONS.md §2). */
export type HoldingRules = z.infer<typeof HoldingRulesSchema>;

/** What a radio's `data-rule` holds: the rules as JSON. */
export function encodeHoldingRule(rules: HoldingRules): string {
  return JSON.stringify({ rule: rules.rule, overrides: rules.overrides });
}

/** A `data-rule` read back through the core's schemas; null for anything else. */
export function decodeHoldingRule(text: string): HoldingRules | null {
  try {
    const parsed = HoldingRulesSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type HoldingAnswer = { readonly kind: 'under-review' } | HoldingStatus;

/** Under review, no date at all, as the card states none; otherwise the core's status for a purchase on `bought`. */
export function holdingAnswer(
  bought: CalendarDate,
  { rule, overrides, underReview }: HoldingRules & { readonly underReview: boolean },
): HoldingAnswer {
  return underReview ? { kind: 'under-review' } : holdingStatus(bought, rule, overrides);
}

/** Each effect the rule or an override can state, once, the rule's first: one result line per effect. */
export function effectsOf(rule: HoldingRule, overrides: readonly HoldingRuleOverride[]): HoldingEffect[] {
  const effects: HoldingEffect[] = [];
  for (const each of [rule, ...overrides.map((override) => override.rule)]) {
    if (each.kind !== 'none' && !effects.includes(each.effect)) effects.push(each.effect);
  }
  return effects;
}
