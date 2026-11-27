import { isPositive, type Plan } from '@proofofcalm/core';
import type { NumberInput } from '../../../lib/format';
import { type CoinSplitValue, splitValueOf } from './split';

// `Fill in from your plan` (docs/EDUCATION.md §7, the verdict V1 of #14): what the simulator's form takes from the
// person's own plan. The core simulates no starting amount, pauses or skips, and the closes begin later than most
// plans, so the fill takes the split and the buy day, the amount only where it is in the closes' currency, and no
// date: the type holds none, so a fill cannot set one. It reads the plan and writes nothing.

/** The fill's line: the plan pays in another currency than the closes', or has no monthly amount. */
export type PlanFillLine = 'other-currency' | 'no-monthly';

export type PlanFill = {
  /** The plan's coins in its order, each share written in the formatting locale. */
  readonly split: CoinSplitValue;
  readonly buyDay: number;
  /** The monthly amount written in the formatting locale, or null when the fill leaves the amount as it is. */
  readonly amount: string | null;
  readonly line: PlanFillLine | null;
};

/** The currency of the reference closes the simulator runs on (packages/data, ADR-0036). */
const CLOSES_CURRENCY = 'EUR';

export function fillFromPlan(plan: Plan, numberInput: NumberInput): PlanFill {
  const filled = { split: splitValueOf(plan, numberInput), buyDay: plan.buyDay };
  if (plan.payCurrency !== CLOSES_CURRENCY) return { ...filled, amount: null, line: 'other-currency' };
  if (!isPositive(plan.monthlyAmount)) return { ...filled, amount: null, line: 'no-monthly' };
  return { ...filled, amount: numberInput.format(plan.monthlyAmount, 2), line: null };
}
