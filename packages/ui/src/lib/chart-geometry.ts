// Small geometry helpers for the chart components. The core computes every position (docs/DOMAIN.md
// §3.14); these only place what it computed: keep a mark inside the plot, find the point under the
// pointer, write a fraction as an SVG percentage. Pixels are not amounts, so numbers are right here.

/** `value` kept within `low` and `high`. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The index of the value nearest to `target` in `values`, which ascend (the x of a series' points);
 * a tie goes to the earlier point. -1 when there are no values.
 */
export function nearestIndex(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  if (high < 0) return -1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((values[middle] ?? 0) < target) low = middle + 1;
    else high = middle;
  }
  const before = values[low - 1];
  const at = values[low] ?? 0;
  return before !== undefined && target - before <= at - target ? low - 1 : low;
}

/** A fraction of a box (0 to 1) as an SVG length in percent, at two decimals ("42.5%"). */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`;
}
