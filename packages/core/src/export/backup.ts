// The JSON backup (docs/DOMAIN.md §3.13): export, read back and import as "Replace everything" or "Add
// missing entries only", as the prototype. Imported rows are stamped `updatedAt = now` (ADR-0019), or 1 ms
// after the row stored here when the clock is behind it, so that sync keeps them (ADR-0021); what a
// replace removes stays as a tombstone rather than vanishing. Add missing takes nothing from a file whose amounts are
// in another currency than this plan's, since an amount is never converted (§2.1).
import { MAX_ENTRIES } from '../constants';
import { type CalendarDate, dateParts, type Instant, stampAfter } from '../dates/calendar';
import { isRecord } from '../json';
import type { CurrencyCode } from '../money/currency';
import { liveEntries } from '../plan/statuses';
import { err, ok, type Result } from '../result';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, type BackupFile, BackupFileSchema } from '../schema/backup';
import { ENTRY_SCHEMA_VERSION, type Entry, invalidEntryIds, writtenEntryVersion } from '../schema/entry';
import type { CountryCode, EntityId } from '../schema/ids';
import { PLAN_SCHEMA_VERSION, type Plan } from '../schema/plan';
import { upgradePlan, writtenPlan } from '../schema/upgrade';
import type { TaxYearSpan } from './tax-year';

/** A file of the build before the acknowledgement, and of this one while nothing is recorded: its plan is read as v3 with none. */
const PLAN_V2_SCHEMA_VERSION = 2;
/** A file whose entries hold no `held` entry: the previous build's, and this one's while none is recorded. */
const ENTRIES_V2_SCHEMA_VERSION = 3;
/** A file whose entries hold a `held` entry but no move: the previous build's, and this one's while no move is recorded. */
const ENTRIES_V3_SCHEMA_VERSION = 4;
const EXTENSION = { backup: 'json', log: 'csv' } as const;

/** `<slug>-backup-YYYY-MM-DD.json`, `<slug>-log-YYYY-MM-DD.csv`; the shell passes the product's slug. */
export function exportFileName(slug: string, kind: keyof typeof EXTENSION, today: CalendarDate): string {
  return `${slug}-${kind}-${today}.${EXTENSION[kind]}`;
}

/** `<slug>-tax-year-2026-PT-YYYY-MM-DD.csv`; a year across two calendar years is `2026-27`. */
export function taxYearFileName(slug: string, span: TaxYearSpan, code: CountryCode, today: CalendarDate): string {
  const start = dateParts(span.from).year;
  const label = start === span.endingIn ? `${start}` : `${start}-${String(span.endingIn % 100).padStart(2, '0')}`;
  return `${slug}-tax-year-${label}-${code}-${today}.csv`;
}

/** Soft-deleted entries are never exported. The file as read back; `writtenBackup` gives the file as written. */
export function exportBackup(plan: Plan, entries: readonly Entry[], exportedAt: Instant): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    plan,
    entries: liveEntries(entries),
  };
}

/**
 * The file as written, at the lowest version that holds it: 5 once an entry is a move, 4 once one is `held`
 * (`writtenEntryVersion`), else 3 once an acknowledgement is recorded, else 2 with the v2 plan, so the previous build
 * imports every file it can read.
 */
export function writtenBackup(file: BackupFile) {
  const versions = file.entries.map(writtenEntryVersion);
  if (versions.includes(ENTRY_SCHEMA_VERSION)) return file;
  if (versions.includes(3)) return { ...file, schemaVersion: ENTRIES_V3_SCHEMA_VERSION };
  const plan = writtenPlan(file.plan);
  return plan.schemaVersion === PLAN_SCHEMA_VERSION
    ? { ...file, schemaVersion: ENTRIES_V2_SCHEMA_VERSION }
    : { ...file, schemaVersion: PLAN_V2_SCHEMA_VERSION, plan: plan.payload };
}

export type BackupError =
  | { readonly code: 'not-recognised' }
  | { readonly code: 'newer-version'; readonly schemaVersion: number }
  | { readonly code: 'invalid-backup'; readonly issues: readonly string[] };

/** A parsed JSON file as a backup: anything without the format marker is not recognised. */
export function readBackup(json: unknown): Result<BackupFile, BackupError> {
  if (!isRecord(json) || json.format !== BACKUP_FORMAT) return err({ code: 'not-recognised' });
  const { schemaVersion } = json;
  if (typeof schemaVersion === 'number' && schemaVersion > BACKUP_SCHEMA_VERSION) {
    return err({ code: 'newer-version', schemaVersion });
  }
  // Versions 2 to 4 hold the same shape as 5 but for the plan's acknowledgement (2), the `held` kind (2 and 3) and
  // the move (2 to 4).
  const file =
    schemaVersion === PLAN_V2_SCHEMA_VERSION
      ? { ...json, schemaVersion: BACKUP_SCHEMA_VERSION, plan: upgradePlan(json.plan) }
      : schemaVersion === ENTRIES_V2_SCHEMA_VERSION || schemaVersion === ENTRIES_V3_SCHEMA_VERSION
        ? { ...json, schemaVersion: BACKUP_SCHEMA_VERSION }
        : json;
  const parsed = BackupFileSchema.safeParse(file);
  if (parsed.success) return ok(parsed.data);
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return err({ code: 'invalid-backup', issues });
}

export type ImportMode = 'replace' | 'add-missing';

/**
 * Why an import applied nothing: add-missing from a file whose amounts are in `file`, this plan's in `plan` (never
 * converted); `entries` live entries after it, over the `max` a plan holds, `file` of them the file's live ones; or
 * entries to store that `EntrySchema` refuses, by id, which a later load would set aside.
 */
export type ImportRefusal =
  | { readonly code: 'currency-mismatch'; readonly file: CurrencyCode; readonly plan: CurrencyCode }
  | { readonly code: 'too-many-entries'; readonly entries: number; readonly file: number; readonly max: number }
  | { readonly code: 'invalid-entries'; readonly ids: readonly EntityId[] };

export type ImportResult = {
  readonly plan: Plan;
  /** Every entry to store, replacing the store's list. */
  readonly entries: readonly Entry[];
  readonly added: number;
  /** Live entries of the file that are live here already (add-missing). */
  readonly skipped: number;
  /** Entries of the file deleted on this device (add-missing): the deletion wins, so they stay deleted. */
  readonly deleted: number;
  /** Monthly buys of the file for a month recorded or skipped on this device (add-missing): not added. */
  readonly taken: number;
  /**
   * Set when the import applied nothing: then the entries are this device's, every count is 0 and nothing is to be
   * written; the plan is this device's, or the file's when there is none.
   */
  readonly refused: ImportRefusal | null;
};

/** Nothing applied: this device's plan and entries as they are. */
function refuse(current: Parameters<typeof applyImport>[0], filePlan: Plan, refused: ImportRefusal): ImportResult {
  return {
    plan: current.plan ?? filePlan,
    entries: current.entries,
    added: 0,
    skipped: 0,
    deleted: 0,
    taken: 0,
    refused,
  };
}
/** Every entry to store reads as an entry, or the import is refused rather than set aside on the next load. */
function checked(current: Parameters<typeof applyImport>[0], filePlan: Plan, result: ImportResult): ImportResult {
  const ids = invalidEntryIds(result.entries);
  return ids.length === 0 ? result : refuse(current, filePlan, { code: 'invalid-entries', ids });
}

/** More live entries than a plan holds would leave an export that `readBackup` refuses: the person's only restore file. */
const overCap = (entries: number, file: number): ImportRefusal | null =>
  entries > MAX_ENTRIES ? { code: 'too-many-entries', entries, file, max: MAX_ENTRIES } : null;

export function applyImport(
  current: { readonly plan: Plan | null; readonly entries: readonly Entry[] },
  file: BackupFile,
  mode: ImportMode,
  now: Instant,
): ImportResult {
  // A row written over one stored here is stamped after it (and after its deletedAt), even when this clock is behind.
  const stored = new Map(current.entries.map((entry) => [entry.id, entry]));
  const after = (id: Entry['id']): Instant => {
    const row = stored.get(id);
    return row === undefined ? now : stampAfter(now, row.updatedAt, ...(row.deletedAt === null ? [] : [row.deletedAt]));
  };
  const stamp = (entry: Entry): Entry => ({ ...entry, updatedAt: after(entry.id) });
  const filePlan = { ...file.plan, updatedAt: current.plan === null ? now : stampAfter(now, current.plan.updatedAt) };
  if (mode === 'replace') {
    const live = liveEntries(file.entries).length;
    const tooMany = overCap(live, live);
    if (tooMany !== null) return refuse(current, filePlan, tooMany);
    const incoming = new Set(file.entries.map((entry) => entry.id));
    const removed = current.entries
      .filter((entry) => !incoming.has(entry.id))
      // A tombstone kept is written again too, so that an undo of its delete in another tab refuses; a row
      // tombstoned here is deleted `now`, so a delete another tab wrote over it on a snapshot this one has not
      // read yet is not taken for that delete either.
      .map((entry) => ({ ...entry, deletedAt: entry.deletedAt ?? now, updatedAt: after(entry.id) }));
    return checked(current, filePlan, {
      plan: filePlan,
      entries: [...file.entries.map(stamp), ...removed],
      added: incoming.size,
      skipped: 0,
      deleted: 0,
      taken: 0,
      refused: null,
    });
  }
  if (current.plan !== null && current.plan.payCurrency !== file.plan.payCurrency) {
    const refused = { code: 'currency-mismatch', file: file.plan.payCurrency, plan: current.plan.payCurrency } as const;
    return refuse(current, filePlan, refused);
  }
  // A row brought back here would carry `updatedAt = now` and win over the tombstone in sync. It only
  // adds: the file's own tombstones are ignored, as storing one stamped now would delete it elsewhere.
  const fileLive = liveEntries(file.entries);
  const present = new Set(current.entries.map((entry) => entry.id));
  const tombstoned = new Set(current.entries.filter((entry) => entry.deletedAt !== null).map((entry) => entry.id));
  const missing = fileLive.filter((entry) => !present.has(entry.id));
  const deleted = fileLive.filter((entry) => tombstoned.has(entry.id)).length;
  // A month recorded or skipped here stays as it is: the file's monthly buys for it would record it twice.
  const months = new Set<string | null>([
    ...liveEntries(current.entries)
      .filter((entry) => entry.kind === 'dca')
      .map((entry) => entry.slot),
    ...(current.plan?.skips ?? []).map((skip) => skip.slot),
  ]);
  const added = missing.filter((entry) => entry.kind !== 'dca' || !months.has(entry.slot));
  const tooMany = overCap(liveEntries(current.entries).length + added.length, fileLive.length);
  if (tooMany !== null) return refuse(current, filePlan, tooMany);
  return checked(current, filePlan, {
    plan: current.plan ?? filePlan,
    entries: [...current.entries, ...added.map(stamp)],
    added: added.length,
    skipped: fileLive.length - missing.length - deleted,
    deleted,
    taken: missing.length - added.length,
    refused: null,
  });
}
