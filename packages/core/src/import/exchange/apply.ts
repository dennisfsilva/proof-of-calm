import { MAX_ENTRIES } from '../../constants';
import { type Instant, stampAfter } from '../../dates/calendar';
import { liveEntries } from '../../plan/statuses';
import { type Entry, invalidEntryIds } from '../../schema/entry';
import type { EntityId } from '../../schema/ids';
import type { ExchangeImportPlan } from './plan';

// The exchange import's write (docs/DOMAIN.md §3.13): "One write, all or nothing; adding nothing writes nothing."
// "A replaced estimate is tombstoned with `deletedAt` and `updatedAt` at `stampAfter(now, its updatedAt)`" and keeps
// every other field, so a later import still dates purchases by it.

export type ExchangeImportRefusal =
  | { readonly code: 'too-many-entries'; readonly entries: number; readonly max: number }
  | { readonly code: 'invalid-entries'; readonly ids: readonly EntityId[] };

export type ExchangeImportWrite = {
  /** Every stored entry after the write, the tombstones and the added entries included; the stored ones if none. */
  readonly entries: readonly Entry[];
  readonly added: number;
  readonly replaced: number;
  readonly refused: ExchangeImportRefusal | null;
};

const estimateIds = (plan: ExchangeImportPlan) =>
  new Set(plan.replaced.flatMap((item) => item.estimates.map((estimate) => estimate.id)));

/** The ids that more than one of `entries` holds, each once: the store puts rows by id, so one would replace another. */
function repeatedIds(entries: readonly Entry[]): EntityId[] {
  const seen = new Set<EntityId>();
  const repeated = new Set<EntityId>();
  for (const { id } of entries) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
}

/**
 * Tombstones every estimate of every `replaced` item and adds the plan's entries; refuses `too-many-entries` past
 * `MAX_ENTRIES` live entries and `invalid-entries` for any row it writes that `EntrySchema` refuses or for an id that
 * more than one of the plan's entries holds, with the stored entries returned unchanged.
 */
export function applyExchangeImport(
  stored: readonly Entry[],
  plan: ExchangeImportPlan,
  now: Instant,
): ExchangeImportWrite {
  const unchanged = (refused: ExchangeImportRefusal | null) => ({ entries: stored, added: 0, replaced: 0, refused });
  if (plan.entries.length === 0) return unchanged(null);
  const replaced = estimateIds(plan);
  const tombstones: Entry[] = [];
  const kept = stored.map((entry) => {
    if (!replaced.has(entry.id)) return entry;
    const stamp = stampAfter(now, entry.updatedAt);
    const tombstone = { ...entry, deletedAt: stamp, updatedAt: stamp };
    tombstones.push(tombstone);
    return tombstone;
  });
  const entries = [...kept, ...plan.entries];
  const live = liveEntries(entries).length;
  if (live > MAX_ENTRIES) return unchanged({ code: 'too-many-entries', entries: live, max: MAX_ENTRIES });
  const ids = [...new Set([...invalidEntryIds([...tombstones, ...plan.entries]), ...repeatedIds(plan.entries)])];
  if (ids.length > 0) return unchanged({ code: 'invalid-entries', ids });
  return { entries, added: plan.entries.length, replaced: tombstones.length, refused: null };
}

/** Every field but `updatedAt`, so a plan recomputed at another instant reads the same. */
const shape = ({ updatedAt: _, ...rest }: Entry) => JSON.stringify(rest);
/** The entries added and the estimates tombstoned (the set across all items), each sorted. */
const shapes = (plan: ExchangeImportPlan) => [
  plan.entries.map(shape).sort(),
  [...new Set(plan.replaced.flatMap((item) => item.estimates.map(shape)))].sort(),
];

/**
 * D7: the plan recomputed inside the write matches the plan shown when it adds the same entries and tombstones the
 * same estimates, every field but `updatedAt`.
 */
export function sameImport(a: ExchangeImportPlan, b: ExchangeImportPlan): boolean {
  return JSON.stringify(shapes(a)) === JSON.stringify(shapes(b));
}
