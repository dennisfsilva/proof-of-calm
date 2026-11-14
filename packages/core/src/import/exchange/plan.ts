// The exchange import's plan (docs/DOMAIN.md §3.13): which of a file's movements become entries, which replace a
// one-tap estimate, which look recorded already and which are left out, and why. Pure: "The shell dates each instant
// in the device's zone, `dateOf = (at) => todayIn(epochMs(at), clock.timeZone)`; the core never dates an instant."
import { IMPORT_MATCH_DAYS, IMPORT_TYPED_DAYS } from '../../constants';
import { type CalendarDate, compareDates, daysBetween, type Instant, type MonthKey } from '../../dates/calendar';
import { compare, type Money, plus, round, type Units } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { liveEntries, type SlotStatus, slotStatuses } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import { type Entry, isEstimate } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ExchangeFile, LeftOutRow, Movement } from './kraken';
import { claimRecorded, type Recorded } from './plan-claims';
import { type Day, type HeldCoin, heldGuard, startingGuard } from './plan-guards';

export type { Recorded } from './plan-claims';

export type ImportChoices = { readonly venue: string | null; readonly addHeld: boolean };

export type ImportContext = {
  readonly today: CalendarDate;
  readonly now: Instant;
  readonly dateOf: (at: Instant) => CalendarDate;
  readonly idOf: (key: string) => EntityId;
};

const REASONS = [
  'currency',
  'not-in-plan',
  'reward',
  'coin-deposit',
  'conversion',
  'cash',
  'benefit',
  'within',
  'unpaired',
  'unreadable',
  'other',
] as const;
export type ImportLeftOutReason = (typeof REASONS)[number];
type Named = { readonly key: string; count: number; units: Units | null };
export type ImportLeftOut = { readonly reason: ImportLeftOutReason; count: number; lines: number[]; by: Named[] };
export type CoinUnits = { readonly coin: string; units: Units; count: number };

export type ExchangeImportPlan = {
  readonly entries: readonly Entry[];
  readonly replaced: readonly { readonly estimates: readonly Entry[]; readonly by: readonly EntityId[] }[];
  readonly recorded: readonly Recorded[];
  readonly held: { readonly added: boolean; readonly coins: readonly HeldCoin[] } | null;
  readonly startingAmount: {
    readonly purchases: number;
    readonly firstBuy: CalendarDate;
    readonly through: CalendarDate;
    /** Each purchase left out, in date order. */
    readonly items: readonly {
      readonly coin: CoinId;
      readonly date: CalendarDate;
      readonly units: Units;
      readonly amount: Money;
    }[];
    /** The live lumps, in `compareEntries` order. */
    readonly lumps: readonly Entry[];
  } | null;
  /**
   * Live entries an earlier import stored that this file pairs with a cancellation, each a monthly buy with its coin's
   * tombstoned one-tap estimates for its month when deleting the named entries leaves that month no monthly buy.
   */
  readonly cancelled: readonly { readonly entry: Entry; readonly estimates: readonly Entry[] }[];
  /** Receipts an earlier import stored whose live entry holds fewer units than the file now gives (`units`), with the date
   * the file now gives them (`date`), which the line names when the entry holds another. */
  readonly short: readonly { readonly entry: Entry; readonly units: Units; readonly date: CalendarDate }[];
  readonly withdrawals: { readonly logged: readonly CoinUnits[]; readonly notLogged: readonly CoinUnits[] };
  readonly leftOut: readonly ImportLeftOut[];
  readonly noneInCurrency: readonly string[] | null;
  readonly imported: number;
  readonly deleted: number;
  readonly unitsCut: number;
  readonly feesInCoin: number;
};

const KIND = { purchase: 'extra', sale: 'sell', receipt: 'held' } as const;

/**
 * "A purchase date's month is the plan's month with the anchor nearest it, the earlier month on a tie: a month's due
 * date reaches 15 days either side (`IMPORT_MATCH_DAYS`), and each one-tap monthly estimate of the coin for that
 * month, live or tombstoned, reaches from 3 days before its date (`IMPORT_TYPED_DAYS`) to the day after; a date no
 * anchor reaches makes an extra buy." `entries` are the stored ones, tombstones included, so a tombstoned estimate
 * keeps dating its month; the months are in date order, so a tie keeps the earlier. Each coin and date's month is worked
 * out once per plan, and the estimates are keyed by coin and month, so a long file with many typed entries stays fast.
 */
function monthsOf(months: readonly SlotStatus[], entries: readonly Entry[]) {
  const taps = new Map<string, CalendarDate[]>();
  for (const tap of entries.filter((entry) => isEstimate(entry) && entry.kind === 'dca')) {
    const key = `${tap.coin}|${tap.slot}`;
    taps.set(key, [...(taps.get(key) ?? []), tap.date]);
  }
  const known = new Map<string, MonthKey | undefined>();
  const find = (coin: CoinId, date: CalendarDate) => {
    let best: { readonly key: MonthKey; readonly off: number } | null = null;
    for (const { key, due } of months) {
      const anchors = [
        { at: due, before: IMPORT_MATCH_DAYS, after: IMPORT_MATCH_DAYS },
        ...(taps.get(`${coin}|${key}`) ?? []).map((at) => ({ at, before: IMPORT_TYPED_DAYS, after: 1 })),
      ];
      for (const { at, before, after } of anchors) {
        const off = daysBetween(at, date);
        if (off >= -before && off <= after && (best === null || Math.abs(off) < best.off))
          best = { key, off: Math.abs(off) };
      }
    }
    return best?.key;
  };
  return (coin: CoinId, date: CalendarDate) => {
    const key = `${coin}|${date}`;
    if (!known.has(key)) known.set(key, find(coin, date));
    return known.get(key);
  };
}

function tally(groups: Map<string, CoinUnits>, coin: string, units: Units) {
  const group = groups.get(coin);
  if (group === undefined) groups.set(coin, { coin, units, count: 1 });
  else [group.units, group.count] = [plus(group.units, units), group.count + 1];
}

/** The rows left out, by reason: each reason's lines and its count per currency or coin. */
function leftOutGroups() {
  const groups = new Map<ImportLeftOutReason, ImportLeftOut>();
  const leave = (reason: ImportLeftOutReason, lines: readonly number[], key: string | null, units: Units | null) => {
    const group = groups.get(reason) ?? { reason, count: 0, lines: [], by: [] };
    groups.set(reason, group);
    group.count += 1;
    group.lines.push(...lines);
    const named = group.by.find((each) => each.key === key);
    if (key === null) return;
    if (named === undefined) group.by.push({ key, count: 1, units });
    else
      [named.count, named.units] = [named.count + 1, named.units === null ? null : plus(named.units, units as Units)];
  };
  const list = () =>
    REASONS.flatMap((reason) => groups.get(reason) ?? []).map((group) => ({
      ...group,
      lines: group.lines.sort((a, b) => a - b),
    }));
  return { leave, list };
}

/** The places the preview shows a coin's units at: its decimals in the plan, 8 for a coin it does not list. */
export const shownPlaces = (plan: Plan, coin: string) => plan.coins.find((each) => each.id === coin)?.decimals ?? 8;
/** Units as the preview shows them, rounded half-even at `shownPlaces`: the figure a person reads and types. */
const shown = (plan: Plan, coin: string, value: Units) => round(value, shownPlaces(plan, coin), 'half-even');

/**
 * "A withdrawal has a move in the Log when a live move of its coin, sent from the import's venue, is dated within 1
 * day of it and sends its units (amount plus fee), both rounded half-even at the places the preview shows". Each move
 * answers one withdrawal.
 */
function withdrawals(
  rows: readonly LeftOutRow[],
  live: readonly Entry[],
  plan: Plan,
  venue: string | null,
  context: ImportContext,
) {
  const moves = live.filter((entry) => entry.kind === 'move' && entry.venue === venue);
  const [logged, notLogged] = [new Map<string, CoinUnits>(), new Map<string, CoinUnits>()];
  for (const row of rows.filter((each) => each.reason === 'coin-withdrawal')) {
    const [coin, units, date] = [row.coin as string, row.units as Units, context.dateOf(row.at as Instant)];
    const index = moves.findIndex(
      (move) =>
        move.coin === coin &&
        Math.abs(daysBetween(move.date, date)) <= 1 &&
        compare(shown(plan, coin, move.units), shown(plan, coin, units)) === 0,
    );
    moves.splice(index, index < 0 ? 0 : 1);
    tally(index < 0 ? notLogged : logged, coin, units);
  }
  return { logged: [...logged.values()], notLogged: [...notLogged.values()] };
}

export function planExchangeImport(
  file: ExchangeFile,
  stored: { readonly plan: Plan; readonly entries: readonly Entry[] },
  choices: ImportChoices,
  context: ImportContext,
): ExchangeImportPlan {
  const { plan } = stored;
  const known = new Map(stored.entries.map((entry) => [entry.id, entry]));
  const live = liveEntries(stored.entries);
  const { leave, list } = leftOutGroups();
  const days: Day[] = [];
  // The file's purchase dates an earlier import stored, live or tombstoned: step 2 counts them, never claims them.
  const earlier: Day[] = [];
  const counts = { imported: 0, deleted: 0, unitsCut: 0, feesInCoin: 0 };
  const short: { entry: Entry; units: Units; date: CalendarDate }[] = [];
  // "A trade a cancellation in the file pairs, whose id is a live entry, is named: delete it in the Log."
  const paired = file.cancelled.flatMap((movement) => {
    const entry = known.get(context.idOf(movement.key));
    return entry === undefined || entry.deletedAt !== null ? [] : [entry];
  });
  const put = (list: Day[], item: Day['items'][number], role: Movement['role']) => {
    const day = list.find((each) => each.coin === item.coin && each.role === role && each.date === item.date);
    if (day === undefined) list.push({ coin: item.coin, role, date: item.date, items: [item], claimed: list !== days });
    else day.items.push(item);
  };
  for (const movement of file.movements) {
    const id = context.idOf(movement.key);
    const entry = known.get(id);
    const coin = plan.coins.find((each) => each.id === movement.coin)?.id;
    const item = { movement, id, date: context.dateOf(movement.at), coin: coin as CoinId };
    if (entry !== undefined) {
      counts[entry.deletedAt === null ? 'imported' : 'deleted'] += 1;
      if (coin !== undefined && movement.role === 'purchase') put(earlier, item, movement.role);
      // "A receipt imported earlier whose live entry holds fewer units than the file now gives its key is named with
      // both figures: change its units in the Log." Step 1 only compares, at the places the preview shows, so the
      // figure the line names ends it once typed.
      const [was, now] = [shown(plan, movement.coin, entry.units), shown(plan, movement.coin, movement.units)];
      if (entry.deletedAt === null && movement.role === 'receipt' && compare(was, now) < 0)
        short.push({ entry, units: movement.units, date: item.date });
    } else if (movement.role !== 'receipt' && movement.currency !== plan.payCurrency)
      leave('currency', movement.lines, String(movement.currency), null);
    else if (coin === undefined) leave('not-in-plan', movement.lines, movement.coin, movement.units);
    else put(days, item, movement.role);
  }
  days.sort((a, b) => compareDates(a.date, b.date));
  const entries: Entry[] = [];
  const add = (day: Day, kind: Entry['kind'], slot: MonthKey | null, note: string) => {
    day.claimed = true;
    for (const { movement, id, date, coin } of day.items) {
      const receipt = movement.role === 'receipt';
      const [amount, fee] = receipt ? ['0' as Money, null] : [movement.amount, movement.fee];
      const { at: createdAt, units } = movement;
      const source = 'import-csv';
      entries.push({
        id,
        kind,
        date,
        coin,
        amount,
        units,
        fee,
        note,
        slot,
        venue: choices.venue,
        source,
        createdAt,
        updatedAt: context.now,
        deletedAt: null,
      });
      counts.unitsCut += Number(movement.unitsCut);
      counts.feesInCoin += Number(movement.feeInCoin);
    }
    return day.items.map((item) => item.id);
  };

  // Step 2 (plan-claims.ts): what the person recorded by hand claims first, so no later step stores it. The months'
  // skips and pauses come from the plan alone, so what the Log holds never changes a date's month.
  const months = slotStatuses(plan, [], context.today);
  const monthOf = monthsOf(months, stored.entries);
  const recorded = claimRecorded(plan, live, days, earlier, monthOf);

  // Steps 3 and 4 leave purchases out before any is stored: every purchase up to the first buy's 15 days in a plan
  // with a starting amount or of a coin with a live `lump` (only dates step 2 left), then those a `held` entry fits.
  const startingAmount = startingGuard(plan, live, days);
  const held = heldGuard(plan, live, days, choices.addHeld);

  // Steps 5 and 6: "every unclaimed purchase date of C whose month is S is a monthly buy for S when C's share is above
  // 0 and S is neither skipped nor paused, or when the Log holds a one-tap estimate of C for S, live or tombstoned";
  // each takes the note of C's first estimate for S in `compareEntries` order, and C's live estimates for S are
  // tombstoned once a date is added for them. Every other purchase is an extra buy.
  const shares = new Set(plannedParts(plan, plan.monthlyAmount).map((part) => part.coin));
  const open = new Set(
    months.filter((each) => each.status !== 'skipped' && each.status !== 'paused').map((m) => m.key),
  );
  const taps = stored.entries.filter((entry) => isEstimate(entry) && entry.kind === 'dca').sort(compareEntries);
  const groups = new Map<string, { estimates: Entry[]; by: EntityId[] }>();
  for (const estimate of live
    .filter((entry) => isEstimate(entry) && entry.kind === 'dca')
    .sort((a, b) => compareDates(a.slot as MonthKey, b.slot as MonthKey) || compareEntries(a, b))) {
    const key = `${estimate.coin}|${estimate.slot}`;
    const group = groups.get(key) ?? { estimates: [], by: [] };
    groups.set(key, group);
    group.estimates.push(estimate);
  }
  for (const day of days.filter((each) => !each.claimed && each.role === 'purchase')) {
    const slot = monthOf(day.coin, day.date);
    if (slot === undefined) continue;
    const tapped = taps.filter((tap) => tap.coin === day.coin && tap.slot === slot);
    if (tapped.length === 0 && !(shares.has(day.coin) && open.has(slot))) continue;
    const by = add(day, 'dca', slot, tapped[0]?.note ?? '');
    groups.get(`${day.coin}|${slot}`)?.by.push(...by);
  }
  const replaced = [...groups.values()].filter((group) => group.by.length > 0);
  for (const day of days.filter((each) => !each.claimed)) add(day, KIND[day.role], null, '');

  // The import never brings a tombstone back: a named monthly buy carries C's tombstoned estimates for its month when,
  // once this import adds its entries and the person deletes the named ones, no live monthly buy of C for it is left.
  const gone = new Set(paired.map((entry) => entry.id));
  const kept = (entry: Entry) =>
    [...live, ...entries].some(
      (other) => other.kind === 'dca' && other.coin === entry.coin && other.slot === entry.slot && !gone.has(other.id),
    );
  const cancelled = paired.map((entry) => ({
    entry,
    estimates:
      entry.kind !== 'dca' || kept(entry)
        ? []
        : taps.filter((tap) => tap.deletedAt !== null && tap.coin === entry.coin && tap.slot === entry.slot),
  }));

  for (const row of file.leftOut)
    if (row.reason !== 'coin-withdrawal') leave(row.reason, row.lines, row.coin, row.units);
  const currencies = new Set(file.movements.flatMap((movement) => movement.currency ?? []));
  return {
    entries: entries.sort(compareEntries),
    replaced,
    recorded,
    held,
    startingAmount,
    cancelled,
    short,
    withdrawals: withdrawals(file.leftOut, live, plan, choices.venue, context),
    leftOut: list(),
    noneInCurrency: currencies.size === 0 || currencies.has(plan.payCurrency) ? null : [...currencies].sort(),
    ...counts,
  };
}
