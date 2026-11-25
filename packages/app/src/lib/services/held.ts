import {
  DEFAULT_HOLDING_CONTEXT,
  type Entry,
  type HoldingContext,
  type Plan,
  type Portfolio,
  portfolio,
} from '@proofofcalm/core';

// Today asks for the unpriced portfolio several times as it loads: the number before prices arrive, the foot's
// "units held" and the red-day model. The store hands the same entries array until an entry changes and a new one
// after, so one computation per array, plan and lot scope and rule serves them all; the cache holds no array alive.
const computed = new WeakMap<readonly Entry[], WeakMap<Plan, Map<string, Portfolio>>>();

/** `portfolio(plan, entries, null, holding)`, computed once per entries array, plan and the holding's lot scope and rule. */
export function heldPortfolio(
  plan: Plan,
  entries: readonly Entry[],
  holding: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): Portfolio {
  const byPlan = computed.get(entries) ?? new WeakMap<Plan, Map<string, Portfolio>>();
  computed.set(entries, byPlan);
  const byLots = byPlan.get(plan) ?? new Map<string, Portfolio>();
  byPlan.set(plan, byLots);
  // `portfolio` reads only the lot scope and rule of the context (the overrides decide eligibility, not holdings).
  const key = `${holding.lotScope} ${holding.lotRule}`;
  const known = byLots.get(key);
  if (known !== undefined) return known;
  const value = portfolio(plan, entries, null, holding);
  byLots.set(key, value);
  return value;
}
