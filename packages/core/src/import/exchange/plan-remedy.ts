// The exchange import's lines that ask for a change in the Log (docs/DOMAIN.md §3.13, "Lines that ask for a change"):
// each shows only when the change, made as the Log makes it, and the file planned again end as the line says and keep
// every other date group, on the Log as shown and on the Log after importing the shown plan first. Delete entry, for the
// sentence under `Matching entries`; Edit entry and Record a purchase, for the starting amount's line.
import {
  deleteEntries,
  saveTransaction,
  slotsAtDelete,
  storedOver,
  type TransactionDraft,
  uncoveredSale,
} from '../../actions/entries';
import { keepSources } from '../../actions/rows';
import { IMPORT_RECORDED_CHECKS, IMPORT_REMEDY_MAX_MOVEMENTS } from '../../constants';
import type { CalendarDate, MonthKey } from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { abs, compare, isZero, type Money, minus, sum, type Units } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { liveEntries } from '../../plan/statuses';
import { assertNever } from '../../result';
import type { Entry } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import { applyExchangeImport } from './apply';
import type { ExchangeFile, Movement } from './kraken';
import { type ExchangeImportPlan, type ImportContext, leftOutBefore, planExchangeImport } from './plan';
import { HAND } from './plan-claims';
import { type EstimateLine, estimateLines } from './plan-lines';

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

/** The starting line's instruction: change a row of lumps to `date`, or record the starting amount on it. */
export type StartingRemedy = { readonly kind: 'change' | 'record'; readonly date: CalendarDate };
export type ImportRemedies = {
  readonly recorded: ReadonlySet<EntityId>;
  readonly starting: StartingRemedy | null;
  readonly estimates: readonly EstimateLine[];
};

/**
 * A coin's movements of one role on one date that no stored entry holds and the plan considers (`leftOutBefore`: none in
 * another currency), summed, with each movement's units.
 */
type Group = {
  readonly date: CalendarDate;
  readonly amount: Money;
  readonly units: Units;
  readonly each: readonly Units[];
  readonly ids: readonly EntityId[];
};
type GroupOf = (coin: CoinId, date: CalendarDate, role: Movement['role']) => Group;
function groupsOf(file: ExchangeFile, stored: Stored, context: ImportContext): GroupOf {
  const known = new Set(stored.entries.map((entry) => entry.id));
  return (coin, date, role) => {
    const movements = file.movements
      .filter((movement) => movement.coin === coin && movement.role === role && context.dateOf(movement.at) === date)
      .filter((movement) => !known.has(context.idOf(movement.key)) && leftOutBefore(stored.plan, movement) === null);
    const each = movements.map((movement) => movement.units);
    const amount = sum(movements.map((movement) => movement.amount as Money));
    return { date, amount, units: sum(each), each, ids: movements.map((movement) => context.idOf(movement.key)) };
  };
}
/** A change that passed the cheap tests, made on either order's Log, and the groups it touches. */
type Remedy<T> = {
  readonly line: T;
  readonly change: (entries: readonly Entry[]) => LogChange;
  readonly touched: readonly Touched[];
};

const rowOf = (entries: readonly Entry[], key: string) =>
  liveEntries(entries).filter((entry) => transactionKey(entry) === key);

/**
 * The starting line's instructions that pass the cheap tests, record first, then the Log's rows of lumps newest first
 * (at most `IMPORT_RECORDED_CHECKS`). d* of a coin is its named date group or a date its considered lump records, the
 * one whose amount is nearest the target (the lump's amount, or the coin's part of the starting amount when no lump is
 * live), the earlier on a tie; it counts only when named and its amount is no nearer the coin's monthly part than the
 * target. Record needs every coin with a starting part to have d* on one date that no hand `held` entry guards; a
 * change, every lump of the row.
 */
export function startingRemedies(
  file: ExchangeFile,
  stored: Stored,
  shown: ExchangeImportPlan,
  context: ImportContext,
): Remedy<StartingRemedy>[] {
  const starting = shown.startingAmount;
  if (starting === null) return [];
  const groupOf = groupsOf(file, stored, context);
  const { plan } = stored;
  const monthly = plannedParts(plan, plan.monthlyAmount);
  const pick = (coin: CoinId, target: Money, recorded: readonly CalendarDate[]) => {
    const named = starting.items.filter((item) => item.coin === coin).map((item) => item.date);
    if (named.length === 0) return null;
    const off = (amount: Money, from: Money) => abs(minus(amount, from));
    const groups = [...new Set([...named, ...recorded])].sort().map((date) => groupOf(coin, date, 'purchase'));
    const best = groups.reduce((a, b) => (compare(off(b.amount, target), off(a.amount, target)) < 0 ? b : a));
    const part = monthly.find((each) => each.coin === coin)?.amount ?? ('0' as Money);
    const counts = named.includes(best.date) && compare(off(best.amount, target), off(best.amount, part)) <= 0;
    return counts ? best : null;
  };
  const shared = (picks: readonly (Group | null)[]) => {
    const date = picks[0]?.date;
    return date !== undefined && picks.every((each) => each?.date === date) ? date : null;
  };
  const remedies: Remedy<StartingRemedy>[] = [];
  const live = liveEntries(stored.entries);
  if (starting.lumps.length === 0) {
    const parts = plannedParts(plan, plan.startingAmount);
    const picks = parts.map((part) => pick(part.coin, part.amount, []));
    const date = shared(picks);
    const groups = picks as Group[];
    // Step 4's test: a hand `held` entry that guards d* would leave it out once recorded.
    const held = (coin: CoinId, group: Group) =>
      live.some(
        (entry) =>
          entry.kind === 'held' &&
          entry.coin === coin &&
          entry.source !== 'import-csv' &&
          group.date <= entry.date &&
          !(entry.amount !== null && isZero(entry.amount)) &&
          group.each.some((units) => compare(units, entry.units as Units) <= 0),
      );
    if (date !== null && !parts.some((part, index) => held(part.coin, groups[index] as Group))) {
      const rows = parts.map((part, index) => {
        const { amount, units } = groups[index] as Group;
        return { coin: part.coin, amount, units };
      });
      const draft = { kind: 'lump', date, slot: null, fee: null, note: '', venue: null, rows } as const;
      const touched = parts.map((part, index) => ({
        coin: part.coin,
        date,
        ids: (groups[index] as Group).ids,
        end: { recordedBy: context.idOf(`remedy|starting|${part.coin}`) },
      }));
      remedies.push({ line: { kind: 'record', date }, change: () => ({ kind: 'record', draft }), touched });
    }
  }
  const keys = [...new Set(starting.lumps.map(transactionKey))].reverse().slice(0, IMPORT_RECORDED_CHECKS);
  for (const key of keys) {
    const row = starting.lumps.filter((entry) => transactionKey(entry) === key);
    const dates = (entry: Entry) =>
      shown.recorded.filter((item) => item.entry.id === entry.id).flatMap((item) => item.dates);
    const picks = row.map((entry) => pick(entry.coin, entry.amount as Money, dates(entry)));
    const date = shared(picks);
    if (date === null) continue;
    const groups = picks as Group[];
    const figures = new Map(row.map((entry, index) => [entry.id, groups[index] as Group]));
    const touched = row.flatMap((entry, index): Touched[] => [
      { coin: entry.coin, date, ids: (groups[index] as Group).ids, end: { recordedBy: entry.id } },
      ...dates(entry)
        .filter((each) => each !== date)
        .map((each) => ({
          coin: entry.coin,
          date: each,
          ids: groupOf(entry.coin, each, 'purchase').ids,
          end: 'any' as const,
        })),
    ]);
    const change = (entries: readonly Entry[]): LogChange => ({
      kind: 'edit',
      row: rowOf(entries, key),
      date,
      figures,
    });
    remedies.push({ line: { kind: 'change', date }, change, touched });
  }
  return remedies;
}

/**
 * The entries of `Matching entries` whose Log row may be deleted to import the file's instead, checked in both orders the
 * person may follow the sentence: on the Log as shown (planned unticked), and on the Log after importing the shown plan
 * (planned with the box as set) first, unless that import is refused. In each, the row (the live entries with the item's
 * `transactionKey`) holds no `lump`, every entry of it is a hand entry that records a date of the file, the Log deletes
 * it, and the file planned again with the box unticked, as choosing it again opens the preview, adds every date the row
 * records (a monthly buy's as monthly buys for its month) and keeps every other date group. `starting` is the first of
 * `startingRemedies` that, made in both orders, records d* by the lump and keeps every other date group. At most
 * `IMPORT_RECORDED_CHECKS` rows are checked for each line, in the Log's order (`IMPORT_ESTIMATE_CHECKS` for the estimate
 * line), and none for a file of more than `IMPORT_REMEDY_MAX_MOVEMENTS` movements; nothing is planned again when no row
 * can pass. Planned with no venue, since no step reads one.
 */
export function importRemedies(
  file: ExchangeFile,
  stored: Stored,
  addHeld: boolean,
  context: ImportContext,
): ImportRemedies {
  const none = { recorded: new Set<EntityId>(), starting: null, estimates: [] };
  if (file.movements.length > IMPORT_REMEDY_MAX_MOVEMENTS) return none;
  const shown = planExchangeImport(file, stored, { venue: null, addHeld }, context);
  const records = new Set(shown.recorded.map((item) => item.entry.id));
  const candidate = (row: readonly Entry[]) =>
    !row.some((entry) => entry.kind === 'lump' || !HAND.has(entry.source) || !records.has(entry.id));
  const keys = [...new Set(shown.recorded.map((item) => transactionKey(item.entry)))].slice(0, IMPORT_RECORDED_CHECKS);
  const candidates = keys.filter((key) => candidate(rowOf(stored.entries, key)));
  const starts = startingRemedies(file, stored, shown, context);
  const lines = estimateLines(stored, shown);
  if (candidates.length === 0 && starts.length === 0 && lines.length === 0) return none;

  const anew = (entries: readonly Entry[]) =>
    planExchangeImport(file, { plan: stored.plan, entries }, { venue: null, addHeld: false }, context);
  const imported = applyExchangeImport(stored.entries, shown, context.now);
  // Choosing the file again opens it unticked, so the Log as shown is compared unticked too.
  const orders = [
    { entries: stored.entries, shown: addHeld ? anew(stored.entries) : shown },
    ...(imported.refused === null ? [{ entries: imported.entries, shown: anew(imported.entries) }] : []),
  ];
  const groupOf = groupsOf(file, stored, context);
  const idsOn = (item: ExchangeImportPlan['recorded'][number], date: CalendarDate) =>
    groupOf(item.coin, date, item.entry.kind === 'sell' ? 'sale' : 'purchase').ids;
  const holds = (log: (typeof orders)[number], change: LogChange, touched: readonly Touched[]) => {
    const entries = changedLog({ plan: stored.plan, entries: log.entries }, change, context);
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
    return orders.every((log) => {
      const own = rowOf(log.entries, key);
      return candidate(own) && holds(log, { kind: 'delete', ids: own.map((entry) => entry.id) }, touched);
    });
  };
  const passed = new Set(candidates.filter(deletable));
  const starting = starts.find((each) => orders.every((log) => holds(log, each.change(log.entries), each.touched)));
  // The estimate line's words say "before you import", so its change is checked on the Log as shown only: the row dated
  // D, each staying estimate taking its coin's purchases on D, recorded by it once the file is chosen again.
  const ofCoin = (line: EstimateLine, estimate: Entry) => line.added.filter((entry) => entry.coin === estimate.coin);
  const estimates = lines.filter((line) => {
    const figures = new Map(
      line.estimates.map((each) => {
        const added = ofCoin(line, each);
        return [each.id, { amount: sum(added.map((e) => e.amount as Money)), units: sum(added.map((e) => e.units)) }];
      }),
    );
    const row = rowOf(stored.entries, transactionKey(line.estimates[0] as Entry));
    const touched = line.estimates.map((each) => ({
      coin: each.coin,
      date: line.date,
      ids: ofCoin(line, each).map((entry) => entry.id),
      end: { recordedBy: each.id },
    }));
    return holds(orders[0] as (typeof orders)[number], { kind: 'edit', row, date: line.date, figures }, touched);
  });
  return {
    recorded: new Set(
      shown.recorded.filter((item) => passed.has(transactionKey(item.entry))).map((item) => item.entry.id),
    ),
    starting: starting?.line ?? null,
    estimates,
  };
}
