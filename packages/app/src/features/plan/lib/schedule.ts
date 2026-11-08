// The amount-and-dates editor's value (docs/DOMAIN.md §2.1): the two amounts as typed, decimal strings
// never read through a float, the dates as the date input gives them ('' while one is empty), and whether the
// person accepted a sell window the last buy opens early. `schedule` reads the amounts with the formatting
// locale (ADR-0034) and keeps the core's issues of these fields, as `coinSplit` does for the coins; the
// screens map codes to copy.
import {
  addDays,
  addYearsClamped,
  type CalendarDate,
  err,
  MAX_SLOTS,
  type Money,
  ok,
  type Plan,
  type PlanIssue,
  planIssues,
  type Result,
  type SellWindow,
  slots,
} from '@proofofcalm/core';
import type { NumberInput, NumberInputError } from '../../../lib/format';
import { type EarlyOpen, earlyOpen } from './sell-window';

export type ScheduleValue = {
  /** The typed text of each amount, in the pay currency; empty reads as 0. */
  readonly monthlyAmount: string;
  readonly startingAmount: string;
  readonly firstBuy: CalendarDate | '';
  /** 1 to 28: the buy day is a select (ADR-0034). */
  readonly buyDay: number;
  readonly lastBuy: CalendarDate | '';
  /** The acceptance of a sell window that opens before the last buy passes the holding rule. */
  readonly acceptEarly: boolean;
};

type AmountField = 'monthlyAmount' | 'startingAmount';
type DateField = 'firstBuy' | 'lastBuy';
/** The fields the value makes; the sell window only with an acceptance given in this editor. */
export type Schedule = Pick<Plan, AmountField | DateField | 'buyDay'> & { readonly sellWindow?: SellWindow };

/** An amount that cannot be read, on its path, as the core's amount issues are. */
type AmountIssue = NumberInputError & { readonly path: readonly [AmountField] };
type DateIssue = { readonly code: 'date-required'; readonly path: readonly [DateField] };
/** A sell window the last buy opens early, not accepted: on the acceptance, which the notice words. */
type EarlyIssue = { readonly code: 'sell-window-before-eligibility'; readonly path: readonly ['acceptEarly'] };
/** The core's plan-too-long with the half that refused it: more than MAX_SLOTS buys, or MAX_PLAN_YEARS. */
type LengthIssue = {
  readonly code: 'plan-too-long';
  readonly path: readonly ['lastBuy'];
  readonly limit: 'buys' | 'years';
};
export type ScheduleIssue = PlanIssue | AmountIssue | DateIssue | LengthIssue | EarlyIssue;

/**
 * The longest plan in years, last buy to first: the first half of PlanSchema's plan-too-long check
 * (packages/core/src/schema/plan.ts:163), which the core exports no constant for; a test checks the
 * boundary against the core. The other half, MAX_SLOTS buys, is often reached first: `lastBuyMax`
 * takes both.
 */
export const MAX_PLAN_YEARS = 20;

/**
 * The last date the plan accepts as its last buy, the max of the last buy's date picker: the day
 * before the buy after the MAX_SLOTS-th, from the core's own slots, or MAX_PLAN_YEARS after the first
 * buy when that comes first (a buy day after the first buy's day). It counts the buys a monthly amount
 * makes: a plan without one has no buys and the core takes it to the 20 years, a month at most past
 * this bound.
 */
export function lastBuyMax(firstBuy: CalendarDate, buyDay: number): CalendarDate {
  const years = addYearsClamped(firstBuy, MAX_PLAN_YEARS);
  const beyond = slots({ monthlyAmount: '1' as Money, firstBuy, buyDay, lastBuy: years })[MAX_SLOTS];
  return beyond === undefined ? years : addDays(beyond.due, -1);
}

const windowDates = ({ opens, closes, exitBy }: SellWindow): SellWindow => ({ opens, closes, exitBy });

/**
 * The early opening a last buy asks the person to accept: the plan's window opens before it passes the holding
 * rule, and the plan as stored holds no acceptance for this last buy (one holds only for the last buy it was
 * given for, the window and the rule moving on Hold & sell, which asks again).
 */
export function earlyToAccept(plan: Plan, lastBuy: CalendarDate): EarlyOpen | null {
  if (plan.sellWindow?.acceptedEarlyOpen === true && lastBuy === plan.lastBuy) return null;
  return earlyOpen({ lastBuy, holdingRule: plan.holdingRule }, plan.sellWindow);
}

const AMOUNTS: readonly AmountField[] = ['monthlyAmount', 'startingAmount'];
const DATES: readonly DateField[] = ['firstBuy', 'lastBuy'];
const PATHS: ReadonlySet<unknown> = new Set<string>([...AMOUNTS, ...DATES, 'buyDay']);

/**
 * The plan's amounts and dates the value makes, or its issues: the amounts that cannot be read and the
 * dates left empty first (the plan's checks wait for them), then the core's issues on these fields for
 * the rest of the plan as it is.
 */
export function schedule(
  plan: Plan,
  value: ScheduleValue,
  numberInput: NumberInput,
): Result<Schedule, ScheduleIssue[]> {
  const unread: ScheduleIssue[] = [];
  const amounts: Partial<Record<AmountField, Money>> = {};
  for (const field of AMOUNTS) {
    const text = value[field].trim();
    const read = text === '' ? ok('0' as Money) : numberInput.parse<Money>(text);
    if (read.ok) amounts[field] = read.value;
    else unread.push({ ...read.error, path: [field] });
  }
  for (const field of DATES) if (value[field] === '') unread.push({ code: 'date-required', path: [field] });
  const { monthlyAmount, startingAmount } = amounts;
  const { firstBuy, lastBuy, buyDay } = value;
  if (monthlyAmount === undefined || startingAmount === undefined || firstBuy === '' || lastBuy === '') {
    return err(unread);
  }
  // Only an acceptance given here goes on the window, so the editor never sends a window it did not edit; one
  // not given leaves the window unaccepted for the plan's checks.
  const fields = { monthlyAmount, startingAmount, firstBuy, buyDay, lastBuy };
  const window =
    earlyToAccept(plan, lastBuy) === null || plan.sellWindow === null ? null : windowDates(plan.sellWindow);
  const next: Schedule =
    window !== null && value.acceptEarly ? { ...fields, sellWindow: { ...window, acceptedEarlyOpen: true } } : fields;
  // Without a monthly amount there are no buys, so only the years can refuse the plan's length.
  const limit = slots(next).length > MAX_SLOTS ? 'buys' : 'years';
  const checked = window === null || value.acceptEarly ? next : { ...next, sellWindow: window };
  const issues = planIssues({ ...plan, ...checked }).flatMap((issue): ScheduleIssue[] => {
    if (issue.code === 'plan-too-long') return [{ ...issue, path: ['lastBuy'], limit }];
    if (issue.code === 'sell-window-before-eligibility') return [{ code: issue.code, path: ['acceptEarly'] }];
    return PATHS.has(issue.path[0]) ? [issue] : [];
  });
  return issues.length > 0 ? err(issues) : ok(next);
}
