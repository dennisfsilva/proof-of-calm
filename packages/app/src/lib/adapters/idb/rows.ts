// The rows of ADR-0019, shaped like the sync rows of ADR-0021: an envelope that sync and the v2
// encryption read (id, stamps, versions) around a payload that only the client reads (ADR-0030). The
// outbox keeps the synced part of each row; M3's push maps it to ADR-0021's columns (snake case, with
// user_id and seq from the server) and drops the outbox's local `store` key. In v1 the payload is the entity itself, in plain text (encVersion 0); the
// envelope's stamps repeat the entity's, so nothing that compares or purges rows needs the payload.
// v2's keyId and nonce join the envelope through a migration. A row that names a later schema or
// encryption version (an encrypted one, a newer payload) is left where it is, unread but counted for the
// newer-version screen, so a rolled-back build or an old tab never strips it (docs/RELEASE.md); a row that
// fails at this version is set aside.
import {
  compareWrites,
  type EntityId,
  EntityIdSchema,
  type Entry,
  EntrySchema,
  err,
  type Instant,
  InstantSchema,
  instantFromEpochMs,
  ok,
  type Plan,
  PlanSchema,
  type Result,
  type SyncStamp,
  upgradePlan,
  writtenEntryVersion,
  writtenPlan,
} from '@proofofcalm/core';
import * as z from 'zod/mini';
import { issueCodes } from '../checks';
import { epochMs } from '../clock';

/**
 * The latest payload schema version each store reads and writes (docs/DOMAIN.md §2), so a reader knows
 * which shape a row holds. Plans are read at v2 (through `upgradePlan`) and v3, and written at the lowest
 * version that holds them (`writtenPlan`: v3 only once an acknowledgement is recorded). Entries are read at
 * v2 and v3, which share one payload shape, and written the same way (`writtenEntryVersion`: v3 only for
 * coins held, a kind the previous build does not know).
 */
export const ROW_SCHEMA_VERSIONS = { plans: 3, entries: 3 } as const;
/** A build's row versions; a test passes the previous build's to prove a rollback (docs/RELEASE.md). */
export type RowVersions = { readonly [store in SyncedStore]: number };
/** The oldest payload version any build wrote; every later one up to the build's own is read. */
const OLDEST_SCHEMA_VERSION = 2;
/** v1 stores payloads in plain text; v2 writes 1 with ciphertext in `payload` (ADR-0030). */
const PLAINTEXT = 0;

function rowSchemas(versions: RowVersions) {
  const readable = (store: SyncedStore) => {
    const range = Array.from(
      { length: versions[store] - OLDEST_SCHEMA_VERSION + 1 },
      (_, i) => OLDEST_SCHEMA_VERSION + i,
    );
    return {
      id: EntityIdSchema,
      payload: z.unknown(),
      updatedAt: InstantSchema,
      deletedAt: z.nullable(InstantSchema),
      deviceId: EntityIdSchema,
      schemaVersion: z.literal(range),
      encVersion: z.literal(PLAINTEXT),
    };
  };
  return {
    plans: z.strictObject(readable('plans')),
    /** An entry's row also names the plan that was live when it was written: a local index, never synced. */
    entries: z.strictObject({ ...readable('entries'), planId: z.nullable(EntityIdSchema) }),
  };
}
type RowSchemas = ReturnType<typeof rowSchemas>;
export type PlanRow = z.infer<RowSchemas['plans']>;
export type EntryRow = z.infer<RowSchemas['entries']>;

const schemasByVersions = new WeakMap<RowVersions, RowSchemas>();
function schemasFor(versions: RowVersions): RowSchemas {
  const known = schemasByVersions.get(versions);
  if (known !== undefined) return known;
  const made = rowSchemas(versions);
  schemasByVersions.set(versions, made);
  return made;
}

/**
 * The live plan's row, written by this device. A plan has no deletedAt of its own; its row has. The row
 * repeats the plan's updatedAt, except over the plan's own tombstone: that stamp was made here at the
 * replacing write and never reached the plan, so the row is stamped one millisecond after it when the
 * plan's is not later, or sync would keep the tombstone (ADR-0021: only a strictly later write wins).
 * The payload is the plan at the lowest version that holds it, so the previous build reads every plan
 * row written before an acknowledgement is recorded (docs/RELEASE.md, rollback).
 */
export function planRow(plan: Plan, deviceId: EntityId, stored: PlanRow | null = null): PlanRow {
  const { schemaVersion, payload } = writtenPlan(plan);
  const versions = { schemaVersion, encVersion: PLAINTEXT } as const;
  const own = { updatedAt: plan.updatedAt, deviceId };
  const tombstone = stored !== null && stored.id === plan.id && stored.deletedAt !== null ? stored : null;
  const updatedAt =
    tombstone === null || compareWrites(own, tombstone) > 0
      ? plan.updatedAt
      : instantFromEpochMs(epochMs(tombstone.updatedAt) + 1);
  return { id: plan.id, payload, updatedAt, deletedAt: null, deviceId, ...versions };
}

/**
 * A plan replaced by another or removed stays as a tombstone, so that sync deletes it everywhere. It is
 * stamped `now`, or one millisecond after the live row when that stamp is not earlier (another device's
 * clock ran ahead, or this one went back): only a strictly later write wins under ADR-0021.
 */
export function planTombstone(row: PlanRow, deviceId: EntityId, now: Instant): PlanRow {
  const at =
    compareWrites({ updatedAt: now, deviceId }, row) > 0 ? now : instantFromEpochMs(epochMs(row.updatedAt) + 1);
  return { ...row, updatedAt: at, deletedAt: at, deviceId };
}

/**
 * An entry's row, at the lowest version that holds the entry, so the previous build reads every row but a
 * held one's, and counts that one as newer (docs/RELEASE.md, rollback). Never above the build's own
 * `versions.entries`, so a test's previous build writes the rows that build wrote.
 */
export function entryRow(
  entry: Entry,
  planId: EntityId | null,
  deviceId: EntityId,
  versions: RowVersions = ROW_SCHEMA_VERSIONS,
): EntryRow {
  const schemaVersion = Math.min(writtenEntryVersion(entry), versions.entries);
  const stamps = { updatedAt: entry.updatedAt, deletedAt: entry.deletedAt };
  return { id: entry.id, payload: entry, ...stamps, deviceId, schemaVersion, encVersion: PLAINTEXT, planId };
}

export type SyncedStore = 'plans' | 'entries';

/** The synced part of a row, as last written, under [store, id] so that a later write replaces it. */
export function outboxRecord(store: SyncedStore, row: PlanRow | EntryRow) {
  // The entry row's planId is a local index, never synced (ADR-0019 readings).
  const { planId: _local, ...synced } = row as EntryRow;
  return { store, ...synced };
}

/** The item with the latest write by the sync comparator (ADR-0021), or null. */
export function newest<T>(items: readonly T[], stamp: (item: T) => SyncStamp): T | null {
  return items.reduce<T | null>(
    (best, item) => (best === null || compareWrites(stamp(item), stamp(best)) > 0 ? item : best),
    null,
  );
}

const VersionsSchema = z.object({ schemaVersion: z.number(), encVersion: z.number() });

/** Whether a stored row names a later schema or encryption version than this build writes: not ours to read or write. */
export function isLaterVersion(raw: unknown, store: SyncedStore, versions: RowVersions): boolean {
  const named = VersionsSchema.safeParse(raw);
  return named.success && (named.data.schemaVersion > versions[store] || named.data.encVersion > PLAINTEXT);
}

/**
 * Whether a stored plan or entry row may be live: anything but a row whose `deletedAt` is an instant. Only a
 * deletion this build can read makes a tombstone; any other value, on a later version's row or a damaged one,
 * may hide a plan someone holds, so nothing is written over it.
 */
export function storedLive(raw: unknown): boolean {
  return !(
    typeof raw === 'object' &&
    raw !== null &&
    'deletedAt' in raw &&
    InstantSchema.safeParse(raw.deletedAt).success
  );
}

/**
 * Why a stored row was not read: it names a later schema or encryption version than this build writes
 * (`newer`: not ours to judge, so it stays in place and is counted; `live` as `storedLive` reads it),
 * or it fails at the versions this build reads (`invalid`: set aside with its issues).
 */
export type Unread =
  | { readonly kind: 'newer'; readonly live: boolean }
  | { readonly kind: 'invalid'; readonly issues: readonly string[] };

type Read<R, T> = Result<{ readonly row: R; readonly value: T }, Unread>;

function readRow<R extends { readonly id: EntityId; readonly payload: unknown }, T extends { readonly id: EntityId }>(
  store: SyncedStore,
  versions: RowVersions,
  rowSchema: z.ZodMiniType<R>,
  payloadSchema: z.ZodMiniType<T>,
  raw: unknown,
  upgrade: (payload: unknown) => unknown = (payload) => payload,
): Read<R, T> {
  if (isLaterVersion(raw, store, versions)) return err({ kind: 'newer', live: storedLive(raw) });
  const invalid = (issues: readonly string[]) => err({ kind: 'invalid', issues } as const);
  const row = rowSchema.safeParse(raw);
  if (!row.success) return invalid(issueCodes(row.error.issues, null));
  const value = payloadSchema.safeParse(upgrade(row.data.payload));
  if (!value.success) return invalid(issueCodes(value.error.issues, 'payload'));
  if (value.data.id !== row.data.id) return invalid(['payload.id: not the row id']);
  return ok({ row: row.data, value: value.data });
}

/** A plan row of version 2 or 3; a v2 payload is upgraded before the schema judges it (docs/DOMAIN.md §2.1). */
export const readPlanRow = (raw: unknown, versions: RowVersions = ROW_SCHEMA_VERSIONS): Read<PlanRow, Plan> =>
  readRow('plans', versions, schemasFor(versions).plans, PlanSchema, raw, upgradePlan);
export const readEntryRow = (raw: unknown, versions: RowVersions = ROW_SCHEMA_VERSIONS): Read<EntryRow, Entry> =>
  readRow('entries', versions, schemasFor(versions).entries, EntrySchema, raw);
