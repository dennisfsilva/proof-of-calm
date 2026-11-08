// Drawdown under the running maximum (ADR-0022): the stretches where a series is below its previous
// high, used by the simulator for its maximum drawdown and time under water, and by the simulator
// chart for its shading.
import { compare, type Decimal } from '../money/decimal';
import { linePath, type Point } from './path';

/** The highest value so far at each position. */
export function runningMax<T extends Decimal>(values: readonly T[]): T[] {
  const highs: T[] = [];
  for (const value of values) {
    const high = highs.at(-1);
    highs.push(high === undefined || compare(value, high) > 0 ? value : high);
  }
  return highs;
}

/** Positions in the series: a stretch below the previous high. */
export type UnderwaterSegment = {
  /** The last position at the high before the fall. */
  readonly peak: number;
  /** The lowest position before the recovery; the first one on a tie. */
  readonly trough: number;
  /** The first position back at or above the high; null while the series is still below it. */
  readonly recovery: number | null;
};

/** Every stretch where a value is below the running maximum, in order. */
export function underwaterSegments(values: readonly Decimal[]): UnderwaterSegment[] {
  const segments: UnderwaterSegment[] = [];
  let peak = 0;
  let trough: number | null = null;
  for (const [index, value] of values.entries()) {
    if (compare(value, values[peak] as Decimal) >= 0) {
      if (trough !== null) segments.push({ peak, trough, recovery: index });
      trough = null;
      peak = index;
    } else if (trough === null || compare(value, values[trough] as Decimal) < 0) {
      trough = index;
    }
  }
  if (trough !== null) segments.push({ peak, trough, recovery: null });
  return segments;
}

/**
 * The shading between the running maximum and the line, one closed subpath per stretch: along the
 * high from the peak, then back along the line. The high is level until the line climbs back through
 * it, so it runs flat to the last point below it and meets the line at the recovery; a stretch that
 * has not recovered ends with a drop at the last point.
 */
export function underwaterPath(points: readonly Point[], values: readonly Decimal[]): string {
  if (points.length !== values.length) throw new RangeError(`${points.length} points for ${values.length} values`);
  return underwaterSegments(values)
    .map(({ peak, recovery }) => {
      const at = (index: number) => points[index] as Point;
      const end = recovery ?? points.length - 1;
      const level = at(peak)[1];
      const outline: Point[] = [at(peak), [at(recovery === null ? end : end - 1)[0], level]];
      for (let index = end; index > peak; index -= 1) outline.push(at(index));
      return `${linePath(outline)}Z`;
    })
    .join('');
}
