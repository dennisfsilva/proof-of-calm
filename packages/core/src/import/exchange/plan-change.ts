// A change the import's lines ask for, made as the Log makes it (docs/DOMAIN.md §3.13, "Lines that ask for a change"):
// Delete entry, Edit entry or Record a purchase, on the stored entries.
import {
  deleteEntries,
  saveTransaction,
  slotsAtDelete,
  storedOver,
  type TransactionDraft,
  uncoveredSale,
} from '../../actions/entries';
import { keepSources } from '../../actions/rows';
import type { CalendarDate } from '../../dates/calendar';
import { type Money, sum, type Units } from '../../money/decimal';
import { assertNever } from '../../result';
import type { Entry } from '../../schema/entry';
import type { EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ImportContext } from './plan';

export type Stored = { readonly plan: Plan; readonly entries: readonly Entry[] };
/** A change made with the Log's own controls: Delete entry (the whole row), Edit entry (a row) or Record a purchase. */
export type LogChange =
  | { readonly kind: 'delete'; readonly ids: readonly EntityId[] }
  | {
      readonly kind: 'edit';
      readonly row: readonly Entry[];
      readonly date: CalendarDate;
      readonly figures: ReadonlyMap<EntityId, { readonly amount: Money; readonly units: Units }>;
    }
  | { readonly kind: 'record'; readonly draft: TransactionDraft };

const over = (stored: Stored, written: readonly Entry[]) =>
  uncoveredSale(stored.entries, written) === null ? storedOver(stored.entries, written) : null;

function saved(
  stored: Stored,
  draft: TransactionDraft,
  editing: readonly Entry[],
  ids: readonly EntityId[],
  now: ImportContext['now'],
) {
  const result = saveTransaction(draft, {
    plan: stored.plan,
    entries: stored.entries,
    editing,
    ids,
    now,
    source: 'manual',
  });
  if (!result.ok) return null;
  // Each filled row's source is its own entry, and only the date and the figures change (`keepSources`, as `saveOn`
  // stores an edit); a record edits nothing, so it stays as saved (the Log's `keepUnchanged` guard).
  if (editing.length === 0) return over(stored, result.value);
  const live = result.value.filter((entry) => entry.deletedAt === null);
  const sources = live.map((entry) => editing.find((each) => each.id === entry.id));
  return over(stored, keepSources(result.value, sources, { fee: false, venue: false, note: false }));
}

/**
 * The stored entries after `change`, as the Log writes it, or null when the Log refuses it (a form error, or a sale left
 * uncovered). An edit keeps the row's kind and month and each entry's own fee, note and venue (the form opens on the
 * row's fees summed, its first note and venue, and `keepSources` gives each entry its own back, DOMAIN §6), and takes
 * the figures given, an amount or units equal in value keeping the stored text; a record is stored as saved, its fee,
 * venue and note included, and takes ids no movement key holds, one per coin.
 */
export function changedLog(stored: Stored, change: LogChange, context: ImportContext): readonly Entry[] | null {
  switch (change.kind) {
    case 'delete': {
      const before = slotsAtDelete(stored.plan, stored.entries, change.ids, context.now);
      return over(stored, deleteEntries(stored.entries, before.ids, before.at));
    }
    case 'edit': {
      const [first] = change.row as [Entry];
      const fees = change.row.flatMap((entry) => (entry.fee === null ? [] : [entry.fee]));
      const rows = change.row.map((entry) => ({
        coin: entry.coin,
        entry: entry.id,
        amount: entry.amount,
        units: entry.units,
        ...change.figures.get(entry.id),
      }));
      const kind = first.kind as TransactionDraft['kind'];
      const fee = fees.length === 0 ? null : sum(fees);
      const draft = { kind, date: change.date, slot: first.slot, fee, note: first.note, venue: first.venue, rows };
      return saved(stored, draft, change.row, [], context.now);
    }
    case 'record': {
      const ids = change.draft.rows.map((row) => context.idOf(`remedy|starting|${row.coin}`));
      return saved(stored, change.draft, [], ids, context.now);
    }
    default:
      return assertNever(change);
  }
}
