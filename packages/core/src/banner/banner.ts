// The one banner on Today (docs/DOMAIN.md §3.11; ADR-0013 for the order, ADR-0004 for backups): at most
// one at a time, by priority, never stacked. Dismissals live in Prefs.dismissedBanners as banner keys,
// but for the rule change's: the plan's countryRuleVersion records that one.
import { BACKUP_SNOOZE_DAYS, RED_DAY, REVIEW_SNOOZE_DAYS } from '../constants';
import { type CalendarDate, compareInstants, daysBetween, parseCalendarDate } from '../dates/calendar';
import type { RedDayEpisode } from '../market/red-day';
import { liveEntries } from '../plan/statuses';
import type { Entry } from '../schema/entry';
import type { Prefs } from '../schema/prefs';

export const BANNERS = ['red-day', 'rule-change', 'annual-review', 'backup-needed'] as const;
export type BannerKind = (typeof BANNERS)[number];

/** A banner's key, as Prefs.dismissedBanners keeps it. */
export type BannerKey = string;

export type Banner = {
  readonly kind: BannerKind;
  /** Kept in Prefs.dismissedBanners once shown (red day) or dismissed (backup, review); a rule change's never is. */
  readonly key: BannerKey;
};

export type BannerState = {
  readonly today: CalendarDate;
  /** The Red day episode under way (redDayEpisode), or null. */
  readonly redDay: RedDayEpisode | null;
  /** The country profile's version the plan has not acknowledged yet (ruleChangeNotice), or null. */
  readonly ruleChange: { readonly version: number } | null;
  /** The annual review is asked (reviewAsked): due, and neither a red-day episode under way nor an ended, empty plan. */
  readonly annualReview: boolean;
  readonly backupNeeded: boolean;
  /** Prefs.dismissedBanners. */
  readonly dismissed: readonly string[];
};

const BACKUP = 'backup-needed:';
const RED = 'red-day:';
const REVIEW = 'annual-review:';

/** The day a key of this kind names, or null for another kind or a key that is not a date. */
function keyDay(key: BannerKey, prefix: string): CalendarDate | null {
  return key.startsWith(prefix) ? parseCalendarDate(key.slice(prefix.length)) : null;
}

/** A "backup needed" banner dismissed fewer than BACKUP_SNOOZE_DAYS days ago stays away. */
function snoozed(dismissed: readonly string[], today: CalendarDate): boolean {
  return dismissed.some((key) => {
    const on = keyDay(key, BACKUP);
    return on !== null && daysBetween(on, today) < BACKUP_SNOOZE_DAYS;
  });
}

/**
 * `Later` on the annual review, recorded fewer than REVIEW_SNOOZE_DAYS days ago, keeps it away. A key dated after today
 * snoozes nothing: only a clock set back writes one, and it would otherwise hide the review until 30 days after it.
 */
function reviewSnoozed(dismissed: readonly string[], today: CalendarDate): boolean {
  return dismissed.some((key) => {
    const on = keyDay(key, REVIEW);
    return on !== null && daysBetween(on, today) >= 0 && daysBetween(on, today) < REVIEW_SNOOZE_DAYS;
  });
}

/** The one stored review key that can snooze: the latest dated on or before today, or null. */
function lastReviewKey(dismissed: readonly string[], today: CalendarDate): BannerKey | null {
  const days = dismissed.flatMap((key) => {
    const on = keyDay(key, REVIEW);
    return on !== null && on <= today ? [on] : [];
  });
  return days.length === 0 ? null : `${REVIEW}${days.reduce((last, on) => (on > last ? on : last))}`;
}

/**
 * A red-day key recorded on a day from RED_DAY.coverDays before the episode's start up to today covers it: a
 * copy of the closes that moves the start by a few days does not show the banner twice for one fall, and an
 * episode after seven clear days starts more than seven days after the last one's key.
 */
function covered(dismissed: readonly string[], episode: RedDayEpisode, today: CalendarDate): boolean {
  return dismissed.some((key) => {
    const on = keyDay(key, RED);
    return on !== null && daysBetween(on, episode.start) <= RED_DAY.coverDays && daysBetween(on, today) >= 0;
  });
}

/**
 * The banner to show, or null. Stored keys: `red-day:<episode start>` (once per episode),
 * `annual-review:<day of Later>` and `backup-needed:<day of dismissal>`. The rule-change banner has no stored key: the shell records its
 * version on the plan alone, per plan, so other devices stop showing it and a change of country resets it.
 */
export function bannerFor(state: BannerState): Banner | null {
  const candidates: Banner[] = [];
  if (state.redDay !== null && !covered(state.dismissed, state.redDay, state.today)) {
    candidates.push({ kind: 'red-day', key: `${RED}${state.redDay.start}` });
  }
  if (state.ruleChange !== null) {
    candidates.push({ kind: 'rule-change', key: `rule-change:${state.ruleChange.version}` });
  }
  if (state.annualReview && !reviewSnoozed(state.dismissed, state.today)) {
    candidates.push({ kind: 'annual-review', key: `${REVIEW}${state.today}` });
  }
  if (state.backupNeeded && !snoozed(state.dismissed, state.today)) {
    candidates.push({ kind: 'backup-needed', key: `${BACKUP}${state.today}` });
  }
  return candidates.find((banner) => !state.dismissed.includes(banner.key)) ?? null;
}

/**
 * Prefs.dismissedBanners with `key` added once: the red-day keys more than RED_DAY.keptDays before `today`
 * go, since no episode under way can reach back that far; one review key at most stays, `key` when it is one, else
 * the one that can snooze (lastReviewKey); every other key stays.
 */
export function withBannerKey(dismissed: readonly string[], key: BannerKey, today: CalendarDate): BannerKey[] {
  const review = key.startsWith(REVIEW) ? null : lastReviewKey(dismissed, today);
  const kept = dismissed.filter((stored) => {
    const on = keyDay(stored, RED);
    return stored !== key && !stored.startsWith(REVIEW) && (on === null || daysBetween(on, today) <= RED_DAY.keptDays);
  });
  return [...kept, ...(review === null ? [] : [review]), key];
}

/**
 * "Your data lives only on this device": entries exist, no account keeps a copy, and nothing was
 * exported after the last change (or ever).
 */
export function backupNeeded(
  entries: readonly Entry[],
  prefs: Pick<Prefs, 'lastBackupAt' | 'changedAt'>,
  account: boolean,
): boolean {
  if (account || liveEntries(entries).length === 0) return false;
  if (prefs.lastBackupAt === null) return true;
  return prefs.changedAt !== null && compareInstants(prefs.changedAt, prefs.lastBackupAt) > 0;
}
