// SVG path data for the chart components in packages/ui (ADR-0022), from points already in pixels.
// Coordinates are written at one decimal place, the prototype's precision.
import type { Pixel } from './scale';

export type Point = readonly [x: Pixel, y: Pixel];

/** One decimal place without a trailing zero ("12.5", "12"); never "-0" or "NaN". */
function coordinate(value: Pixel): string {
  if (!Number.isFinite(value)) throw new RangeError(`${value} is not a coordinate`);
  return String(Math.round(value * 10) / 10);
}

function command(letter: 'M' | 'L', [x, y]: Point): string {
  return `${letter}${coordinate(x)} ${coordinate(y)}`;
}

/** "M x y" for the first point and "L x y" for each next one: one command per point. */
export function linePath(points: readonly Point[]): string {
  return points.map((point, index) => command(index === 0 ? 'M' : 'L', point)).join('');
}

/** The line closed down to `baseline` and back to its start: the filled area under a series. */
export function areaPath(points: readonly Point[], baseline: Pixel): string {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return '';
  return `${linePath(points)}${command('L', [last[0], baseline])}${command('L', [first[0], baseline])}Z`;
}
