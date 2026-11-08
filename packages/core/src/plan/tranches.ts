// The three sell parts (docs/DOMAIN.md §3.8), ported from the prototype's sellTranches(): a third in
// the window's first month, a third in its third month, the rest in the month it closes, so one bad
// week cannot decide the whole plan.
import { addMonthsToKey, type MonthKey, minDate, monthKey, monthStart } from '../dates/calendar';
import type { Plan } from '../schema/plan';

export type Tranche = {
  readonly part: 1 | 2 | 3;
  readonly month: MonthKey;
  /** A third of what is held at the start of the window, or everything left. */
  readonly portion: 'third' | 'rest';
  readonly done: boolean;
};

/**
 * Empty without a sell window. In a window that closes before its third calendar month, part 2 moves
 * onto the closing month.
 */
export function sellTranches(plan: Plan): Tranche[] {
  const window = plan.sellWindow;
  if (window === null) return [];
  const first = monthKey(window.opens);
  const last = monthKey(window.closes);
  const third = monthKey(minDate(monthStart(addMonthsToKey(first, 2)), monthStart(last)));
  return [
    { part: 1, month: first, portion: 'third', done: plan.sellChecks.part1 },
    { part: 2, month: third, portion: 'third', done: plan.sellChecks.part2 },
    { part: 3, month: last, portion: 'rest', done: plan.sellChecks.part3 },
  ];
}
