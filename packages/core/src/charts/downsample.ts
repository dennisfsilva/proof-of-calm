// Fewer points for a long series (ADR-0022), ported from the prototype's downsample(), which kept 420
// points per chart: evenly spaced by position, with the first and the last point always kept.

/**
 * `n` points at positions ⌊i × length / n⌋ plus the last point, so at most n + 1; a series of at most
 * `n` points is returned whole. The positions are integer arithmetic (the prototype multiplied by a
 * float step).
 */
export function downsample<P>(points: readonly P[], n: number): P[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Cannot keep ${n} points`);
  if (points.length <= n) return [...points];
  const kept: P[] = [];
  for (let index = 0; index < n; index += 1) kept.push(points[Math.floor((index * points.length) / n)] as P);
  // With more points than n the last position taken is before the end, so the last point is added.
  kept.push(points[points.length - 1] as P);
  return kept;
}
