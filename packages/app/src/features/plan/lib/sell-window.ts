// The sell-window editor's value (docs/DOMAIN.md §2.1, §3.8): no window, or its three dates as the date inputs
// give them ('' while one is empty), and whether the person accepted a window that opens before the last buy
// passes the holding rule. The acceptance holds only for the dates it was given for: the editors drop it when a
// date or the rule moves, and `sellWindowOf` records it only on a window that opens early.
import { GENERIC_COUNTRY } from '@proofofcalm/content';
import {
  type CalendarDate,
  type CountryCode,
  eligibleFrom,
  err,
  type HoldingEffect,
  type HoldingRule,
  ok,
  type Plan,
  type Result,
  type SellWindow,
  sameHoldingRule,
} from '@proofofcalm/core';
import type { HoldingCountry } from './holding';

export type SellWindowValue = {
  readonly mode: 'none' | 'dates';
  readonly opens: CalendarDate | '';
  readonly closes: CalendarDate | '';
  readonly exitBy: CalendarDate | '';
  readonly acceptEarly: boolean;
};

type DateField = 'opens' | 'closes' | 'exitBy';
export type SellWindowIssue =
  | { readonly code: 'date-required'; readonly path: readonly ['sellWindow', DateField] }
  | { readonly code: 'sell-window-order'; readonly path: readonly ['sellWindow', 'closes' | 'exitBy'] }
  | { readonly code: 'sell-window-before-eligibility'; readonly path: readonly ['sellWindow', 'acceptEarly'] };

/** The day the last buy passes the holding rule, what passing it means, and the earlier day the window opens. */
export type EarlyOpen = {
  readonly eligibleOn: CalendarDate;
  readonly effect: HoldingEffect;
  readonly opensOn: CalendarDate;
};
/** The rule as Hold & sell names it: the country's, the general profile's on the generic profile, or the own. */
export type RuleName = 'country' | 'generic' | 'own';
/**
 * An early opening with the rule it is measured by, as the notice words it, and the country whose rule it is,
 * named in the notice with its date line under it (absent while the country's rules are not loaded).
 */
export type EarlyNotice = EarlyOpen & { readonly rule: RuleName; readonly country?: HoldingCountry | undefined };

const DATES: readonly DateField[] = ['opens', 'closes', 'exitBy'];

/** When the window opens before the plan's last buy passes its holding rule, both days; otherwise null. */
export function earlyOpen(
  plan: Pick<Plan, 'lastBuy' | 'holdingRule'>,
  window: Pick<SellWindow, 'opens'> | null,
): EarlyOpen | null {
  if (window === null || plan.holdingRule.kind === 'none') return null;
  const eligibleOn = eligibleFrom(plan.lastBuy, plan.holdingRule);
  return window.opens < eligibleOn ? { eligibleOn, effect: plan.holdingRule.effect, opensOn: window.opens } : null;
}

/** The name of the rule: the country's while the plan keeps it, as `holdingValueOf` chooses the card. */
export function ruleNameOf(
  rule: HoldingRule,
  country: { readonly code: CountryCode; readonly holdingRule: HoldingRule } | null,
): RuleName {
  if (country === null || !sameHoldingRule(rule, country.holdingRule)) return 'own';
  return country.code === GENERIC_COUNTRY ? 'generic' : 'country';
}

/**
 * Whether the plan as stored accepted this window's early opening under this rule: an acceptance holds only for
 * the dates and the rule it was given for, so any change asks again.
 */
export function acceptedAsStored(
  plan: Pick<Plan, 'holdingRule' | 'sellWindow'>,
  rule: HoldingRule,
  value: SellWindowValue,
): boolean {
  const stored = plan.sellWindow;
  if (stored?.acceptedEarlyOpen !== true || value.mode === 'none') return false;
  return DATES.every((field) => value[field] === stored[field]) && sameHoldingRule(rule, plan.holdingRule);
}

/** `earlyOpen` for the window the editor shows, while it has an opening date. */
export function earlyOpenOf(plan: Pick<Plan, 'lastBuy' | 'holdingRule'>, value: SellWindowValue): EarlyOpen | null {
  return value.mode === 'dates' && value.opens !== '' ? earlyOpen(plan, { opens: value.opens }) : null;
}

/** The editor's value for the plan's window: the acceptance starts unticked, since the stored one holds itself. */
export function sellWindowValueOf(window: SellWindow | null): SellWindowValue {
  if (window === null) return { mode: 'none', opens: '', closes: '', exitBy: '', acceptEarly: false };
  const { opens, closes, exitBy } = window;
  return { mode: 'dates', opens, closes, exitBy, acceptEarly: false };
}

/** Two windows with the same dates and the same acceptance, or both none. */
export function sameWindow(a: SellWindow | null, b: SellWindow | null): boolean {
  if (a === null || b === null) return a === b;
  return DATES.every((field) => a[field] === b[field]) && a.acceptedEarlyOpen === b.acceptedEarlyOpen;
}

/**
 * The window the value makes for the plan's last buy and holding rule, or its issues: each empty date, then
 * a date before the one it follows (on the later date), then an early opening the person has not accepted (on
 * the acceptance). An accepted early window carries `acceptedEarlyOpen`; a window that opens in time never does.
 */
export function sellWindowOf(
  plan: Pick<Plan, 'lastBuy' | 'holdingRule'>,
  value: SellWindowValue,
): Result<SellWindow | null, SellWindowIssue[]> {
  if (value.mode === 'none') return ok(null);
  const { opens, closes, exitBy } = value;
  if (opens === '' || closes === '' || exitBy === '') {
    return err(
      DATES.filter((field) => value[field] === '').map(
        (field): SellWindowIssue => ({
          code: 'date-required',
          path: ['sellWindow', field],
        }),
      ),
    );
  }
  const order: SellWindowIssue[] = [];
  if (closes < opens) order.push({ code: 'sell-window-order', path: ['sellWindow', 'closes'] });
  if (exitBy < closes) order.push({ code: 'sell-window-order', path: ['sellWindow', 'exitBy'] });
  if (order.length > 0) return err(order);
  const window: SellWindow = { opens, closes, exitBy };
  if (earlyOpen(plan, window) === null) return ok(window);
  if (value.acceptEarly) return ok({ ...window, acceptedEarlyOpen: true });
  return err([{ code: 'sell-window-before-eligibility', path: ['sellWindow', 'acceptEarly'] }]);
}
