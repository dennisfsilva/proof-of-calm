// Last writer wins per row (ADR-0021): one comparator for the client and the server, a merge of two
// row sets with their tombstones, and the 90-day purge. The stamps decide; only the client's merge
// reads a row's text, to settle two rows with identical stamps, so the server's rule holds for the
// encrypted payloads of v2 unchanged (ADR-0030).
import { TOMBSTONE_TTL_DAYS } from '../constants';
import { type CalendarDate, compareInstants, daysBetween, type Instant } from '../dates/calendar';
import type { EntityId } from '../schema/ids';

/** Who wrote a row and when, by the writing device's clock (clamped by the server to 5 minutes ahead). */
export type SyncStamp = { readonly updatedAt: Instant; readonly deviceId: EntityId };

/** A synced row: a soft delete is a write like any other and travels as a tombstone. */
export type SyncRow<P = unknown> = SyncStamp & {
  readonly id: EntityId;
  readonly deletedAt: Instant | null;
  readonly payload: P;
};

function compareText(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The later write is greater: `updatedAt` compared as moments, whatever the offsets, then the device
 * id (lowercase UUIDs sort as text the way the database sorts them).
 */
export function compareWrites(a: SyncStamp, b: SyncStamp): -1 | 0 | 1 {
  return compareInstants(a.updatedAt, b.updatedAt) || compareText(a.deviceId, b.deviceId);
}

/** The upsert rule of `POST /api/sync/push` and of a pull: only a strictly later write replaces a row. */
export function supersedes(incoming: SyncStamp, stored: SyncStamp | null): boolean {
  return stored === null || compareWrites(incoming, stored) > 0;
}

/**
 * Per id, the later write of the two sets, sorted by id. Rows with equal stamps (one device writing
 * twice in the same millisecond) are ordered by their JSON text, so the merge is commutative,
 * associative and idempotent whatever the input order.
 */
export function mergeRows<R extends SyncRow>(a: readonly R[], b: readonly R[]): R[] {
  const merged = new Map<EntityId, R>();
  for (const row of [...a, ...b]) {
    const kept = merged.get(row.id);
    const order =
      kept === undefined ? 1 : compareWrites(row, kept) || compareText(JSON.stringify(row), JSON.stringify(kept));
    if (order > 0) merged.set(row.id, row);
  }
  return [...merged.values()].sort((x, y) => compareText(x.id, y.id));
}

/** A tombstone goes once TOMBSTONE_TTL_DAYS have passed since the day of the deletion. */
export function tombstoneExpired(deletedOn: CalendarDate, today: CalendarDate): boolean {
  return daysBetween(deletedOn, today) >= TOMBSTONE_TTL_DAYS;
}

/**
 * The rows without expired tombstones. The shell names the calendar day of an instant (in the user's
 * timezone, or UTC for the nightly job): the core never derives a date from an instant (ADR-0018).
 */
export function purgeTombstones<R extends SyncRow>(
  rows: readonly R[],
  today: CalendarDate,
  dayOf: (instant: Instant) => CalendarDate,
): R[] {
  return rows.filter((row) => row.deletedAt === null || !tombstoneExpired(dayOf(row.deletedAt), today));
}
