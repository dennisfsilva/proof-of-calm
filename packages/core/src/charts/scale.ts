// Scales for the custom SVG charts (ADR-0022): the arithmetic is exact on decimals and only the result
// becomes a number, a pixel coordinate rounded to one decimal place (the prototype's precision), so a
// chart draws the same everywhere. Pixels are not amounts, which is why they may be numbers.
import { type CalendarDate, daysBetween } from '../dates/calendar';
import {
  abs,
  compare,
  type Decimal,
  decimal,
  isZero,
  max,
  min,
  minus,
  plus,
  product,
  quotient,
  type Ratio,
} from '../money/decimal';

/** A pixel coordinate at one decimal place. */
export type Pixel = number;

/** The smallest and the largest value; null for no values. */
export function extent<T extends Decimal>(values: readonly T[]): readonly [T, T] | null {
  const [first, ...rest] = values;
  return first === undefined ? null : [min(first, ...rest), max(first, ...rest)];
}

/** A pixel coordinate as a decimal at one place; anything else is a programmer error. */
function pixelDecimal(pixel: number): Ratio {
  if (!Number.isFinite(pixel)) throw new RangeError(`${pixel} is not a pixel coordinate`);
  return decimal<Ratio>(String(Math.round(pixel * 10) / 10));
}

/**
 * Maps `domain` linearly onto `range` (either may run backwards: a value axis maps the low end to the
 * bottom pixel). One half-even rounding of the offset, so both ends land exactly on the range's ends
 * and larger values never map to smaller offsets. A flat domain maps every value to the middle.
 */
export function linearScale<T extends Decimal>(
  domain: readonly [T, T],
  range: readonly [Pixel, Pixel],
): (value: T) => Pixel {
  const [low, high] = domain;
  const start = pixelDecimal(range[0]);
  const width = minus(pixelDecimal(range[1]), start);
  const span = minus(high, low);
  if (isZero(span)) {
    const middle = Number(plus(start, quotient<Ratio>(width, '2' as Ratio, 1, 'half-even')));
    return () => middle;
  }
  return (value) =>
    Number(plus(start, quotient<Ratio>(product<Ratio>(minus(value, low), width), span, 1, 'half-even')));
}

/** Maps calendar dates onto `range` by whole days: dates have no time of day, so no DST effect. */
export function dateScale(
  domain: readonly [CalendarDate, CalendarDate],
  range: readonly [Pixel, Pixel],
): (date: CalendarDate) => Pixel {
  const [from, to] = domain;
  const days = (date: CalendarDate) => decimal<Ratio>(String(daysBetween(from, date)));
  const scale = linearScale<Ratio>(['0' as Ratio, days(to)], range);
  return (date) => scale(days(date));
}

/**
 * The prototype's vertical domain: the extent widened by `padding` of its span on each side (8 %), so
 * the line never touches the frame. A flat series is first widened by 1 % of its value, or by 1 around
 * zero, so that it draws as a level line in the middle.
 */
export function paddedDomain<T extends Decimal>(
  domain: readonly [T, T],
  padding: Ratio = '0.08' as Ratio,
): readonly [T, T] {
  let [low, high] = domain;
  if (compare(low, high) === 0) {
    const widen = isZero(low) ? ('1' as T) : product<T>(abs(low), '0.01' as Ratio);
    low = minus(low, widen);
    high = plus(high, widen);
  }
  const pad = product<T>(minus(high, low), padding);
  return [minus(low, pad), plus(high, pad)];
}
