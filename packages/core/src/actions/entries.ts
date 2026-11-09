// Saving, deleting and restoring entries (docs/DOMAIN.md §6), ported from the prototype's form submit:
// one row per coin with both the amount and the units, and a sale never larger than what is held.
// Every function returns the entries to store (new, changed or soft-deleted); the store merges by id.
import { ENTRY_NOTE_MAX_LENGTH, VENUE_MAX_LENGTH } from '../constants';
import {
  type CalendarDate,
  compareDates,
  compareInstants,
  type Instant,
  type MonthKey,
  stampAfter,
} from '../dates/calendar';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import {
  compare,
  decimalPlaces,
  isNegative,
  isPositive,
  type Money,
  max,
  min,
  minus,
  plus,
  sum,
  type Units,
} from '../money/decimal';
import { splitLargestRemainder } from '../money/split';
import { slots } from '../plan/slots';
import { liveEntries } from '../plan/statuses';
import { unitsIn, unitsOut } from '../portfolio/effect';
import { matchLots, runningHeld } from '../portfolio/lots';
import { coinsWithEntries } from '../portfolio/portfolio';
import { defined, err, ok, type Result } from '../result';
import { type Entry, MAX_UNIT_DECIMALS, recordedAmounts, savedSource, type TransactionKind } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import { overCap, type TooManyEntries } from './cap';
import type { ActionError } from './errors';
import { type RowOwner, rowEntries } from './rows';
import { type CurrencyMoved, currencyMoved, type SlotsAtDelete } from './undo';

/**
 * One coin of the form; an empty field is null. `entry` is the edited entry the row was opened from, which the row
 * keeps (`rowEntries`); none on a new transaction's rows and on a row the edit adds.
 */
export type EntryRow = RowOwner & { readonly amount: Money | null; readonly units: Units | null };

export type TransactionDraft = {
  readonly kind: TransactionKind;
  readonly date: CalendarDate;
  readonly slot: MonthKey | null;
  /** The transaction's fee, split across its entries in proportion to their amounts. */
  readonly fee: Money | null;
  readonly note: string;
  readonly venue: string | null;
  readonly rows: readonly EntryRow[];
};

export type SaveContext = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  /** The live entries of the transaction being edited; empty for a new one. */
  readonly editing: readonly Entry[];
  /** Fresh ids from the shell, one for each entry that is new. */
  readonly ids: readonly EntityId[];
  readonly now: Instant;
  readonly source: Entry['source'];
};

/** A row to store: `amount` is null only for coins held (`held`) whose cost is not known. */
type FilledRow = RowOwner & { readonly amount: Money | null; readonly units: Units };

/** Units of `coin` held after every purchase and sale, never below zero (the prototype's heldUnits()). */
export function heldUnits(entries: readonly Entry[], coin: CoinId, except: ReadonlySet<EntityId> = new Set()): Units {
  let held = '0' as Units;
  for (const entry of liveEntries(entries)) {
    if (entry.coin !== coin || except.has(entry.id)) continue;
    held = minus(plus(held, unitsIn(entry)), unitsOut(entry));
  }
  return max(held, '0' as Units);
}

/** A transaction's fee split by amount; the shares sum to the fee exactly (largest remainder, §1). */
export function feeShares(fee: Money, amounts: readonly Money[], currency: CurrencyCode): Money[] {
  return splitLargestRemainder(fee, amounts, Math.max(MINOR_UNITS[currency], decimalPlaces(fee)));
}

function slotError(draft: TransactionDraft, context: SaveContext): ActionError | null {
  if (draft.kind === 'dca' && draft.slot === null) return { code: 'slot-required' };
  if (draft.kind !== 'dca' && draft.slot !== null) return { code: 'slot-not-allowed' };
  const slot = draft.slot;
  if (slot === null) return null;
  // A slot the plan no longer has may stay on an entry that already carries it.
  const known = slots(context.plan).some((candidate) => candidate.key === slot);
  const kept = context.editing.some((entry) => entry.slot === slot);
  if (!known && !kept) return { code: 'unknown-slot', slot };
  // A month the edited entries carry is theirs; any other month must still be open.
  if (kept) return null;
  const editing = new Set(context.editing.map((entry) => entry.id));
  return monthTaken(context.plan, context.entries, slot, editing);
}

/** Why a monthly buy cannot take a month, or a delete's undo restores nothing. */
export type SlotRefusal = Extract<ActionError, { readonly code: 'slot-done' | 'slot-skipped' }>;

/**
 * Why a monthly buy cannot take `slot`: it is skipped, or a live monthly buy other than `except` records it.
 * `wasSkipped` lets a skip stand that the month already had (a delete's undo).
 */
function monthTaken(
  plan: Plan,
  entries: readonly Entry[],
  slot: MonthKey,
  except: ReadonlySet<EntityId>,
  wasSkipped = false,
): SlotRefusal | null {
  if (!wasSkipped && plan.skips.some((skip) => skip.slot === slot)) return { code: 'slot-skipped', slot };
  const recorded = liveEntries(entries).some(
    (entry) => entry.kind === 'dca' && entry.slot === slot && !except.has(entry.id),
  );
  return recorded ? { code: 'slot-done', slot } : null;
}

/** The note and the venue fit the entry schema, so a long one is named instead of failing the store. */
function textError(draft: TransactionDraft): ActionError | null {
  if (draft.note.length > ENTRY_NOTE_MAX_LENGTH) return { code: 'note-too-long', max: ENTRY_NOTE_MAX_LENGTH };
  if (draft.venue !== null && draft.venue.length > VENUE_MAX_LENGTH) {
    return { code: 'venue-too-long', max: VENUE_MAX_LENGTH };
  }
  return null;
}

/**
 * A row's amount and units as the save reads them: both positive, or for coins held (`held`) positive units and an
 * amount that is unknown (null) or 0 or more; null when the row is empty, and the refusal when only one is given.
 */
function rowFigures(held: boolean, row: EntryRow): Result<Pick<FilledRow, 'amount' | 'units'> | null, ActionError> {
  const typed = row.amount !== null;
  const amount = typed && (held ? !isNegative(row.amount) : isPositive(row.amount)) ? row.amount : null;
  const units = row.units !== null && isPositive(row.units) ? row.units : null;
  if (amount === null && units === null) return ok(null);
  // Only a held row's cost may be left empty; one typed that reads as none (below 0) is refused as on any kind.
  if (units === null || (amount === null && (!held || typed))) return err({ code: 'amount-and-units', coin: row.coin });
  return ok({ amount, units });
}

function rowsOrError(draft: TransactionDraft, context: SaveContext): Result<FilledRow[], ActionError> {
  // Coins held carry no fee: nothing to split it on without a cost, and a known fee goes into the cost.
  if (draft.kind === 'held' && draft.fee !== null) return err({ code: 'fee-not-allowed' });
  const coins = coinsWithEntries(context.plan, liveEntries(context.entries));
  const filled: FilledRow[] = [];
  for (const row of draft.rows) {
    const figures = rowFigures(draft.kind === 'held', row);
    if (!figures.ok) return figures;
    if (figures.value === null) continue;
    const { amount, units } = figures.value;
    if (!coins.includes(row.coin)) return err({ code: 'unknown-coin', coin: row.coin });
    if (decimalPlaces(units) > MAX_UNIT_DECIMALS) return err({ code: 'units-precision', coin: row.coin });
    filled.push({ coin: row.coin, entry: row.entry ?? null, amount, units });
  }
  return filled.length === 0 ? err({ code: 'no-coins' }) : ok(filled);
}

/** A write refused because it leaves a recorded sale with fewer units before it than it sold (§3.7, §6). */
export type SaleRefusal = Extract<ActionError, { readonly code: 'sell-exceeds-held' }>;

/**
 * Units of `coin` a sale dated `date` can take and leave every recorded sale covered: the fewest held from the end of
 * that day on (purchases dated on or before it, minus the sales matched before it; `runningHeld`).
 */
export function heldOn(entries: readonly Entry[], coin: CoinId, date: CalendarDate): Units {
  let atDay = '0' as Units;
  const later: Units[] = [];
  for (const { entry, held } of runningHeld(entries, coin)) {
    if (compareDates(entry.date, date) <= 0) atDay = held;
    else later.push(held);
  }
  return later.reduce((least, held) => min(least, held), atDay);
}

/** `entries` as the store holds them once `written` is merged in: an entry written replaces the one with its id. */
function storedOver(entries: readonly Entry[], written: readonly Entry[]): Entry[] {
  const ids = new Set(written.map((entry) => entry.id));
  return [...entries.filter((entry) => !ids.has(entry.id)), ...written];
}

/** Whether `after` leaves more units of `coin` sold that no earlier purchase covers than `before` (one global queue). */
function moreUnmatched(before: readonly Entry[], after: readonly Entry[], coin: CoinId): boolean {
  const unmatched = (list: readonly Entry[]) => matchLots(list, coin, 'global').unmatchedUnits;
  return compare(unmatched(after), unmatched(before)) > 0;
}

/** Units of `coin` sold beyond all its purchases, whatever the dates; zero while the purchases cover the sales. */
function oversold(entries: readonly Entry[], coin: CoinId): Units {
  const own = liveEntries(entries).filter((entry) => entry.coin === coin);
  return max(minus(sum(own.map(unitsOut)), sum(own.map(unitsIn))), '0' as Units);
}

/** Whether `after` leaves `coin` with more uncovered units than `before`, by date or in all (§3.7). */
function worseCovered(before: readonly Entry[], after: readonly Entry[], coin: CoinId): boolean {
  return compare(oversold(after, coin), oversold(before, coin)) > 0 || moreUnmatched(before, after, coin);
}

/**
 * The invariant of every write from this device (§6): stored over `entries`, `written` leaves no coin with more units
 * sold than bought, or more units sold that no earlier purchase covers (`matchLots`, one global queue), than before
 * (`worseCovered`), so data imported short stays as written and nothing makes it worse. The refusal names the first
 * sale left short, the units held before it and its units; null when every sale stays covered.
 */
export function uncoveredSale(entries: readonly Entry[], written: readonly Entry[]): SaleRefusal | null {
  const ids = new Set(written.map((entry) => entry.id));
  const after = storedOver(entries, written);
  const touched = [...written, ...entries.filter((entry) => ids.has(entry.id))];
  for (const coin of new Set(touched.map((entry) => entry.coin))) {
    if (!worseCovered(entries, after, coin)) continue;
    let held = '0' as Units;
    for (const step of runningHeld(after, coin)) {
      const sold = unitsOut(step.entry);
      if (compare(sold, held) > 0) return { code: 'sell-exceeds-held', coin, held, sold };
      held = step.held;
    }
  }
  return null;
}

/**
 * A sale takes at most the units held on its own date and after it, and at most the units held in all (`heldUnits`), the
 * entries being edited left out; a write that leaves the coin's uncovered units as they were (a new note on a sale
 * imported short) is not refused (§3.7).
 */
function saleError(
  draft: TransactionDraft,
  rows: readonly FilledRow[],
  context: SaveContext,
  written: readonly Entry[],
): ActionError | null {
  if (draft.kind !== 'sell') return null;
  const except = new Set(context.editing.map((entry) => entry.id));
  const others = context.entries.filter((entry) => !except.has(entry.id));
  const after = storedOver(context.entries, written);
  for (const coin of new Set(rows.map((row) => row.coin))) {
    const sold = rows.filter((row) => row.coin === coin).reduce((total, row) => plus(total, row.units), '0' as Units);
    const held = min(heldUnits(others, coin), heldOn(others, coin, draft.date));
    if (compare(sold, held) <= 0 || !worseCovered(context.entries, after, coin)) continue;
    return { code: 'sell-exceeds-held', coin, held, sold };
  }
  return null;
}

/** `now`, or one millisecond after the entry's stored stamps when `now` is not later (ADR-0021: a later write wins). */
function stampOver(now: Instant, entry: Entry): Instant {
  return stampAfter(now, entry.updatedAt, ...(entry.deletedAt === null ? [] : [entry.deletedAt]));
}

/**
 * Validates a transaction from the Log form and returns its entries. An edit keeps each row's own entry (id, creation
 * time and source), gives a row without one an unused entry of its coin or a fresh id, and soft-deletes the edited
 * entries no row took (`rowEntries`); an entry it writes again is stamped after its stored stamp, whatever the clock.
 */
export function saveTransaction(draft: TransactionDraft, context: SaveContext): Result<Entry[], ActionError> {
  const slotProblem = slotError(draft, context);
  if (slotProblem !== null) return err(slotProblem);
  if (draft.fee !== null && isNegative(draft.fee)) return err({ code: 'fee-negative' });
  const textProblem = textError(draft);
  if (textProblem !== null) return err(textProblem);
  const rows = rowsOrError(draft, context);
  if (!rows.ok) return rows;
  const { fee } = draft;
  // A fee is refused on `held` (rowsOrError), so with a fee every row has an amount: feeShares never runs for it.
  const fees =
    fee === null ? rows.value.map(() => null) : feeShares(fee, recordedAmounts(rows.value), context.plan.payCurrency);
  const { taken, removed: unused } = rowEntries(rows.value, context.editing);
  let fresh = 0;
  const saved = rows.value.map((row, index): Entry => {
    const existing = taken[index] ?? undefined;
    return {
      id: existing?.id ?? defined(context.ids[fresh++], 'a fresh id'),
      kind: draft.kind,
      date: draft.date,
      coin: row.coin,
      amount: row.amount,
      units: row.units,
      fee: fees[index] ?? null,
      note: draft.note,
      slot: draft.slot,
      venue: draft.venue,
      source: savedSource(existing, row.units, context.source),
      createdAt: existing?.createdAt ?? context.now,
      updatedAt: existing === undefined ? context.now : stampOver(context.now, existing),
      deletedAt: null,
    };
  });
  const removed = unused.map((entry) => {
    const at = stampOver(context.now, entry);
    return { ...entry, deletedAt: at, updatedAt: at };
  });
  // A sale is refused at its own date; an edit of a purchase (units, date or coin) may leave a sale it covered short.
  const written = [...saved, ...removed];
  const refused =
    saleError(draft, rows.value, context, written) ??
    uncoveredSale(context.entries, written) ??
    overCap(context.entries, storedOver(context.entries, written));
  return refused === null ? ok(written) : err(refused);
}

/** Soft delete (§6) at `now`, the `at` of slotsAtDelete: the toast can undo it; the tombstone stays for sync until it is purged. */
export function deleteEntries(entries: readonly Entry[], ids: readonly EntityId[], now: Instant): Entry[] {
  return entries
    .filter((entry) => ids.includes(entry.id) && entry.deletedAt === null)
    .map((entry) => ({ ...entry, deletedAt: now, updatedAt: now }));
}

/**
 * Taken with the delete, on the same state, for its undo: the stamp the delete writes (`now`, or one millisecond
 * after the latest stamp of the entries it deletes when `now` is not later), the live entries among `ids` and the
 * months of the live monthly buys among them.
 */
export function slotsAtDelete(
  plan: Plan | null,
  entries: readonly Entry[],
  ids: readonly EntityId[],
  at: Instant,
): SlotsAtDelete {
  const touched = liveEntries(entries).filter((entry) => ids.includes(entry.id));
  const stamp = stampAfter(at, ...touched.map((entry) => entry.updatedAt));
  const live = liveEntries(entries).filter((entry) => entry.kind === 'dca');
  const months = new Set(live.filter((entry) => ids.includes(entry.id)).map((entry) => entry.slot));
  const slots = [...months].flatMap((slot) =>
    slot === null
      ? []
      : [
          {
            slot,
            skipped: plan?.skips.some((skip) => skip.slot === slot) ?? false,
            recordedBy: live.filter((entry) => entry.slot === slot && !ids.includes(entry.id)).map((entry) => entry.id),
          },
        ],
  );
  return { at: stamp, ids: touched.map((entry) => entry.id), slots, currency: plan?.payCurrency ?? null };
}

/**
 * Why a delete's undo restores nothing: a month taken since, a tombstone written again since (a replace), a sale
 * whose units are no longer held, the cap, or a pay currency moved since.
 */
export type RestoreRefusal =
  | SlotRefusal
  | SaleRefusal
  | TooManyEntries
  | CurrencyMoved
  | { readonly code: 'changed-since-delete' };

/**
 * The undo of deleteEntries, given what the delete wrote (`slotsAtDelete`): only the entries among `ids` that the
 * delete wrote (`before.ids`) are checked and restored, so one another tab deleted first stays deleted. A tombstone whose `updatedAt` or
 * `deletedAt` is not the delete's stamp was written since (in M1 only a replace does so, from any tab and on any
 * clock) and refuses the undo (`changed-since-delete`), as does a deleted monthly buy whose month was skipped, or
 * recorded by another monthly buy, since the delete (`slot-skipped`, `slot-done`), or a deleted sale whose units were
 * sold again since (`sell-exceeds-held`, `uncoveredSale`), or one that would leave more live entries than the cap
 * (`too-many-entries`, `overCap`), or an amount or a fee when the pay currency moved since (`currencyMoved`); nothing
 * is restored and the entries stay deleted. What the month already held stays allowed.
 */
export function restoreEntries(
  plan: Plan,
  entries: readonly Entry[],
  ids: readonly EntityId[],
  before: SlotsAtDelete,
  now: Instant,
): Result<Entry[], RestoreRefusal> {
  const deleted = entries.filter(
    (entry): entry is Entry & { readonly deletedAt: Instant } =>
      ids.includes(entry.id) && before.ids.includes(entry.id) && entry.deletedAt !== null,
  );
  const written = (entry: Entry & { readonly deletedAt: Instant }) =>
    compareInstants(entry.updatedAt, before.at) === 0 && compareInstants(entry.deletedAt, before.at) === 0;
  if (!deleted.every(written)) return err({ code: 'changed-since-delete' });
  const moved = currencyMoved(plan, deleted, before.currency);
  if (moved !== null) return err(moved);
  for (const entry of deleted) {
    if (entry.kind !== 'dca' || entry.slot === null) continue;
    const slot = entry.slot;
    const was = before.slots.find((candidate) => candidate.slot === slot);
    const except = new Set([...ids, ...(was?.recordedBy ?? [])]);
    const refusal = monthTaken(plan, entries, slot, except, was?.skipped);
    if (refusal !== null) return err(refusal);
  }
  const restored = deleted.map((entry) => ({ ...entry, deletedAt: null, updatedAt: stampOver(now, entry) }));
  const refused = uncoveredSale(entries, restored) ?? overCap(entries, storedOver(entries, restored));
  return refused === null ? ok(restored) : err(refused);
}
