// The one banner on Today (docs/DOMAIN.md §3.11; ADR-0013 for the order, ADR-0004 for backups): at most
// one at a time, by priority, never stacked. Dismissals live in Prefs.dismissedBanners as banner keys,
// but for the rule change's: the plan's countryRuleVersion records that one.
import { BACKUP_SNOOZE_DAYS, RED_DAY } from '../constants';
import { type CalendarDate, compareInstants, daysBetween, parseCalendarDate } from '../dates/calendar';
import type { RedDayEpisode } from '../market/red-day';
import { liveEntries } from '../plan/statuses';
import type { Entry } from '../schema/entry';
import type { Prefs } from '../schema/prefs';

export const BANNERS = ['red-day', 'rule-change', 'backup-needed'] as const;
export type BannerKind = (typeof BANNERS)[number];

/** A banner's key, as Prefs.dismissedBanners keeps it. */
export type BannerKey = string;

export type Banner = {
  readonly kind: BannerKind;
  /** Kept in Prefs.dismissedBanners once shown (red day) or dismissed (backup); a rule change's is never stored. */
  readonly key: BannerKey;
};

export type BannerState = {
  readonly today: CalendarDate;
  /** The Red day episode under way (redDayEpisode), or null. */
  readonly redDay: RedDayEpisode | null;
  /** The country profile's version the plan has not acknowledged yet (ruleChangeNotice), or null. */
  readonly ruleChange: { readonly version: number } | null;
  readonly backupNeeded: boolean;
  /** Prefs.dismissedBanners. */
  readonly dismissed: readonly string[];
};

const BACKUP = 'backup-needed:';
const RED = 'red-day:';

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
 * The banner to show, or null. Stored keys: `red-day:<episode start>` (once per episode) and
 * `backup-needed:<day of dismissal>`. The rule-change banner has no stored key: the shell records its
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
  if (state.backupNeeded && !snoozed(state.dismissed, state.today)) {
    candidates.push({ kind: 'backup-needed', key: `${BACKUP}${state.today}` });
  }
  return candidates.find((banner) => !state.dismissed.includes(banner.key)) ?? null;
}

/**
 * Prefs.dismissedBanners with `key` added once: the red-day keys more than RED_DAY.keptDays before `today`
 * go, since no episode under way can reach back that far; every other key stays.
 */
export function withBannerKey(dismissed: readonly string[], key: BannerKey, today: CalendarDate): BannerKey[] {
  const kept = dismissed.filter((stored) => {
    const on = keyDay(stored, RED);
    return stored !== key && (on === null || daysBetween(on, today) <= RED_DAY.keptDays);
  });
  return [...kept, key];
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
