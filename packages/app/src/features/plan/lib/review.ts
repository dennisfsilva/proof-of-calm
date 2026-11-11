import { GENERIC_COUNTRY } from '@proofofcalm/content';
import {
  type CalendarDate,
  type CountryRules,
  nextReviewOn,
  type Plan,
  type ReviewDates,
  type RuleChangeNotice,
  ruleChangeNotice,
  underReview,
} from '@proofofcalm/core';
import { type ReviewSince, reviewSince } from '../../../lib/services';

// The review page's parts (docs/DOMAIN.md §3.12, docs/CONTENT-STYLE.md §3 "Annual review page (M2)"): the day
// the review counts from, the next review day, the person's note, and the rules held. The rule-change notice is
// asked only of the plan's own country's rules (`ruleChangeNotice` throws on another's): the general profile
// standing in for a country with no profile of its own brings none, and it is never under review.

export type ReviewSummary = {
  readonly since: ReviewSince;
  readonly nextOn: CalendarDate;
  readonly note: string | null;
  /** Null while the plan's country's rules load. */
  readonly rules: {
    readonly country: string;
    readonly checkedOn: CalendarDate;
    readonly generic: boolean;
    readonly underReview: boolean;
    readonly ruleChange: RuleChangeNotice | null;
  } | null;
};

export function reviewSummary(
  plan: Plan,
  rules: CountryRules | null,
  dates: ReviewDates,
  today: CalendarDate,
): ReviewSummary {
  const note = plan.why.trim();
  const generic = rules?.code === GENERIC_COUNTRY;
  return {
    since: reviewSince(dates),
    nextOn: nextReviewOn(dates),
    note: note === '' ? null : note,
    rules:
      rules === null
        ? null
        : {
            country: rules.name,
            checkedOn: rules.status.lastReviewed,
            generic,
            underReview: !generic && underReview(rules.status, today),
            ruleChange: rules.code === plan.country ? ruleChangeNotice(plan, rules) : null,
          },
  };
}
