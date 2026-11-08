// Which entry each filled row of an edit takes (docs/DOMAIN.md §6, Edit a transaction): the save stores the rows by it,
// so the row a person clears is the entry that goes and a kept row keeps its id and when it was logged.
import type { Entry } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';

/** A filled row as the assignment reads it: its coin and the edited entry it was opened from (none for a row added). */
export type RowOwner = { readonly coin: CoinId; readonly entry?: EntityId | null };

export type RowEntries = {
  /** Per row, in the rows' order, the edited entry it takes; null when it takes a fresh id. */
  readonly taken: readonly (Entry | null)[];
  /** The edited entries no row took, in their order: the save soft-deletes them. */
  readonly removed: readonly Entry[];
};

/**
 * First each row whose own entry has the row's coin keeps it, its id, `createdAt` and `source`; then each other row
 * (added in the edit, its coin changed, or naming no entry) takes the first edited entry of its coin no row took, in
 * the edited entries' order, else a fresh id. So a cleared row's own entry is the one deleted.
 */
export function rowEntries(rows: readonly RowOwner[], editing: readonly Entry[]): RowEntries {
  const unused = new Set(editing);
  const take = (entry: Entry | undefined): Entry | null => {
    if (entry === undefined || !unused.has(entry)) return null;
    unused.delete(entry);
    return entry;
  };
  const own = rows.map((row) => take(editing.find((entry) => entry.id === row.entry && entry.coin === row.coin)));
  const taken = rows.map((row, at) => own[at] ?? take([...unused].find((entry) => entry.coin === row.coin)));
  return { taken, removed: [...unused] };
}
