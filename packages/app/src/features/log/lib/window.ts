import type { LogRow } from '@proofofcalm/core';

// The Log's window (docs/DOMAIN.md §3.9): `size` transactions from the `start`-th, newest first, with the skipped
// months among them. A skip goes with the next older transaction, so it shows above it; the skips below the oldest
// transaction go with the last window.

/** The rows of the window of `size` transactions from the `start`-th (from 0). */
export function windowRows(rows: readonly LogRow[], start: number, size: number): readonly LogRow[] {
  let seen = 0;
  let from = start === 0 ? 0 : rows.length;
  let to = rows.length;
  for (const [index, row] of rows.entries()) {
    if (row.type !== 'transaction') continue;
    seen += 1;
    if (seen === start) from = index + 1;
    if (seen === start + size) {
      to = index + 1;
      break;
    }
  }
  const older = rows.slice(to).some((row) => row.type === 'transaction');
  return rows.slice(from, older ? to : rows.length);
}

/** The start itself while a transaction is at it; past the last one (after deletes), the last full window. */
export function clampStart(start: number, count: number, size: number): number {
  return start < count ? start : Math.max(0, count - size);
}

/** Each year's newest transaction, as a window start, newest year first. */
export function yearStarts(rows: readonly LogRow[]): readonly { year: number; start: number }[] {
  const starts: { year: number; start: number }[] = [];
  let seen = 0;
  for (const row of rows) {
    if (row.type !== 'transaction') continue;
    const year = Number(row.date.slice(0, 4));
    if (starts.at(-1)?.year !== year) starts.push({ year, start: seen });
    seen += 1;
  }
  return starts;
}
