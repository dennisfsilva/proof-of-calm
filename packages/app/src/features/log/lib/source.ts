import {
  type CoinId,
  type DraftSale,
  type EntityId,
  type Entry,
  type Instant,
  rowEntries,
  type TransactionDraft,
} from '@proofofcalm/core';

type Sourced = { readonly source: EntityId | null };

/**
 * The entry being edited that a form row was loaded from (its source), or undefined for a row added in the edit. The
 * save keeps the unchanged fields of this entry, so the sale warning reads the same one (DOMAIN §3.7, §6).
 */
export function rowSource(editing: readonly Entry[], row: Sourced | undefined): Entry | undefined {
  return row?.source == null ? undefined : editing.find((entry) => entry.id === row.source);
}

/**
 * The fresh ids the save hands out, in order, to the rows `rowEntries` gives no edited entry: one per form row whose
 * coin no entry being edited has (DOMAIN §6).
 */
export function freshIds(
  ids: readonly EntityId[],
  rows: readonly { readonly coin: CoinId }[],
  editing: readonly Entry[],
): EntityId[] {
  return ids.filter((_, at) => !editing.some((entry) => entry.coin === rows[at]?.coin));
}

/**
 * The draft's sales as the save stores them, for `saleWarning` (DOMAIN §3.7, §6): each row with units under the entry
 * `rowEntries` gives it, with that entry's `createdAt` (on a draft the save takes, the rows with units are its filled
 * rows), else under the next of the save's fresh ids (`freshIds`) at `now`, as the save stamps it; and with the venue `keepUnchanged` keeps: its
 * source's while the venue field is unchanged, else the field's.
 */
export function storedSales(
  draft: TransactionDraft,
  rows: readonly (Sourced & { readonly coin: CoinId })[],
  editing: readonly Entry[],
  ids: readonly EntityId[],
  venueChanged: boolean,
  now: Instant,
): DraftSale[] {
  const sales = draft.rows.flatMap(({ coin, entry, units }, at) =>
    units === null ? [] : [{ coin, entry: entry ?? null, units, source: rowSource(editing, rows[at]) }],
  );
  const { taken } = rowEntries(sales, editing);
  const fresh = freshIds(ids, rows, editing);
  let next = 0;
  return sales.flatMap(({ coin, units, source }, at) => {
    const kept = taken[at];
    const id = kept?.id ?? fresh[next++];
    const venue = source === undefined || venueChanged ? draft.venue : source.venue;
    return id === undefined ? [] : [{ id, coin, units, venue, createdAt: kept?.createdAt ?? now }];
  });
}
