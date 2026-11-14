// The exchange import's lines that ask for a change in the Log (docs/DOMAIN.md §3.13, "Lines that ask for a change"):
// each shows only when the change, made as the Log makes it, and the file planned again end as the line says and keep
// every other date group. This branch checks Delete entry, for the sentence under `Matching entries`.
import { deleteEntries, slotsAtDelete, storedOver, uncoveredSale } from '../../actions/entries';
import { IMPORT_RECORDED_CHECKS } from '../../constants';
import type { CalendarDate, MonthKey } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { liveEntries } from '../../plan/statuses';
import type { Entry } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ExchangeFile } from './kraken';
import { type ExchangeImportPlan, type ImportContext, planExchangeImport } from './plan';
import { HAND } from './plan-claims';

export type Stored = { readonly plan: Plan; readonly entries: readonly Entry[] };
/** A change made with the Log's own controls; this branch has Delete entry (the whole row). */
export type LogChange = { readonly kind: 'delete'; readonly ids: readonly EntityId[] };

/** The stored entries after `change`, as the Log writes it, or null when the Log refuses it (`uncoveredSale`). */
export function changedLog(stored: Stored, change: LogChange, context: ImportContext): readonly Entry[] | null {
  const before = slotsAtDelete(stored.plan, stored.entries, change.ids, context.now);
  const deleted = deleteEntries(stored.entries, before.ids, before.at);
  return uncoveredSale(stored.entries, deleted) === null ? storedOver(stored.entries, deleted) : null;
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
 * The entries of `Matching entries` whose Log row may be deleted to import the file's instead: the row holds no `lump`,
 * every entry of it is a hand entry that records a date of the file, the Log deletes it, and the file planned again adds
 * every date the row records (a monthly buy's as monthly buys for its month) and keeps every other date group. At most
 * `IMPORT_RECORDED_CHECKS` rows are checked, in the section's order. Planned with no venue, since no step reads one.
 */
export function importRemedies(
  file: ExchangeFile,
  stored: Stored,
  addHeld: boolean,
  context: ImportContext,
): ImportRemedies {
  const choices = { venue: null, addHeld };
  const shown = planExchangeImport(file, stored, choices, context);
  const live = liveEntries(stored.entries);
  const known = new Set(stored.entries.map((entry) => entry.id));
  const records = new Set(shown.recorded.map((item) => item.entry.id));
  const idsOn = (item: ExchangeImportPlan['recorded'][number], date: CalendarDate) =>
    file.movements
      .filter((movement) => movement.coin === item.coin && context.dateOf(movement.at) === date)
      .filter((movement) => movement.role === (item.entry.kind === 'sell' ? 'sale' : 'purchase'))
      .map((movement) => context.idOf(movement.key))
      .filter((id) => !known.has(id));
  const deletable = (key: string) => {
    const row = live.filter((entry) => transactionKey(entry) === key);
    if (row.some((entry) => entry.kind === 'lump' || !HAND.has(entry.source) || !records.has(entry.id))) return false;
    const entries = changedLog(stored, { kind: 'delete', ids: row.map((entry) => entry.id) }, context);
    if (entries === null) return false;
    const again = planExchangeImport(file, { plan: stored.plan, entries }, choices, context);
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
    return keepsPromise(shown, again, touched);
  };
  const checked = new Map<string, boolean>();
  const recorded = new Set<EntityId>();
  for (const item of shown.recorded) {
    const key = transactionKey(item.entry);
    if (!checked.has(key) && checked.size < IMPORT_RECORDED_CHECKS) checked.set(key, deletable(key));
    if (checked.get(key) === true) recorded.add(item.entry.id);
  }
  return { recorded };
}
