// The exchange import's lines that ask for a change in the Log (docs/DOMAIN.md §3.13, "Lines that ask for a change"):
// each shows only when the change, made as the Log makes it, and the file planned again end as the line says and keep
// every other date group, on the Log as shown and on the Log after importing the shown plan first. This branch checks
// Delete entry, for the sentence under `Matching entries`, and makes Edit entry and Record a purchase as the Log makes
// them, for the starting line's sentence (planned).
import {
  deleteEntries,
  saveTransaction,
  slotsAtDelete,
  storedOver,
  type TransactionDraft,
  uncoveredSale,
} from '../../actions/entries';
import { IMPORT_RECORDED_CHECKS, IMPORT_REMEDY_MAX_MOVEMENTS } from '../../constants';
import type { CalendarDate, MonthKey } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { type Money, sum, type Units } from '../../money/decimal';
import { liveEntries } from '../../plan/statuses';
import { assertNever } from '../../result';
import type { Entry } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, type ImportContext, planExchangeImport } from './plan';
import { HAND } from './plan-claims';

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
  return result.ok ? over(stored, result.value) : null;
}

/**
 * The stored entries after `change`, as the Log writes it, or null when the Log refuses it (a form error, or a sale left
 * uncovered). An edit keeps the row's kind, month, fee, note and venue and takes the figures given; a record has no fee
 * and takes ids no movement key holds, one per coin.
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

/**
 * A date group the change touches and how it must end: `ids` are the ids its movements take that no stored entry holds;
 * `added` with a month is added in full as monthly buys for it, `added: null` added in full as any kind.
 */
export type Touched = {
  readonly coin: CoinId;
  readonly date: CalendarDate;
  readonly ids: readonly EntityId[];
  readonly end: { readonly recordedBy: EntityId } | { readonly added: MonthKey | null } | 'any';
};

/** Every field but `updatedAt`, so plans made at other instants compare alike. */
const shape = ({ updatedAt: _, ...rest }: Entry) => JSON.stringify(rest);
const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function ends(touched: Touched, again: ExchangeImportPlan) {
  const { end } = touched;
  if (end === 'any') return true;
  if ('recordedBy' in end)
    return again.recorded.some((item) => item.entry.id === end.recordedBy && item.dates.includes(touched.date));
  const added = again.entries.filter((entry) => touched.ids.includes(entry.id));
  return added.length === touched.ids.length && added.every((entry) => end.added === null || entry.slot === end.added);
}

/**
 * Every untouched date group added exactly as in `shown` or not at all; the same tombstones but for a touched date's
 * new month; each touched group ends as it says.
 */
export function keepsPromise(
  shown: ExchangeImportPlan,
  again: ExchangeImportPlan,
  touched: readonly Touched[],
): boolean {
  const ids = new Set(touched.flatMap((each) => each.ids));
  const untouched = (plan: ExchangeImportPlan) => plan.entries.filter((entry) => !ids.has(entry.id)).map(shape);
  const freed = new Set(
    again.entries.filter((entry) => ids.has(entry.id) && entry.kind === 'dca').map((e) => `${e.coin}|${e.slot}`),
  );
  const tombstones = (plan: ExchangeImportPlan) => [
    ...new Set(
      plan.replaced.flatMap((item) => item.estimates.filter((e) => !freed.has(`${e.coin}|${e.slot}`)).map((e) => e.id)),
    ),
  ];
  return (
    same(untouched(shown), untouched(again)) &&
    same(tombstones(shown), tombstones(again)) &&
    touched.every((each) => ends(each, again))
  );
}

export type ImportRemedies = { readonly recorded: ReadonlySet<EntityId> };

/**
 * The entries of `Matching entries` whose Log row may be deleted to import the file's instead, checked in both orders the
 * person may follow the sentence: on the Log as shown (planned unticked), and on the Log after importing the shown plan
 * (planned with the box as set) first. In each, the row (the live entries with the item's `transactionKey`) holds no
 * `lump`, every entry of it is a hand entry that records a date of the file, the Log deletes it, and the file planned
 * again with the box unticked, as choosing it again opens the preview, adds every date the row records (a monthly buy's
 * as monthly buys for its month) and keeps every other date group. At most `IMPORT_RECORDED_CHECKS` rows are checked, in
 * the section's order, and none for a file of more than `IMPORT_REMEDY_MAX_MOVEMENTS` movements; nothing is planned
 * again when no row can pass. Planned with no venue, since no step reads one.
 */
export function importRemedies(
  file: ExchangeFile,
  stored: Stored,
  addHeld: boolean,
  context: ImportContext,
): ImportRemedies {
  if (file.movements.length > IMPORT_REMEDY_MAX_MOVEMENTS) return { recorded: new Set() };
  const shown = planExchangeImport(file, stored, { venue: null, addHeld }, context);
  const records = new Set(shown.recorded.map((item) => item.entry.id));
  const rowOf = (entries: readonly Entry[], key: string) =>
    liveEntries(entries).filter((entry) => transactionKey(entry) === key);
  const candidate = (row: readonly Entry[]) =>
    !row.some((entry) => entry.kind === 'lump' || !HAND.has(entry.source) || !records.has(entry.id));
  const keys = [...new Set(shown.recorded.map((item) => transactionKey(item.entry)))].slice(0, IMPORT_RECORDED_CHECKS);
  const candidates = keys.filter((key) => candidate(rowOf(stored.entries, key)));
  if (candidates.length === 0) return { recorded: new Set() };

  const anew = (entries: readonly Entry[]) =>
    planExchangeImport(file, { plan: stored.plan, entries }, { venue: null, addHeld: false }, context);
  const imported = applyExchangeImport(stored.entries, shown, context.now).entries;
  // Choosing the file again opens it unticked, so the Log as shown is compared unticked too.
  const orders = [
    { entries: stored.entries, shown: addHeld ? anew(stored.entries) : shown },
    { entries: imported, shown: anew(imported) },
  ];
  const known = new Set(stored.entries.map((entry) => entry.id));
  const idsOn = (item: ExchangeImportPlan['recorded'][number], date: CalendarDate) =>
    file.movements
      .filter((movement) => movement.coin === item.coin && context.dateOf(movement.at) === date)
      .filter((movement) => movement.role === (item.entry.kind === 'sell' ? 'sale' : 'purchase'))
      .map((movement) => context.idOf(movement.key))
      .filter((id) => !known.has(id));
  const holds = (log: (typeof orders)[number], key: string, touched: readonly Touched[]) => {
    const row = rowOf(log.entries, key);
    if (!candidate(row)) return false;
    const ids = row.map((entry) => entry.id);
    const entries = changedLog({ plan: stored.plan, entries: log.entries }, { kind: 'delete', ids }, context);
    return entries !== null && keepsPromise(log.shown, anew(entries), touched);
  };
  const deletable = (key: string) => {
    const row = rowOf(stored.entries, key);
    const touched = shown.recorded
      .filter((item) => row.includes(item.entry))
      .flatMap((item) =>
        item.dates.map((date) => ({
          coin: item.coin,
          date,
          ids: idsOn(item, date),
          end: { added: item.entry.kind === 'dca' ? item.entry.slot : null },
        })),
      );
    return orders.every((log) => holds(log, key, touched));
  };
  const passed = new Set(candidates.filter(deletable));
  return {
    recorded: new Set(
      shown.recorded.filter((item) => passed.has(transactionKey(item.entry))).map((item) => item.entry.id),
    ),
  };
}
