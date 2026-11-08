// The one banner on Today (docs/DOMAIN.md §3.11; ADR-0013 for the order, ADR-0004 for backups): at most
// one at a time, by priority, never stacked. Dismissals live in Prefs.dismissedBanners as banner keys,
// but for the rule change's: the plan's countryRuleVersion records that one.
import { BACKUP_SNOOZE_DAYS } from '../constants';
import { type CalendarDate, compareInstants, daysBetween, parseCalendarDate } from '../dates/calendar';
import type { RedDayEpisode } from '../market/red-day';
import { liveEntries } from '../plan/statuses';
import type { Entry } from '../schema/entry';
import type { Prefs } from '../schema/prefs';

export const BANNERS = ['red-day', 'rule-change', 'backup-needed'] as const;
export type BannerKind = (typeof BANNERS)[number];

export type Banner = {
  readonly kind: BannerKind;
  /** Kept in Prefs.dismissedBanners when the user dismisses the banner; a rule change's is never stored. */
  readonly key: string;
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

/** A "backup needed" banner dismissed fewer than BACKUP_SNOOZE_DAYS days ago stays away. */
function snoozed(dismissed: readonly string[], today: CalendarDate): boolean {
  return dismissed.some((key) => {
    const on = key.startsWith(BACKUP) ? parseCalendarDate(key.slice(BACKUP.length)) : null;
    return on !== null && daysBetween(on, today) < BACKUP_SNOOZE_DAYS;
  });
}

/**
 * The banner to show, or null. Stored keys: `red-day:<episode start>` (once per episode) and
 * `backup-needed:<day of dismissal>`. The rule-change banner has no stored key: the shell records its
 * version on the plan alone, per plan, so other devices stop showing it and a change of country resets it.
 */
export function bannerFor(state: BannerState): Banner | null {
  const candidates: Banner[] = [];
  if (state.redDay !== null) candidates.push({ kind: 'red-day', key: `red-day:${state.redDay.start}` });
  if (state.ruleChange !== null) {
    candidates.push({ kind: 'rule-change', key: `rule-change:${state.ruleChange.version}` });
  }
  if (state.backupNeeded && !snoozed(state.dismissed, state.today)) {
    candidates.push({ kind: 'backup-needed', key: `${BACKUP}${state.today}` });
  }
  return candidates.find((banner) => !state.dismissed.includes(banner.key)) ?? null;
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
