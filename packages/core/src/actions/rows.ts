// Which entry each filled row of an edit takes (docs/DOMAIN.md §6, Edit a transaction): the save stores the rows by it,
// so the row a person clears is the entry that goes and a kept row keeps its id and when it was logged; and what an edit
// keeps of each row's source entry.
import { compare, type Money, type Units } from '../money/decimal';
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

/**
 * The transaction-wide fields of an edit the person changed: the Log's form shows a grouped row's first note, its fees
 * summed, and its venue when all its entries share one (else none).
 */
export type EditedFields = { readonly fee: boolean; readonly venue: boolean; readonly note: boolean };

/**
 * The entries `saveTransaction` returned for an edit, each filled row's with every field the person left unchanged
 * taken from its source: `sources` holds, per filled row in the draft's order, the entry it was loaded from, or
 * undefined for a row added in the edit. The save returns one entry per filled row in that order, then the soft-deleted
 * entries no row took, which stay as it returned them. So an edit of a row that groups several saves keeps each one's
 * venue, note and fee (DOMAIN §6); a row without a source gets no fee while the fee is unchanged; a changed field stays
 * as the save set it on every entry, the fee split by amount. An amount or units equal in value to the source's keep
 * the text it stored (DOMAIN §2.2).
 */
export function keepSources(
  saved: readonly Entry[],
  sources: readonly (Entry | undefined)[],
  changed: EditedFields,
): Entry[] {
  const stored = <T extends Money | Units | null>(value: T, before: T | undefined): T =>
    value !== null && before !== undefined && before !== null && compare(value, before) === 0 ? before : value;
  return saved.map((entry, at) => {
    if (at >= sources.length) return entry;
    const source = sources[at];
    return {
      ...entry,
      amount: stored(entry.amount, source?.amount),
      units: stored(entry.units, source?.units),
      ...(changed.fee ? {} : { fee: source?.fee ?? null }),
      ...(changed.venue || source === undefined ? {} : { venue: source.venue }),
      ...(changed.note || source === undefined ? {} : { note: source.note }),
    };
  });
}
