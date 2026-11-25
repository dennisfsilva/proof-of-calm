'use client';

import { LOG_PAGE, LOG_WINDOW, type LogRow } from '@proofofcalm/core';
import { startTransition, useDeferredValue, useMemo, useState } from 'react';
import { clampStart, windowRows } from '../lib/window';

// Which rows the Log shows (docs/DOMAIN.md §3.9): its last LOG_PAGE transactions until Show all, then a window of
// LOG_WINDOW, so a render mounts at most that many rows at the cap (docs/ENGINEERING.md §4). The reveal is deferred:
// the screen commits first with the rows it has, Show all's button still there, and the window follows in a render
// the browser can interrupt; each move of the window is a transition, so the rows shown stay until the next are ready.

export type LogRange = { readonly first: number; readonly last: number; readonly count: number };

const transaction = (row: LogRow) => row.type === 'transaction';

export function useLogWindow(rows: readonly LogRow[], all: boolean) {
  const size = useDeferredValue(all ? LOG_WINDOW : LOG_PAGE, LOG_PAGE);
  const revealed = size === LOG_WINDOW;
  const [start, setStart] = useState(0);
  const count = useMemo(() => rows.filter(transaction).length, [rows]);
  // A delete that empties the window's end moves it back to the last full one; the stored start stays.
  const at = revealed ? clampStart(start, count, size) : 0;
  const visible = useMemo(() => windowRows(rows, at, size), [rows, at, size]);
  const last = at + visible.filter(transaction).length;
  // A range only when a window holds fewer than all: up to LOG_WINDOW transactions, Show all shows them all.
  const range: LogRange | null = revealed && count > LOG_WINDOW ? { first: at + 1, last, count } : null;
  // Says whether the window moves (a year whose newest transaction the window already starts on does not).
  const move = (next: number) => {
    const to = clampStart(Math.max(0, next), count, size);
    startTransition(() => setStart(to));
    return to !== at;
  };
  return {
    visible,
    range,
    revealed,
    older: () => move(at + size),
    newer: () => move(at - size),
    goTo: (next: number) => move(next),
  };
}
