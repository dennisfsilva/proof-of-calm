// Tick values for a money, price or percentage axis (ADR-0022): steps of 1, 2 or 5 times a power of ten,
// chosen as d3-array's tickIncrement chooses them, but on exact decimals, so a label never reads
// 0.30000000000000004.
import { compare, type Decimal, isNegative, minus, plus, product, quotient, type Ratio } from '../money/decimal';

/** 10^power as a decimal string. */
function powerOfTen(power: number): Ratio {
  return (power >= 0 ? `1${'0'.repeat(power)}` : `0.${'0'.repeat(-power - 1)}1`) as Ratio;
}

/** floor(log10(value)) of a positive decimal, read from its digits. */
function magnitude(value: Decimal): number {
  const [whole = '', fraction = ''] = value.split('.');
  return whole === '0' ? -(fraction.search(/[1-9]/) + 1) : whole.length - 1;
}

/**
 * The step between about `count` ticks over `low`..`high`: the largest power of ten at or below
 * span / count, times 10, 5, 2 or 1 where span / count is at least √50, √10 or √2 times that power
 * (compared squared, so no root is taken).
 */
export function tickStep<T extends Decimal>(low: T, high: T, count: number): T {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`Cannot place ${count} ticks`);
  if (compare(low, high) >= 0) throw new RangeError(`${low}..${high} is not an ascending domain`);
  const span = minus(high, low);
  const counted = String(count) as Ratio;
  // floor(log10(span / count)) is one of two values; take the larger when count × 10^power fits.
  let power = magnitude(span) - (counted.length - 1);
  if (compare(product<Ratio>(counted, powerOfTen(power)), span) > 0) power -= 1;
  const base = product<Ratio>(counted, powerOfTen(power));
  const squared = product<Ratio>(span, span);
  const atLeast = (factor: string) =>
    compare(squared, product<Ratio>(product<Ratio>(base, base), factor as Ratio)) >= 0;
  const factor = atLeast('50') ? '10' : atLeast('10') ? '5' : atLeast('2') ? '2' : '1';
  return product<T>(factor as Ratio, powerOfTen(power));
}

/** The multiples of the step within `low`..`high`, ascending; a flat domain has the one tick. */
export function ticks<T extends Decimal>(low: T, high: T, count = 5): T[] {
  if (compare(low, high) === 0) return [low];
  const step = tickStep(low, high, count);
  // The first multiple at or above `low`: a ceiling, which rounds toward zero below zero.
  const first = product<T>(quotient<Ratio>(low, step, 0, isNegative(low) ? 'down' : 'up'), step);
  const values: T[] = [];
  for (let tick = first; compare(tick, high) <= 0; tick = plus(tick, step)) values.push(tick);
  return values;
}
