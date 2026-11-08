// Reminders, the annual review and rule-change notices (docs/DOMAIN.md §3.12). The core says what is
// due; the shell schedules, words and dismisses it.
import { REVIEW_INTERVAL_MONTHS, UNDER_REVIEW_MONTHS } from '../constants';
import { addMonthsClamped, type CalendarDate, type Instant, maxDate, stampAfter } from '../dates/calendar';
import type { Slot } from '../plan/slots';
import { isOpen, slotStatuses } from '../plan/statuses';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CountryCode } from '../schema/ids';
import type { Plan } from '../schema/plan';

/**
 * The next slot that still asks for a buy (not done, skipped or paused) due today or later; the shell
 * schedules the reminder at 09:00 local time on its due date. Null once the buying is over.
 */
export function nextBuyReminder(plan: Plan, entries: readonly Entry[], today: CalendarDate): Slot | null {
  const next = slotStatuses(plan, entries, today).find((slot) => isOpen(slot.status) && slot.due >= today);
  return next === undefined ? null : { key: next.key, due: next.due };
}

/**
 * The calendar days of the plan's `createdAt` and of the last review (`Prefs.reviewedAt`), named by the
 * shell in the user's timezone: the core never derives a date from an instant (ADR-0018).
 */
export type ReviewDates = { readonly createdOn: CalendarDate; readonly reviewedOn: CalendarDate | null };

/** Twelve months after the later of the creation and the last review, the day clamped to the month. */
export function nextReviewOn({ createdOn, reviewedOn }: ReviewDates): CalendarDate {
  return addMonthsClamped(reviewedOn === null ? createdOn : maxDate(createdOn, reviewedOn), REVIEW_INTERVAL_MONTHS);
}

/** True from twelve months after the plan was created, and twelve months after each review. */
export function reviewDue(dates: ReviewDates, today: CalendarDate): boolean {
  return today >= nextReviewOn(dates);
}

/**
 * True from the day after twelve months past `nextReviewDue`, the day clamped to the month: the card is then
 * under review (docs/JURISDICTIONS.md §1), and from the same day the build refuses the profile.
 */
export function underReview(
  { nextReviewDue }: Pick<CountryRules['status'], 'nextReviewDue'>,
  today: CalendarDate,
): boolean {
  return today > addMonthsClamped(nextReviewDue, UNDER_REVIEW_MONTHS);
}

export type RuleChangeNotice = {
  readonly country: CountryCode;
  readonly version: number;
  readonly changedOn: CalendarDate;
  /** The profile's sentence; null means the generic one ("16 Oct 2026: the rules for Portugal changed. …"). */
  readonly changeNotice: string | null;
};

/**
 * The dated notice while the country profile is newer than the version the plan last saw; the shell
 * shows it once and, on Review or Dismiss, stores `version` as the plan's `countryRuleVersion`
 * (`acknowledgeRuleChange`); a change of country stores the new country's version (`changeCountry`).
 */
export function ruleChangeNotice(
  plan: Pick<Plan, 'country' | 'countryRuleVersion'>,
  rules: CountryRules,
): RuleChangeNotice | null {
  if (rules.code !== plan.country) throw new RangeError(`${rules.code} rules given for a plan in ${plan.country}`);
  const { version, changedOn, changeNotice } = rules.status;
  return version > plan.countryRuleVersion ? { country: rules.code, version, changedOn, changeNotice } : null;
}

/** The plan with `version` seen, never a lower one than it holds, in a write strictly later than the stored plan's. */
export function acknowledgeRuleChange(plan: Plan, version: number, now: Instant): Plan {
  return {
    ...plan,
    countryRuleVersion: Math.max(plan.countryRuleVersion, version),
    updatedAt: stampAfter(now, plan.updatedAt),
  };
}
