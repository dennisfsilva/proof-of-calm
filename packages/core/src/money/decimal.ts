// The money module (ADR-0017): exact decimals over big.js behind branded string types. Nothing outside
// this folder imports big.js. Values travel as plain decimal strings (never exponent notation); every
// division names its rounding mode; amounts are never JavaScript numbers.
import Big from 'big.js';
import * as z from 'zod/mini';
import { assertNever } from '../result';

// A private constructor with its own settings (big.js: calling Big() without arguments returns an
// independent constructor). Strict mode rejects primitive numbers, so a float cannot slip in. DP 0 with
// rounding toward zero makes `div` an integer truncation; `divide` below decides the last digit.
const BigNumber = Big();
BigNumber.strict = true;
BigNumber.DP = 0;
BigNumber.RM = BigNumber.roundDown;
BigNumber.NE = -1_000_000;
BigNumber.PE = 1_000_000;

const DECIMAL_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const NEGATIVE_ZERO = /^-0(\.0+)?$/;

/** A plain decimal string: optional minus, no exponent, no leading zeros, no negative zero. */
export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value) && !NEGATIVE_ZERO.test(value);
}

const decimalString = (what: string) =>
  z.string().check(z.refine(isDecimalString, `Expected a plain decimal string for ${what}`));

export const MoneySchema = decimalString('money').brand<'Money'>();
export const UnitsSchema = decimalString('units').brand<'Units'>();
export const PriceSchema = decimalString('a price').brand<'Price'>();
export const PercentSchema = decimalString('a percentage').brand<'Percent'>();
export const RatioSchema = decimalString('a ratio').brand<'Ratio'>();

/** An amount in a fiat currency (the plan's pay currency unless stated). */
export type Money = z.infer<typeof MoneySchema>;
/** A quantity of a coin, up to ten decimals. */
export type Units = z.infer<typeof UnitsSchema>;
/** Money per unit of a coin. */
export type Price = z.infer<typeof PriceSchema>;
/** 0 to 100 for shares; signed for changes. */
export type Percent = z.infer<typeof PercentSchema>;
/** A dimensionless ratio: fractions, multiples. */
export type Ratio = z.infer<typeof RatioSchema>;

export type Decimal = Money | Units | Price | Percent | Ratio;

export type Rounding = 'down' | 'up' | 'half-up' | 'half-even';

const ROUNDING_MODE = {
  down: BigNumber.roundDown,
  'half-up': BigNumber.roundHalfUp,
  'half-even': BigNumber.roundHalfEven,
  up: BigNumber.roundUp,
} as const;

function big(value: string): Big {
  return new BigNumber(value);
}

function toDecimal<T extends Decimal>(value: Big): T {
  // toFixed() without arguments is normal notation with every digit (big.js API). A negative zero
  // keeps its sign internally but prints as "0", so "0" is the only zero that leaves this module.
  return value.toFixed() as T;
}

/** Parses a decimal string from storage or a validated input, normalised; null for anything else. */
export function parseDecimal<T extends Decimal>(value: string): T | null {
  return isDecimalString(value) ? toDecimal<T>(big(value)) : null;
}

/** For literals in code and tests: a malformed string is a programmer error. */
export function decimal<T extends Decimal>(value: string): T {
  const parsed = parseDecimal<T>(value);
  if (parsed === null) throw new TypeError(`"${value}" is not a plain decimal string`);
  return parsed;
}

export function plus<T extends Decimal>(a: T, b: T): T {
  return toDecimal<T>(big(a).plus(big(b)));
}

export function minus<T extends Decimal>(a: T, b: T): T {
  return toDecimal<T>(big(a).minus(big(b)));
}

export function sum<T extends Decimal>(values: readonly T[]): T {
  return toDecimal<T>(values.reduce((total, value) => total.plus(big(value)), big('0')));
}

export function negate<T extends Decimal>(value: T): T {
  return toDecimal<T>(big(value).neg());
}

export function abs<T extends Decimal>(value: T): T {
  return toDecimal<T>(big(value).abs());
}

export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  return big(a).cmp(big(b));
}

export function isZero(value: Decimal): boolean {
  return big(value).eq(big('0'));
}

export function isPositive(value: Decimal): boolean {
  return big(value).gt(big('0'));
}

export function isNegative(value: Decimal): boolean {
  return big(value).lt(big('0'));
}

export function max<T extends Decimal>(first: T, ...rest: T[]): T {
  return rest.reduce((best, value) => (compare(value, best) > 0 ? value : best), first);
}

export function min<T extends Decimal>(first: T, ...rest: T[]): T {
  return rest.reduce((best, value) => (compare(value, best) < 0 ? value : best), first);
}

/** Rounds to `dp` decimal places with an explicit mode. No division is involved, so it is exact. */
export function round<T extends Decimal>(value: T, dp: number, mode: Rounding): T {
  return toDecimal<T>(big(value).round(dp, ROUNDING_MODE[mode]));
}

/**
 * Rounds to `figures` significant figures, but never at fewer than `dp` decimal places, so a value far
 * below one step of `dp` (a coin priced under a cent) keeps its own digits instead of rounding to 0.
 * Exact, as `round` is; 0 stays 0.
 */
export function roundSignificant<T extends Decimal>(value: T, figures: number, dp: number, mode: Rounding): T {
  const exact = big(value);
  // big.js keeps the exponent of the leading digit: 73732.75 has e = 4, 0.0000123 has e = -5.
  return toDecimal<T>(exact.round(Math.max(dp, figures - 1 - exact.e), ROUNDING_MODE[mode]));
}

/**
 * A JavaScript number from outside the core (the prototype's JSON, §7) as a decimal rounded half-even
 * to `dp` places. Its shortest round-trip spelling is taken as what was typed, so 2.675 rounds to 2.68.
 * A number that is not finite is a programmer error; callers check first.
 */
export function fromFloat<T extends Decimal>(value: number, dp: number): T {
  if (!Number.isFinite(value)) throw new RangeError(`${value} is not a finite number`);
  return toDecimal<T>(big(String(value)).round(dp, ROUNDING_MODE['half-even']));
}

/** The number of decimal places a normalised value is written with. */
export function decimalPlaces(value: Decimal): number {
  const point = value.indexOf('.');
  return point === -1 ? 0 : value.length - point - 1;
}

/** Whether a truncated quotient moves one step away from zero, given the remainder's size. */
function stepsAwayFromZero(mode: Rounding, halfComparison: -1 | 0 | 1, truncatedIsOdd: boolean): boolean {
  switch (mode) {
    case 'down':
      return false;
    case 'up':
      return true;
    case 'half-up':
      return halfComparison >= 0;
    case 'half-even':
      return halfComparison > 0 || (halfComparison === 0 && truncatedIsOdd);
    default:
      return assertNever(mode);
  }
}

/**
 * `a / b` rounded once to `dp` places under `mode`, with no double rounding (ADR-0017): the scaled
 * quotient is truncated, then twice the remainder against the divisor decides the last digit.
 * Division by zero is a programmer error; callers check first.
 */
function divide(a: Big, b: Big, dp: number, mode: Rounding): Big {
  if (b.eq(big('0'))) throw new RangeError('Division by zero');
  const numerator = a.times(big('10').pow(dp));
  const truncated = numerator.div(b); // DP 0 and rounding toward zero: an integer
  const remainder = numerator.minus(truncated.times(b));
  const unit = big(`1e-${dp}`);
  if (remainder.eq(big('0'))) return truncated.times(unit);
  const half = remainder.abs().times(big('2')).cmp(b.abs());
  if (!stepsAwayFromZero(mode, half, !truncated.mod(big('2')).eq(big('0')))) return truncated.times(unit);
  const negative = numerator.lt(big('0')) !== b.lt(big('0'));
  return truncated.plus(big(negative ? '-1' : '1')).times(unit);
}

/** `a / b` at `dp` places under `mode`; the caller names the result's unit. */
export function quotient<R extends Decimal>(a: Decimal, b: Decimal, dp: number, mode: Rounding): R {
  return toDecimal<R>(divide(big(a), big(b), dp, mode));
}

/**
 * `a / b` as `roundSignificant` would round the exact quotient: at `figures` significant figures, never at fewer
 * than `dp` places, rounded once with `mode`. The quotient's leading digit lies at most one place past
 * `b.e - a.e`, and truncating never moves it, so a division cut there finds it; one division then rounds.
 */
export function quotientSignificant<R extends Decimal>(
  a: Decimal,
  b: Decimal,
  figures: number,
  dp: number,
  mode: Rounding,
): R {
  const [x, y] = [big(a), big(b)];
  const leading = divide(x, y, Math.max(0, y.e - x.e + 1), 'down');
  return toDecimal<R>(divide(x, y, Math.max(dp, figures - 1 - leading.e), mode));
}

/** Exact product; the caller names the result's unit (units × price → money, money × ratio → money). */
export function product<R extends Decimal>(a: Decimal, b: Decimal): R {
  return toDecimal<R>(big(a).times(big(b)));
}

/** The value of `units` at `price`, exact. */
export function valueAt(units: Units, price: Price): Money {
  return product<Money>(units, price);
}

/** Money per unit, rounded half-even to `dp` places: a derived value, never stored (docs/DOMAIN.md §2.2). */
export function impliedPrice(amount: Money, units: Units, dp = 10): Price {
  return quotient<Price>(amount, units, dp, 'half-even');
}

/** Units an amount buys at a price, rounded toward zero to the coin's decimals (ADR-0017). */
export function unitsFor(amount: Money, price: Price, decimals: number): Units {
  return quotient<Units>(amount, price, decimals, 'down');
}

/** `share` percent of `total`, exact: dividing by 100 only moves the point. */
export function percentOf(total: Money, share: Percent): Money {
  return toDecimal<Money>(big(total).times(big(share)).times(big('0.01')));
}

/** `part / whole × 100`, rounded half-even to `dp` places. */
export function percentage(part: Decimal, whole: Decimal, dp = 4): Percent {
  return toDecimal<Percent>(divide(big(part).times(big('100')), big(whole), dp, 'half-even'));
}

/** `a / b` as a dimensionless ratio, rounded half-even to `dp` places. */
export function ratio(a: Decimal, b: Decimal, dp = 12): Ratio {
  return quotient<Ratio>(a, b, dp, 'half-even');
}
