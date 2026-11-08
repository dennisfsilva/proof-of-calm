// The onboarding's state and its calls into the core (docs/DOMAIN.md §5, ADR-0009): the user's country,
// template and numbers become a plan through `planFromTemplate`; on the custom path the user's coins and
// split, amounts and dates are read by plan's `coinSplit` and `schedule` over a base plan of the country.
// The holding rule and the currencies are the country profile's, every other choice the user's. Both paths
// then ask for the sentence and the reminder and end on the summary, whose Start writes the plan.
import { type CountryProfile, countryRules, type ProfileCode } from '@proofofcalm/content';
import {
  type CalendarDate,
  dateParts,
  decimalPlaces,
  type EntityId,
  err,
  type Instant,
  MINOR_UNITS,
  type Money,
  ok,
  PLAN_SCHEMA_VERSION,
  type Plan,
  type PlanIssueCode,
  parseCalendarDate,
  planFromTemplate,
  planIssues,
  type Result,
  type Template,
  type TemplateError,
  templateDatesUsable,
} from '@proofofcalm/core';
import { RISK_WORDING_VERSION } from '../../../lib/brand';
import type { NumberInput, NumberInputError } from '../../../lib/format';
import { coinSplit, type ScheduleIssue, type ScheduleValue, type SplitIssue, schedule } from '../../plan';
import type { SetupDraft } from './draft';

export type FieldName = 'monthly' | 'starting' | 'firstBuy' | 'lastBuy';
/** The plan issues a field can fix: each is worded under that field (docs/CONTENT-STYLE.md §1 rule 8). */
type FieldPlanIssue = Extract<
  PlanIssueCode,
  'no-amount' | 'amount-precision' | 'last-buy-before-first-buy' | 'plan-too-long'
>;
export type FieldIssue = {
  readonly field: FieldName;
  readonly error: NumberInputError | { readonly code: 'date-empty' } | { readonly code: FieldPlanIssue };
};

export type StartContext = {
  readonly profile: CountryProfile;
  readonly template: Template;
  readonly numberInput: NumberInput;
  readonly today: CalendarDate;
  readonly now: Instant;
};

/** The highest buy day: every month has it (ADR-0034's select of 1 to 28). */
const LAST_BUY_DAY = 28;

export function emptyDraft(today: CalendarDate, id: EntityId, country: ProfileCode | null = null): SetupDraft {
  return {
    id,
    country,
    path: 'template',
    templateId: null,
    coins: { coins: [], shares: {} },
    monthly: '',
    starting: '',
    firstBuy: today,
    lastBuy: '',
    buyDay: null,
    acceptEarlyOpen: false,
    why: '',
    reminder: null,
  };
}

/**
 * A template gives the last buy only while its dates are usable and the typed first buy is not after
 * it (docs/DOMAIN.md §5); otherwise the onboarding asks for one.
 */
export function needsLastBuy(template: Template, today: CalendarDate, firstBuy: string): boolean {
  if (template.lastBuy === undefined || !templateDatesUsable(template, today)) return true;
  const first = parseCalendarDate(firstBuy);
  return first !== null && first > template.lastBuy;
}

/** The template without its dates: the user's last buy and no sell window, as for a template that has none. */
function undated(template: Template): Template {
  const { lastBuy: _dated, ...rest } = template;
  return { ...rest, sellWindow: null };
}

/** The first buy's day of the month, and 28 for the 29th to the 31st (docs/DOMAIN.md §5). */
function buyDayOf(firstBuy: CalendarDate): number {
  return Math.min(dateParts(firstBuy).day, LAST_BUY_DAY);
}

export function startPlan(
  draft: SetupDraft,
  context: StartContext,
): Result<Plan, TemplateError | { readonly code: 'fields'; readonly issues: FieldIssue[] }> {
  const { profile, template, numberInput, today } = context;
  const issues: FieldIssue[] = [];
  const amount = (field: 'monthly' | 'starting', typed: string): Money => {
    if (field === 'starting' && typed.trim() === '') return '0' as Money;
    const parsed = numberInput.parse<Money>(typed);
    if (parsed.ok) return parsed.value;
    issues.push({ field, error: parsed.error });
    return '0' as Money;
  };
  const date = (field: 'firstBuy' | 'lastBuy', typed: string): CalendarDate | null => {
    const parsed = parseCalendarDate(typed);
    if (parsed === null) issues.push({ field, error: { code: 'date-empty' } });
    return parsed;
  };
  const monthlyAmount = amount('monthly', draft.monthly);
  const startingAmount = amount('starting', draft.starting);
  const firstBuy = date('firstBuy', draft.firstBuy);
  const asksLastBuy = needsLastBuy(template, today, draft.firstBuy);
  const lastBuy = asksLastBuy ? date('lastBuy', draft.lastBuy) : null;
  if (firstBuy === null || issues.length > 0) return err({ code: 'fields', issues });

  const rules = countryRules(profile);
  const result = planFromTemplate(asksLastBuy ? undated(template) : template, {
    id: draft.id,
    country: rules.code,
    countryRuleVersion: rules.status.version,
    holdingRule: rules.holdingRule,
    payCurrency: rules.currency,
    displayCurrency: rules.currency,
    monthlyAmount,
    startingAmount,
    firstBuy,
    buyDay: buyDayOf(firstBuy),
    lastBuy,
    sellWindow: null,
    acceptEarlyOpen: draft.acceptEarlyOpen,
    why: draft.why.trim(),
    today,
    now: context.now,
  });
  // Start is the acknowledgement of the disclosure above it (docs/LEGAL.md §4): the plan records when and which text.
  if (result.ok) {
    return {
      ...result,
      value: { ...result.value, riskAcknowledgedAt: context.now, riskWordingVersion: RISK_WORDING_VERSION },
    };
  }
  if (result.error.code !== 'invalid-plan') return result;
  const digits = MINOR_UNITS[rules.currency];
  const amounts = { monthly: monthlyAmount, starting: startingAmount };
  const placed = result.error.issues.flatMap((code): FieldIssue[] => {
    switch (code) {
      case 'no-amount':
        return [{ field: 'monthly', error: { code } }];
      case 'amount-precision':
        return (['monthly', 'starting'] as const)
          .filter((field) => decimalPlaces(amounts[field]) > digits)
          .map((field) => ({ field, error: { code } }));
      case 'last-buy-before-first-buy':
      case 'plan-too-long':
        // Without a Last buy field the template's last buy stands, so the first buy is what to change.
        return [{ field: asksLastBuy ? 'lastBuy' : 'firstBuy', error: { code } }];
      default:
        return [];
    }
  });
  return placed.length > 0 ? err({ code: 'fields', issues: placed }) : result;
}

/** What the custom path reads the draft with: the country, the formatting and the time. */
export type CustomContext = Omit<StartContext, 'template'>;

/**
 * The chosen country's plan with the draft's coins and placeholders for the rest, the base `coinSplit`
 * and `schedule` check against: no template, no sell window, no references and no expectations.
 */
function basePlan(draft: SetupDraft, context: CustomContext): Plan {
  const { code, status, holdingRule, currency } = countryRules(context.profile);
  return {
    id: draft.id,
    schemaVersion: PLAN_SCHEMA_VERSION,
    country: code,
    countryRuleVersion: status.version,
    payCurrency: currency,
    displayCurrency: currency,
    coins: [...draft.coins.coins],
    split: {},
    monthlyAmount: '1' as Money,
    startingAmount: '0' as Money,
    firstBuy: context.today,
    buyDay: buyDayOf(context.today),
    lastBuy: context.today,
    holdingRule,
    sellWindow: null,
    references: {},
    expectations: {},
    pauses: [],
    skips: [],
    endedBuyingOn: null,
    sellChecks: { part1: false, part2: false, part3: false },
    why: draft.why.trim(),
    templateId: null,
    riskAcknowledgedAt: null,
    riskWordingVersion: 0,
    createdAt: context.now,
    updatedAt: context.now,
  };
}

/** The issues of the custom path's coins and split; none lets the user go on to the dates. */
export function coinsIssues(draft: SetupDraft, context: CustomContext): readonly SplitIssue[] {
  const read = coinSplit(basePlan(draft, context), draft.coins, context.numberInput);
  return read.ok ? [] : read.error;
}

/** The draft's amounts and dates as plan's amount-and-dates editor takes them. */
export function scheduleValueOf(draft: SetupDraft): ScheduleValue {
  const firstBuy = parseCalendarDate(draft.firstBuy) ?? '';
  return {
    monthlyAmount: draft.monthly,
    startingAmount: draft.starting,
    firstBuy,
    buyDay: draft.buyDay ?? (firstBuy === '' ? 1 : buyDayOf(firstBuy)),
    lastBuy: parseCalendarDate(draft.lastBuy) ?? '',
    acceptEarly: false,
  };
}

export function draftPatchOf(value: ScheduleValue): Partial<SetupDraft> {
  return {
    monthly: value.monthlyAmount,
    starting: value.startingAmount,
    firstBuy: value.firstBuy,
    lastBuy: value.lastBuy,
    buyDay: value.buyDay,
  };
}

export type CustomStartError =
  | { readonly code: 'coins'; readonly issues: SplitIssue[] }
  | { readonly code: 'schedule'; readonly issues: ScheduleIssue[] }
  | { readonly code: 'invalid-plan'; readonly issues: PlanIssueCode[] };

/** The custom path's plan: the coins first, then the amounts and dates, then the plan as a whole. */
export function startCustomPlan(draft: SetupDraft, context: CustomContext): Result<Plan, CustomStartError> {
  const base = basePlan(draft, context);
  const coins = coinSplit(base, draft.coins, context.numberInput);
  if (!coins.ok) return err({ code: 'coins', issues: coins.error });
  const fields = schedule({ ...base, ...coins.value }, scheduleValueOf(draft), context.numberInput);
  if (!fields.ok) return err({ code: 'schedule', issues: fields.error });
  // Start is the acknowledgement of the disclosure above it, as on the template path (docs/LEGAL.md §4).
  const plan: Plan = {
    ...base,
    ...coins.value,
    ...fields.value,
    riskAcknowledgedAt: context.now,
    riskWordingVersion: RISK_WORDING_VERSION,
  };
  const issues = planIssues(plan);
  return issues.length > 0 ? err({ code: 'invalid-plan', issues: issues.map((issue) => issue.code) }) : ok(plan);
}

/**
 * The dry run of the draft's path: Numbers and Dates call it on Continue, so a field issue or the early
 * window's acceptance refuses there, and the summary shows the plan it gives; Start runs it again with the
 * time of the tap.
 */
export function checkPlan(
  draft: SetupDraft,
  context: CustomContext & { readonly template: Template | null },
): Result<Plan, TemplateError | { readonly code: 'fields'; readonly issues: FieldIssue[] } | CustomStartError> {
  if (draft.path === 'custom') return startCustomPlan(draft, context);
  if (context.template === null) throw new Error('The template path needs its template');
  return startPlan(draft, { ...context, template: context.template });
}
