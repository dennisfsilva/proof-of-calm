import { compare, type Percent, round } from '@proofofcalm/core';

/**
 * The decimals the import report's split line writes a share with. The normaliser (`readSplit` in
 * packages/core/src/import/prototype.ts) reads each share at 4 decimals and closes a residue above 0 and at most its
 * tolerance, 0.01, on the largest one: the old and new share then differ by 0.0001 to 0.01. 2 decimals, the
 * tolerance's own, is the line's usual form; 4, the shares' own, always tells the two apart.
 */
export const SHARE_PRECISION = { min: 2, max: 4 } as const;

/**
 * The fewest decimals from 2 to 4 at which `from` and `to`, rounded half-even as `Formatters['percent']` rounds,
 * differ; 2 when they are equal even at 4, which the normaliser never reports (a zero residue writes no note).
 */
export function sharePrecision(from: Percent, to: Percent): number {
  for (let decimals: number = SHARE_PRECISION.min; decimals <= SHARE_PRECISION.max; decimals += 1) {
    if (compare(round(from, decimals, 'half-even'), round(to, decimals, 'half-even')) !== 0) return decimals;
  }
  return SHARE_PRECISION.min;
}
