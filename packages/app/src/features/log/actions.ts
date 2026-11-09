import {
  type ActionError,
  defined,
  deleteEntries,
  type EntityId,
  EntityIdSchema,
  type Entry,
  err,
  type MonthKey,
  ok,
  type RestoreRefusal,
  type Result,
  restoreEntries,
  type SaleRefusal,
  type SlotsAtDelete,
  skipMonth,
  slotsAtDelete,
  uncoveredSale,
  unskipMonth,
} from '@proofofcalm/core';
import type { Services } from '../../lib/services';

// Skip a month and its undo (docs/DOMAIN.md §6 "Skip a month"), and a delete and its undo (§6 "Delete entry"),
// written through the domain store's queue on the snapshot of their turn, so a month another tab or an earlier
// write recorded or skipped meanwhile is refused, never doubled. The delete notes its stamp and its months on its
// own snapshot, so the undo refuses only what arrived since (a tombstone written again, on any tab's clock, or a
// month taken) and restores a month that already held more.

export type LogActions = {
  /** Skips the month with the note (trimmed); gives back the skip's id for the undo, or why it was refused. */
  skipMonthAction(slot: MonthKey, note: string): Promise<Result<EntityId, ActionError>>;
  /** Undoes that skip, so the month is open again; a skip the plan no longer has writes nothing. */
  undoSkip(id: EntityId): Promise<void>;
  /**
   * Soft-deletes the entries still live; gives back the stamp it wrote, the ids it deleted and their months as
   * they stood, for the undo, which restores those ids alone. Refused, deleting nothing, when a purchase it takes
   * covers a recorded sale (docs/DOMAIN.md §3.7).
   */
  deleteTransaction(ids: readonly EntityId[]): Promise<Result<SlotsAtDelete, SaleRefusal>>;
  /**
   * Restores the deleted entries; refused, restoring nothing, when a monthly buy's month was skipped or recorded since,
   * the entries were written again since (a replace in another tab), a sale's units were sold again since, or the
   * plan's pay currency changed since and an entry holds an amount or a fee (ADR-0053).
   */
  undoDelete(ids: readonly EntityId[], before: SlotsAtDelete): Promise<Result<readonly Entry[], RestoreRefusal>>;
};

/** Thrown inside the write, so a refused action writes nothing. */
const NOTHING = Symbol('nothing');

export function logActions({ domain, clock }: Pick<Services, 'domain' | 'clock'>): LogActions {
  const quietly = async (write: Promise<void>) => {
    try {
      await write;
    } catch (error) {
      if (error !== NOTHING) throw error;
    }
  };
  return {
    async skipMonthAction(slot, note) {
      const id = EntityIdSchema.parse(crypto.randomUUID());
      const box: { result: Result<EntityId, ActionError> } = { result: err({ code: 'unknown-slot', slot }) };
      await quietly(
        domain.write(({ plan, entries }) => {
          if (plan === null) throw NOTHING;
          const skipped = skipMonth(plan, entries, { slot, note: note.trim(), id, now: clock.now() });
          box.result = skipped.ok ? ok(id) : skipped;
          if (!skipped.ok) throw NOTHING;
          return { plan: skipped.value };
        }),
      );
      return box.result;
    },
    async undoSkip(id) {
      await quietly(
        domain.write(({ plan }) => {
          const next = plan === null ? null : unskipMonth(plan, id, clock.now());
          if (next === plan) throw NOTHING;
          return { plan: next };
        }),
      );
    },
    async deleteTransaction(ids) {
      const box: { result?: Result<SlotsAtDelete, SaleRefusal> } = {};
      await quietly(
        domain.write(({ plan, entries }) => {
          const now = clock.now();
          // On the rows as stored: only what is still live is deleted, at a stamp later than each of them.
          const before = slotsAtDelete(plan, entries, ids, now);
          const deleted = deleteEntries(entries, before.ids, before.at);
          const uncovered = uncoveredSale(entries, deleted);
          box.result = uncovered === null ? ok(before) : err(uncovered);
          if (uncovered !== null) throw NOTHING;
          return { entries: deleted };
        }),
      );
      return defined(box.result, 'the delete ran');
    },
    async undoDelete(ids, before) {
      const box: { result: Result<readonly Entry[], RestoreRefusal> } = { result: ok([]) };
      await quietly(
        domain.write(({ plan, entries }) => {
          if (plan === null) throw NOTHING;
          const restored = restoreEntries(plan, entries, ids, before, clock.now());
          box.result = restored;
          if (!restored.ok || restored.value.length === 0) throw NOTHING;
          return { entries: restored.value };
        }),
      );
      return box.result;
    },
  };
}
