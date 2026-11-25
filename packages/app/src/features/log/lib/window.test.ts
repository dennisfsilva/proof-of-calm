import type { LogRow } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { clampStart, windowRows, yearStarts } from './window';

// The Log's window (docs/DOMAIN.md §3.9): a run of transactions, newest first, with the skipped months among them;
// a skip belongs to the window of the next older transaction, so a window never ends on one.

const tx = (date: string): LogRow => ({ type: 'transaction', key: `t|${date}`, date }) as unknown as LogRow;
const skip = (date: string): LogRow => ({ type: 'skip', key: `s|${date}`, date }) as unknown as LogRow;
const keys = (rows: readonly LogRow[]) => rows.map((row) => row.key);

// Newest first: a skip at the top, one between the second and third transactions, one below the oldest.
const ROWS = [
  skip('2026-11-05'),
  tx('2026-10-05'),
  tx('2026-09-05'),
  skip('2026-08-05'),
  tx('2025-07-05'),
  tx('2025-06-05'),
  tx('2024-05-05'),
  skip('2024-04-05'),
];

describe('windowRows', () => {
  it('counts transactions only, and keeps a skip above the next older transaction', () => {
    expect(keys(windowRows(ROWS, 0, 2))).toEqual(['s|2026-11-05', 't|2026-10-05', 't|2026-09-05']);
    expect(keys(windowRows(ROWS, 2, 2))).toEqual(['s|2026-08-05', 't|2025-07-05', 't|2025-06-05']);
  });

  it('ends the last window with the skips below the oldest transaction', () => {
    expect(keys(windowRows(ROWS, 4, 2))).toEqual(['t|2024-05-05', 's|2024-04-05']);
    expect(keys(windowRows(ROWS, 0, 5))).toEqual(keys(ROWS));
  });

  it('starts at any transaction, not only at a multiple of the size', () => {
    expect(keys(windowRows(ROWS, 1, 2))).toEqual(['t|2026-09-05', 's|2026-08-05', 't|2025-07-05']);
  });
});

describe('clampStart', () => {
  it('keeps a start with a transaction at it, and moves one past the last to the last full window', () => {
    expect(clampStart(4, 5, 2)).toBe(4);
    expect(clampStart(5, 5, 2)).toBe(3);
    expect(clampStart(9, 1, 2)).toBe(0);
    expect(clampStart(0, 0, 2)).toBe(0);
  });
});

describe('yearStarts', () => {
  it("gives each year's newest transaction, newest year first", () => {
    expect(yearStarts(ROWS)).toEqual([
      { year: 2026, start: 0 },
      { year: 2025, start: 2 },
      { year: 2024, start: 4 },
    ]);
  });

  it('gives no year to skips alone', () => {
    expect(yearStarts([skip('2027-01-05'), tx('2026-10-05')])).toEqual([{ year: 2026, start: 0 }]);
  });
});
