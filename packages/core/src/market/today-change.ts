// The change since yesterday on the hero number (docs/DOMAIN.md §3.11), ported from the prototype's
// todayChange(): each held coin's value 24 hours ago is its value now undone by its 24-hour change.
import { isPositive, type Money, minus, type Percent, percentage, plus, product, quotient } from '../money/decimal';
import type { Portfolio } from '../portfolio/portfolio';
import type { PriceSnapshot } from '../schema/prices';

export type DayChange = { readonly amount: Money; readonly percent: Percent };

const MONEY_DP = 10;
const PERCENT_DP = 4;
const HUNDRED = '100' as Percent;

/** Null unless every held coin has a price and a 24-hour change (never a partial figure). */
export function todayChange(portfolio: Portfolio, snapshot: PriceSnapshot | null): DayChange | null {
  let now = '0' as Money;
  let before = '0' as Money;
  for (const position of portfolio.positions) {
    if (!isPositive(position.units)) continue;
    const change = snapshot?.change24h?.[position.coin];
    if (position.value === null || change === undefined) return null;
    const base = plus(HUNDRED, change);
    if (!isPositive(base)) return null;
    now = plus(now, position.value);
    before = plus(before, quotient<Money>(product(position.value, HUNDRED), base, MONEY_DP, 'half-even'));
  }
  if (!isPositive(before)) return null;
  const amount = minus(now, before);
  return { amount, percent: percentage(amount, before, PERCENT_DP) };
}
