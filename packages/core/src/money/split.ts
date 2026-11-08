// The largest-remainder split (docs/DOMAIN.md §3.4, ADR-0017): parts in whole minor units that sum to
// exactly the total, each within one minor unit of its exact share. Used for the planned parts of a
// buy and for a fee shared across entries; the prototype's per-part rounding drifted by a cent.
import {
  compare,
  type Decimal,
  decimalPlaces,
  isNegative,
  isZero,
  type Money,
  minus,
  plus,
  product,
  quotient,
  sum,
  type Units,
} from './decimal';

/** The smallest step at `digits` decimal places, e.g. 0.01 for 2. */
export function minorUnit(digits: number): Money {
  return (digits === 0 ? '1' : `0.${'0'.repeat(digits - 1)}1`) as Money;
}

/**
 * Splits `total` in proportion to `weights` at `minorDigits` decimal places. Each part starts at its
 * exact share rounded down; the minor units left over go one each to the largest remainders, ties to
 * the earlier weight (plan order). A total with more decimals than `minorDigits`, a negative total or
 * weight, or weights that are all zero, are programmer errors.
 */
export function splitLargestRemainder(total: Money, weights: readonly Decimal[], minorDigits: number): Money[] {
  if (decimalPlaces(total) > minorDigits) throw new RangeError(`${total} has more than ${minorDigits} decimals`);
  if (isNegative(total) || weights.some(isNegative)) throw new RangeError('Cannot split negative amounts');
  const weightSum = sum(weights);
  if (isZero(weightSum)) throw new RangeError('At least one weight must be positive');

  const step = minorUnit(minorDigits);
  const parts = weights.map((weight, index) => {
    const scaled = product<Money>(total, weight); // the exact share times weightSum
    const floor = quotient<Money>(scaled, weightSum, minorDigits, 'down');
    // The remainder stays on the common denominator weightSum, so remainders compare exactly.
    return { index, floor, remainder: minus(scaled, product<Money>(floor, weightSum)) };
  });
  // Fewer leftover steps than parts, by construction: a count, not an amount.
  const leftover = Number(quotient<Money>(minus(total, sum(parts.map((part) => part.floor))), step, 0, 'down'));
  const winners = new Set(
    [...parts]
      .sort((a, b) => compare(b.remainder, a.remainder) || a.index - b.index)
      .slice(0, leftover)
      .map((part) => part.index),
  );
  return parts.map((part) => (winners.has(part.index) ? plus(part.floor, step) : part.floor));
}

/**
 * The cumulative split (docs/DOMAIN.md §3.13): part i is the rounded share of the weights up to i minus the
 * rounded share of the weights before it, so the parts sum to exactly the total and a part depends only on the
 * weights before it and their sum: a lot's pieces in one year's file stay the same when a later sale splits its
 * rest. Rounds half-even at the currency's digits, or the total's own when it holds more; the weights sum above 0.
 */
export function cumulativeShares(total: Money, weights: readonly Units[], minorDigits: number): Money[] {
  const whole = sum(weights);
  const digits = Math.max(minorDigits, decimalPlaces(total));
  let through = '0' as Units;
  let previous = '0' as Money;
  return weights.map((weight) => {
    through = plus(through, weight);
    const upTo = quotient<Money>(product(total, through), whole, digits, 'half-even');
    const part = minus(upTo, previous);
    previous = upTo;
    return part;
  });
}
