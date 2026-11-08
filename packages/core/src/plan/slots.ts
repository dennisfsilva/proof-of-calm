// The monthly slots of a plan (docs/DOMAIN.md §3.1), ported from the prototype's slots(): the first
// slot is due on the first buy; every later slot on the buy day, clamped to the month's length.
import {
  addMonthsClamped,
  type CalendarDate,
  clampDay,
  dateParts,
  type MonthKey,
  monthKey,
  startOfMonth,
} from '../dates/calendar';
import { isPositive, type Money } from '../money/decimal';

export type Slot = { readonly key: MonthKey; readonly due: CalendarDate };

export type SlotPlan = {
  readonly monthlyAmount: Money;
  readonly firstBuy: CalendarDate;
  readonly lastBuy: CalendarDate;
  readonly buyDay: number;
};

/**
 * Without a monthly amount there are no slots. There is no silent cap here (the prototype stopped at
 * 72 without telling anyone): the plan invariant refuses plans with more than MAX_SLOTS.
 */
export function slots(plan: SlotPlan): Slot[] {
  if (!isPositive(plan.monthlyAmount)) return [];
  const result: Slot[] = [];
  for (let index = 0; ; index += 1) {
    const monthStart = startOfMonth(addMonthsClamped(plan.firstBuy, index));
    if (monthStart > plan.lastBuy) break;
    const { year, month } = dateParts(monthStart);
    const due = index === 0 ? plan.firstBuy : clampDay(year, month, plan.buyDay);
    if (due > plan.lastBuy) break;
    result.push({ key: monthKey(monthStart), due });
  }
  return result;
}
