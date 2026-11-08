// Starting a plan from a template (docs/DOMAIN.md §5, ADR-0009). A template is a starting point, never
// a recommendation: it gives the coins and the split, and a dated template its last buy and sell window;
// the holding rule always comes from the user's country, and the amounts and the first buy are the user's.
import type { CalendarDate, Instant } from '../dates/calendar';
import type { CurrencyCode } from '../money/currency';
import { compare, type Money } from '../money/decimal';
import { err, ok, type Result } from '../result';
import type { HoldingRule } from '../schema/holding-rule';
import type { CountryCode, EntityId } from '../schema/ids';
import { PLAN_SCHEMA_VERSION, type Plan, type PlanIssueCode, planIssues, type SellWindow } from '../schema/plan';
import type { Template } from '../schema/template';

export type TemplateStart = {
  readonly id: EntityId;
  readonly country: CountryCode;
  readonly countryRuleVersion: number;
  /** The country's rule, never the template's. */
  readonly holdingRule: HoldingRule;
  readonly payCurrency: CurrencyCode;
  readonly displayCurrency: CurrencyCode;
  readonly monthlyAmount: Money;
  readonly startingAmount: Money;
  readonly firstBuy: CalendarDate;
  readonly buyDay: number;
  /** The user's dates, used when the template has none or its dates have passed. */
  readonly lastBuy: CalendarDate | null;
  readonly sellWindow: SellWindow | null;
  /** The user saw that the window opens before the last purchase passes the rule and kept it. */
  readonly acceptEarlyOpen: boolean;
  readonly why: string;
  readonly today: CalendarDate;
  readonly now: Instant;
};

export type TemplateError =
  | { readonly code: 'dates-needed' }
  | { readonly code: 'invalid-plan'; readonly issues: readonly PlanIssueCode[] };

/** The prototype's recDatesOk(): a dated template's dates are filled in only before `validUntil`. */
export function templateDatesUsable(template: Template, today: CalendarDate): boolean {
  return template.validUntil === undefined || today < template.validUntil;
}

export function planFromTemplate(template: Template, start: TemplateStart): Result<Plan, TemplateError> {
  const templateLastBuy = templateDatesUsable(template, start.today) ? template.lastBuy : undefined;
  const lastBuy = templateLastBuy ?? start.lastBuy;
  if (lastBuy === null) return err({ code: 'dates-needed' });
  const window = templateLastBuy === undefined ? start.sellWindow : template.sellWindow;
  const plan: Plan = {
    id: start.id,
    schemaVersion: PLAN_SCHEMA_VERSION,
    country: start.country,
    countryRuleVersion: start.countryRuleVersion,
    payCurrency: start.payCurrency,
    displayCurrency: start.displayCurrency,
    coins: template.coins,
    split: template.split,
    monthlyAmount: start.monthlyAmount,
    startingAmount: start.startingAmount,
    firstBuy: start.firstBuy,
    buyDay: start.buyDay,
    lastBuy,
    holdingRule: start.holdingRule,
    sellWindow: window === null ? null : { ...window, ...(start.acceptEarlyOpen ? { acceptedEarlyOpen: true } : {}) },
    references: template.references,
    // A multiple of the money put in is a projection (docs/LEGAL.md §3.6): only a person's own file holds any.
    expectations: {},
    pauses: [],
    skips: [],
    endedBuyingOn: null,
    sellChecks: { part1: false, part2: false, part3: false },
    why: start.why,
    templateId: template.id,
    // Onboarding records the acknowledgement on the plan it saves (docs/DOMAIN.md §2.1).
    riskAcknowledgedAt: null,
    riskWordingVersion: 0,
    createdAt: start.now,
    updatedAt: start.now,
  };
  const issues = planIssues(plan);
  return issues.length === 0 ? ok(plan) : err({ code: 'invalid-plan', issues: issues.map((issue) => issue.code) });
}

const sameDates = (a: SellWindow | null, b: SellWindow) =>
  a !== null && a.opens === b.opens && a.closes === b.closes && a.exitBy === b.exitBy;

/**
 * Whether the plan is still the template it started from: the same coins (in any order) and split, and
 * a dated template's last buy and window. A template without a window lets the user add one. Otherwise
 * the plan keeps `templateId` for history and the UI calls it "your own plan".
 */
export function followsTemplate(plan: Plan, template: Template): boolean {
  if (plan.templateId !== template.id) return false;
  const coins = new Set(plan.coins.map((coin) => coin.id));
  const shares = Object.entries(template.split);
  const sameSplit =
    shares.length === Object.keys(plan.split).length &&
    shares.every(([coin, share]) => {
      const mine = plan.split[coin as keyof typeof plan.split];
      return mine !== undefined && compare(mine, share) === 0;
    });
  const sameCoins = coins.size === template.coins.length && template.coins.every((coin) => coins.has(coin.id));
  if (!sameCoins || !sameSplit) return false;
  if (template.sellWindow === null) return true;
  return sameDates(plan.sellWindow, template.sellWindow) && plan.lastBuy === template.lastBuy;
}
