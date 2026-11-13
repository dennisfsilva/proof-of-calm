// The core's constants (docs/DOMAIN.md §9). One module, so a change to a limit is one diff with its tests.
import type { Percent } from './money/decimal';

/** 20 years of monthly slots; enforced by the plan invariant, never by a silent cut-off. */
export const MAX_SLOTS = 240;

/** A skip's or a pause's note holds at most this many characters (the plan schema; the forms' maxLength). */
export const NOTE_MAX_LENGTH = 200;

/** An entry's note holds at most this many characters (the entry schema, `saveTransaction`, the form's maxLength). */
export const ENTRY_NOTE_MAX_LENGTH = 500;

/** An entry's venue label holds at most this many characters (the entry schema, `saveTransaction`, the form's maxLength). */
export const VENUE_MAX_LENGTH = 40;

/**
 * A plan holds at most this many live entries: the backup schema's cap, which `applyImport` keeps as well, so that
 * the next export of whatever an import leaves reads back (docs/DOMAIN.md §3.13).
 */
export const MAX_ENTRIES = 10_000;

/**
 * Settings reads no import file larger than this many bytes (50 MB). A full plan's export weighs about 4 MB, 9.5 MB
 * with every note at its longest, and 36.8 MB at the most, every note's character escaped to six bytes.
 */
export const IMPORT_MAX_BYTES = 50_000_000;

/**
 * "A purchase date's month is the plan's month with the anchor nearest it, the earlier month on a tie: a month's due
 * date reaches 15 days either side (`IMPORT_MATCH_DAYS`), and each one-tap monthly estimate of the coin for that month,
 * live or tombstoned, reaches from 3 days before its date (`IMPORT_TYPED_DAYS`) to the day after" (docs/DOMAIN.md
 * §3.13, the exchange import).
 */
export const IMPORT_MATCH_DAYS = 15;

/**
 * A hand-recorded entry claims an imported date of its coin and role within this many days of its own, and a one-tap
 * monthly estimate reaches this many days before its date (docs/DOMAIN.md §3.13).
 */
export const IMPORT_TYPED_DAYS = 3;

/** The Log shows this many transactions before "Show all". */
export const LOG_PAGE = 12;

/** How long a deleted entry can be restored from the toast. */
export const UNDO_WINDOW_MS = 8000;

/** Soft-deleted entries are purged this many days after deletion (the sync tombstone, ADR-0021). */
export const TOMBSTONE_TTL_DAYS = 90;

/**
 * Red day thresholds in percent (docs/DOMAIN.md §3.11). True on about 15 % of bitcoin's days in the
 * five years to 2026-10-16 (docs/EDUCATION.md §9 `q.red-day-frequency`). A recorded banner key covers an
 * episode that starts up to `coverDays` after it; a red-day key older than `keptDays` is dropped.
 */
export const RED_DAY = {
  sevenDay: '-10' as Percent,
  fromHigh90: '-30' as Percent,
  episodeClearDays: 7,
  coverDays: 7,
  keptDays: 365,
} as const;

/** A dismissed "backup needed" banner stays away this many days (ADR-0004). */
export const BACKUP_SNOOZE_DAYS = 90;

/**
 * The live price fills the entry form at this many significant figures, or at the currency's minor
 * unit when that keeps more (docs/DOMAIN.md §6), so a coin priced under a cent never fills as 0.
 */
export const PRICE_FIGURES = 4;

export const CHART_RANGES = ['7d', '30d', '90d', '1y', 'all'] as const;

/**
 * Price freshness in seconds. The server fetches the whole coin × currency matrix once per
 * 10 minutes (ADR-0006, ADR-0036); clients poll every minute while visible.
 */
export const PRICE_TTL = {
  clientSeconds: 60,
  serverSeconds: 600,
} as const;

/**
 * Under the `pooled` lot rule the tax-year listing adds the purchases this many days after the year's end: the UK
 * matches tokens bought within 30 days after a disposal to it (TCGA 1992 s. 106A; docs/JURISDICTIONS.md §7.4).
 */
export const POOLED_MATCH_DAYS = 30;

/** The annual review asks again this many months after the plan was created or last reviewed. */
export const REVIEW_INTERVAL_MONTHS = 12;

/** `Later` on the annual review keeps it away this many days; it never counts as a review (docs/DOMAIN.md §3.11). */
export const REVIEW_SNOOZE_DAYS = 30;

/** A country's card is under review once this many months past its `nextReviewDue` (docs/JURISDICTIONS.md §1). */
export const UNDER_REVIEW_MONTHS = 12;
