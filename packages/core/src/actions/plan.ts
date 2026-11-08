// Skipping a month, pausing, resuming, ending the buying and its undo, and changing the country or the pay currency
// (docs/DOMAIN.md §6). Each returns the next plan, stamped `now` or just after the plan it gets, which is
// the one stored (`stampAfter`, docs/DOMAIN.md §3.15); none touches the entries.
import { NOTE_MAX_LENGTH } from '../constants';
import { addDays, type CalendarDate, compareDates, type Instant, type MonthKey, stampAfter } from '../dates/calendar';
import { sameHoldingRule } from '../holding/eligible-from';
import type { CurrencyCode } from '../money/currency';
import { slots } from '../plan/slots';
import { liveEntries, pauseOn } from '../plan/statuses';
import { err, ok, type Result } from '../result';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { HoldingRule } from '../schema/holding-rule';
import type { CountryCode, EntityId } from '../schema/ids';
import { type Pause, type Plan, type PlanIssueCode, planIssues } from '../schema/plan';
import type { ActionError } from './errors';

export type SkipInput = {
  readonly slot: MonthKey;
  readonly note: string;
  readonly id: EntityId;
  readonly now: Instant;
};

/** Skip an open month with an optional note; a late month stops being late (§3.2: skipped wins). */
export function skipMonth(plan: Plan, entries: readonly Entry[], input: SkipInput): Result<Plan, ActionError> {
  const { slot } = input;
  if (!slots(plan).some((candidate) => candidate.key === slot)) return err({ code: 'unknown-slot', slot });
  if (liveEntries(entries).some((entry) => entry.kind === 'dca' && entry.slot === slot)) {
    return err({ code: 'slot-done', slot });
  }
  if (plan.skips.some((skip) => skip.slot === slot)) return err({ code: 'slot-skipped', slot });
  if (input.note.length > NOTE_MAX_LENGTH) return err({ code: 'note-too-long', max: NOTE_MAX_LENGTH });
  const skip = { id: input.id, slot, note: input.note, createdAt: input.now };
  return ok({ ...plan, skips: [...plan.skips, skip], updatedAt: stampAfter(input.now, plan.updatedAt) });
}

/** Undo a skip within the toast window: the month is open again; an id the plan does not have changes nothing. */
export function unskipMonth(plan: Plan, skipId: EntityId, now: Instant): Plan {
  const skips = plan.skips.filter((skip) => skip.id !== skipId);
  return skips.length === plan.skips.length ? plan : { ...plan, skips, updatedAt: stampAfter(now, plan.updatedAt) };
}

export type PauseInput = {
  readonly from: CalendarDate;
  /** null = until resumed. */
  readonly until: CalendarDate | null;
  readonly note: string;
  readonly id: EntityId;
  readonly now: Instant;
};

const overlap = (a: Pick<Pause, 'from' | 'until'>, b: Pick<Pause, 'from' | 'until'>) =>
  (b.until === null || a.from <= b.until) && (a.until === null || b.from <= a.until);

/**
 * Months inside a pause ask for nothing; months already bought stay bought. An ended plan takes no pause
 * (`buying-over`), as it takes no resume: the pause would be shown nowhere and nothing could end it.
 */
export function pausePlan(plan: Plan, input: PauseInput): Result<Plan, ActionError> {
  if (plan.endedBuyingOn !== null) return err({ code: 'buying-over' });
  if (input.until !== null && input.until < input.from) return err({ code: 'pause-order' });
  if (plan.pauses.some((pause) => overlap(pause, input))) return err({ code: 'pauses-overlap' });
  if (input.note.length > NOTE_MAX_LENGTH) return err({ code: 'note-too-long', max: NOTE_MAX_LENGTH });
  const pause: Pause = { id: input.id, from: input.from, until: input.until, note: input.note };
  const pauses = [...plan.pauses, pause].sort((a, b) => compareDates(a.from, b.from));
  return ok({ ...plan, pauses, updatedAt: stampAfter(input.now, plan.updatedAt) });
}

/**
 * The pause in effect today, else an open-ended one still to come, ends yesterday, so today's buy day
 * keeps its date; a pause that has covered no day before today is removed. An ended plan has no pause
 * left to end (`buying-over`), also on the end day under the pause it ended in.
 */
export function resumePlan(plan: Plan, today: CalendarDate, now: Instant): Result<Plan, ActionError> {
  if (plan.endedBuyingOn !== null) return err({ code: 'buying-over' });
  const current = pauseOn(plan, today) ?? plan.pauses.find((pause) => pause.until === null) ?? null;
  if (current === null) return err({ code: 'not-paused' });
  const yesterday = addDays(today, -1);
  const pauses =
    current.from > yesterday
      ? plan.pauses.filter((pause) => pause.id !== current.id)
      : plan.pauses.map((pause) => (pause.id === current.id ? { ...pause, until: yesterday } : pause));
  return ok({ ...plan, pauses, updatedAt: stampAfter(now, plan.updatedAt) });
}

/** Today becomes the last buy day (a buy day today stays open); the sell window is kept. */
export function endBuying(plan: Plan, today: CalendarDate, now: Instant): Result<Plan, ActionError> {
  if (plan.endedBuyingOn !== null || today > plan.lastBuy) return err({ code: 'buying-over' });
  if (today < plan.firstBuy) return err({ code: 'before-first-buy' });
  return ok({ ...plan, lastBuy: today, endedBuyingOn: today, updatedAt: stampAfter(now, plan.updatedAt) });
}

/** What an end of buying changed, for its undo: the last buy day it replaced and the day it ended on. */
export type EndedBuying = { readonly lastBuy: CalendarDate; readonly endedOn: CalendarDate };

/**
 * Undo an end of buying within the toast window: the last buy day it replaced comes back and the end is
 * cleared. Refused (`plan-changed`) once the plan is no longer the one it ended, by another tab's end, undo
 * or edit of the last buy, or when the plan it restores breaks an invariant (a sell window moved since).
 */
export function undoEndBuying(plan: Plan, before: EndedBuying, now: Instant): Result<Plan, ActionError> {
  if (plan.endedBuyingOn !== before.endedOn || plan.lastBuy !== before.endedOn) return err({ code: 'plan-changed' });
  const restored: Plan = { ...plan, lastBuy: before.lastBuy, endedBuyingOn: null };
  if (planIssues(restored).length > 0) return err({ code: 'plan-changed' });
  return ok({ ...restored, updatedAt: stampAfter(now, plan.updatedAt) });
}

export type PlanChange =
  | { readonly field: 'country'; readonly from: CountryCode; readonly to: CountryCode }
  | { readonly field: 'payCurrency' | 'displayCurrency'; readonly from: CurrencyCode; readonly to: CurrencyCode }
  | { readonly field: 'holdingRule'; readonly from: HoldingRule; readonly to: HoldingRule };

export type CountryChange = {
  /** The plan to store once the user confirms. */
  readonly plan: Plan;
  /** What the confirmation lists; the holding rule is confirmed explicitly. */
  readonly changes: readonly PlanChange[];
  /** Invariants the new rule breaks, such as a sell window that now opens early (a warning to accept). */
  readonly issues: readonly PlanIssueCode[];
};

/**
 * The plan re-derived for another country: its currency for amounts from now on (logged amounts stay
 * as typed), its holding rule and its rule version. Formats follow the profile in the shell. An early
 * sell window's acceptance holds only for the rule it was given under, so a new rule drops it.
 */
export function changeCountry(plan: Plan, rules: CountryRules, now: Instant): CountryChange {
  const window = plan.sellWindow;
  const ruleChanged = !sameHoldingRule(plan.holdingRule, rules.holdingRule);
  const next: Plan = {
    ...plan,
    country: rules.code,
    payCurrency: rules.currency,
    displayCurrency: rules.currency,
    holdingRule: rules.holdingRule,
    countryRuleVersion: rules.status.version,
    sellWindow:
      ruleChanged && window?.acceptedEarlyOpen === true
        ? { opens: window.opens, closes: window.closes, exitBy: window.exitBy }
        : window,
    updatedAt: stampAfter(now, plan.updatedAt),
  };
  const changes: PlanChange[] = [];
  if (plan.country !== next.country) changes.push({ field: 'country', from: plan.country, to: next.country });
  for (const field of ['payCurrency', 'displayCurrency'] as const) {
    if (plan[field] !== next[field]) changes.push({ field, from: plan[field], to: next[field] });
  }
  if (ruleChanged) {
    changes.push({ field: 'holdingRule', from: plan.holdingRule, to: next.holdingRule });
  }
  return { plan: next, changes, issues: planIssues(next).map((issue) => issue.code) };
}

/** Amounts from now on are in `currency`; logged amounts stay as typed, and the UI says so. */
export function changePayCurrency(plan: Plan, currency: CurrencyCode, now: Instant): Plan {
  return plan.payCurrency === currency
    ? plan
    : { ...plan, payCurrency: currency, updatedAt: stampAfter(now, plan.updatedAt) };
}
