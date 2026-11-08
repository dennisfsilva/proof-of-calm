// The plan (docs/DOMAIN.md §2.1, schema version 3). Every invariant is a coded issue so that forms,
// storage reads and imports report the same problem the same way; the shell maps codes to copy.
import * as z from 'zod/mini';
import { MAX_SLOTS, NOTE_MAX_LENGTH } from '../constants';
import { addYearsClamped, CalendarDateSchema, compareDates, InstantSchema, MonthKeySchema } from '../dates/calendar';
import { eligibleFrom } from '../holding/eligible-from';
import { CurrencyCodeSchema, MINOR_UNITS } from '../money/currency';
import {
  compare,
  decimalPlaces,
  isNegative,
  isPositive,
  MoneySchema,
  type Percent,
  PercentSchema,
  RatioSchema,
  sum,
} from '../money/decimal';
import { slots } from '../plan/slots';
import { CoinSchema } from './coin';
import { HoldingRuleSchema } from './holding-rule';
import { CoinIdSchema, CountryCodeSchema, EntityIdSchema } from './ids';

const NoteSchema = z.string().check(z.maxLength(NOTE_MAX_LENGTH));

export const SellWindowSchema = z.strictObject({
  opens: CalendarDateSchema,
  closes: CalendarDateSchema,
  exitBy: CalendarDateSchema,
  /** Set when the user accepted a window that opens before the last purchase passes the holding rule. */
  acceptedEarlyOpen: z.exactOptional(z.literal(true)),
});
export type SellWindow = z.infer<typeof SellWindowSchema>;

export const PauseSchema = z.strictObject({
  id: EntityIdSchema,
  from: CalendarDateSchema,
  /** null = open-ended. */
  until: z.nullable(CalendarDateSchema),
  note: NoteSchema,
});
export type Pause = z.infer<typeof PauseSchema>;

export const SkipSchema = z.strictObject({
  id: EntityIdSchema,
  slot: MonthKeySchema,
  note: NoteSchema,
  createdAt: InstantSchema,
});
export type Skip = z.infer<typeof SkipSchema>;

export const ReferencesSchema = z.strictObject({
  peakFrom: z.exactOptional(CalendarDateSchema),
  peakTo: z.exactOptional(CalendarDateSchema),
  halving: z.exactOptional(CalendarDateSchema),
});
export type References = z.infer<typeof ReferencesSchema>;

/** Multiples of the total invested, the user's own assumptions; display only (ADR-0011). */
export const ExpectationsSchema = z.strictObject({
  bear: z.exactOptional(RatioSchema),
  base: z.exactOptional(RatioSchema),
  bull: z.exactOptional(RatioSchema),
});
export type Expectations = z.infer<typeof ExpectationsSchema>;

export const SellChecksSchema = z.strictObject({ part1: z.boolean(), part2: z.boolean(), part3: z.boolean() });
export type SellChecks = z.infer<typeof SellChecksSchema>;

export const SplitSchema = z.record(CoinIdSchema, PercentSchema);
export type Split = z.infer<typeof SplitSchema>;

/** The plan's payload version (docs/DOMAIN.md §2); a v2 plan is read through `upgradePlan`. */
export const PLAN_SCHEMA_VERSION = 3;

const PlanFieldsSchema = z.strictObject({
  id: EntityIdSchema,
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
  /** Confirmed by the user, never taken from the IP address (ADR-0014). */
  country: CountryCodeSchema,
  /** The country profile version the user last saw; a newer one shows the dated notice (docs/DOMAIN.md §3.12). */
  countryRuleVersion: z.int().check(z.minimum(0)),
  payCurrency: CurrencyCodeSchema,
  displayCurrency: CurrencyCodeSchema,
  coins: z.array(CoinSchema).check(z.minLength(1), z.maxLength(20)),
  split: SplitSchema,
  monthlyAmount: MoneySchema,
  startingAmount: MoneySchema,
  firstBuy: CalendarDateSchema,
  buyDay: z.int().check(z.minimum(1), z.maximum(28)),
  lastBuy: CalendarDateSchema,
  holdingRule: HoldingRuleSchema,
  sellWindow: z.nullable(SellWindowSchema),
  references: ReferencesSchema,
  expectations: ExpectationsSchema,
  pauses: z.array(PauseSchema),
  skips: z.array(SkipSchema),
  endedBuyingOn: z.nullable(CalendarDateSchema),
  sellChecks: SellChecksSchema,
  /** The user's one sentence, shown on the Red day page. */
  why: z.string().check(z.maxLength(280)),
  templateId: z.nullable(z.string().check(z.regex(/^[a-z0-9-]{1,40}$/))),
  /** When the plan-creation disclosure was acknowledged (docs/LEGAL.md §4); null when nothing was recorded. */
  riskAcknowledgedAt: z.nullable(InstantSchema),
  /** The disclosure wording version acknowledged; 0 with a null instant: nothing recorded. Onboarding writes both. */
  riskWordingVersion: z.int().check(z.minimum(0)),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

export const PLAN_ISSUE_CODES = [
  'coins-not-unique',
  'split-unknown-coin',
  'split-negative',
  'split-precision',
  'split-sum',
  'amount-negative',
  'amount-precision',
  'no-amount',
  'last-buy-before-first-buy',
  'plan-too-long',
  'sell-window-order',
  'sell-window-before-eligibility',
  'peak-order',
  'expectation-negative',
  'pause-order',
  'pauses-overlap',
  'skips-not-unique',
] as const;
export type PlanIssueCode = (typeof PLAN_ISSUE_CODES)[number];
export type PlanIssue = { readonly code: PlanIssueCode; readonly path: readonly (string | number)[] };

type PlanFields = z.infer<typeof PlanFieldsSchema>;

const PERCENT_DECIMALS = 4;

function splitIssues(plan: PlanFields): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const ids = new Set(plan.coins.map((coin) => coin.id));
  if (ids.size !== plan.coins.length) issues.push({ code: 'coins-not-unique', path: ['coins'] });
  const shares = Object.entries(plan.split) as [string, Percent][];
  for (const [coin, share] of shares) {
    if (!ids.has(coin as never)) issues.push({ code: 'split-unknown-coin', path: ['split', coin] });
    if (isNegative(share)) issues.push({ code: 'split-negative', path: ['split', coin] });
    if (decimalPlaces(share) > PERCENT_DECIMALS) issues.push({ code: 'split-precision', path: ['split', coin] });
  }
  // Exactly 100, not "within 0.01" as the prototype allowed (docs/DOMAIN.md §2.1).
  if (compare(sum(shares.map(([, share]) => share)), '100' as Percent) !== 0) {
    issues.push({ code: 'split-sum', path: ['split'] });
  }
  return issues;
}

function amountIssues(plan: PlanFields): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const digits = MINOR_UNITS[plan.payCurrency];
  for (const field of ['monthlyAmount', 'startingAmount'] as const) {
    if (isNegative(plan[field])) issues.push({ code: 'amount-negative', path: [field] });
    if (decimalPlaces(plan[field]) > digits) issues.push({ code: 'amount-precision', path: [field] });
  }
  if (!isPositive(plan.monthlyAmount) && !isPositive(plan.startingAmount)) {
    issues.push({ code: 'no-amount', path: ['monthlyAmount'] });
  }
  return issues;
}

function dateIssues(plan: PlanFields): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (plan.lastBuy < plan.firstBuy) issues.push({ code: 'last-buy-before-first-buy', path: ['lastBuy'] });
  else if (plan.lastBuy > addYearsClamped(plan.firstBuy, 20) || slots(plan).length > MAX_SLOTS) {
    issues.push({ code: 'plan-too-long', path: ['lastBuy'] });
  }
  const window = plan.sellWindow;
  if (window !== null) {
    if (window.closes < window.opens || window.exitBy < window.closes) {
      issues.push({ code: 'sell-window-order', path: ['sellWindow'] });
    }
    // A warning the user can accept, recorded on the window, never a hard error (docs/DOMAIN.md §2.1).
    const eligible = eligibleFrom(plan.lastBuy, plan.holdingRule);
    if (plan.holdingRule.kind !== 'none' && window.opens < eligible && window.acceptedEarlyOpen !== true) {
      issues.push({ code: 'sell-window-before-eligibility', path: ['sellWindow', 'opens'] });
    }
  }
  const { peakFrom, peakTo } = plan.references;
  if (peakFrom !== undefined && peakTo !== undefined && peakTo < peakFrom) {
    issues.push({ code: 'peak-order', path: ['references', 'peakTo'] });
  }
  for (const key of ['bear', 'base', 'bull'] as const) {
    const multiple = plan.expectations[key];
    if (multiple !== undefined && isNegative(multiple)) {
      issues.push({ code: 'expectation-negative', path: ['expectations', key] });
    }
  }
  return issues;
}

function scheduleIssues(plan: PlanFields): PlanIssue[] {
  const issues: PlanIssue[] = [];
  plan.pauses.forEach((pause, index) => {
    if (pause.until !== null && pause.until < pause.from) issues.push({ code: 'pause-order', path: ['pauses', index] });
  });
  // In start order, each pause must begin after the previous one ended; an open-ended pause is last.
  let previous: Pause | null = null;
  for (const current of [...plan.pauses].sort((a, b) => compareDates(a.from, b.from))) {
    if (previous !== null && (previous.until === null || current.from <= previous.until)) {
      issues.push({ code: 'pauses-overlap', path: ['pauses'] });
      break;
    }
    previous = current;
  }
  if (new Set(plan.skips.map((skip) => skip.slot)).size !== plan.skips.length) {
    issues.push({ code: 'skips-not-unique', path: ['skips'] });
  }
  return issues;
}

/** Every invariant of docs/DOMAIN.md §2.1 that the plan breaks, in a stable order. */
export function planIssues(plan: PlanFields): PlanIssue[] {
  return [...splitIssues(plan), ...amountIssues(plan), ...dateIssues(plan), ...scheduleIssues(plan)];
}

export const PlanSchema = PlanFieldsSchema.check(
  z.superRefine((plan, ctx) => {
    for (const issue of planIssues(plan)) {
      ctx.addIssue({ code: 'custom', message: issue.code, path: [...issue.path], input: plan });
    }
  }),
);
export type Plan = z.infer<typeof PlanSchema>;
