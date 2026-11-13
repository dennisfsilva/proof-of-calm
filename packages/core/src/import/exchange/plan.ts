// The exchange import's plan (docs/DOMAIN.md §3.13): which of a file's movements become entries, which replace a
// one-tap estimate, which look recorded already and which are left out, and why. Pure: "The shell dates each instant
// in the device's zone, `dateOf = (at) => todayIn(epochMs(at), clock.timeZone)`; the core never dates an instant."
import { IMPORT_MATCH_DAYS, IMPORT_TYPED_DAYS } from '../../constants';
import {
  type CalendarDate,
  clampDay,
  compareDates,
  dateParts,
  daysBetween,
  type Instant,
  type MonthKey,
  monthKey,
  monthStart,
} from '../../dates/calendar';
import { compare, type Money, plus, sum, type Units } from '../../money/decimal';
import { plannedParts } from '../../plan/parts';
import { isOpen, liveEntries, type SlotStatus, slotStatuses } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import { type Entry, isEstimate } from '../../schema/entry';
import type { CoinId, EntityId } from '../../schema/ids';
import type { Plan } from '../../schema/plan';
import type { ExchangeFile, LeftOutRow, Movement } from './kraken';
import { type Day, type HeldCoin, heldGuard, near, startingGuard } from './plan-guards';

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
export type Recorded = {
  readonly date: CalendarDate;
  readonly coin: CoinId;
  readonly units: Units;
  readonly amount: Money | null;
  readonly count: number;
  readonly entry: Entry;
};

export type ExchangeImportPlan = {
  readonly entries: readonly Entry[];
  readonly replaced: readonly { readonly estimates: readonly Entry[]; readonly by: readonly EntityId[] }[];
  readonly recorded: readonly Recorded[];
  readonly held: { readonly added: boolean; readonly coins: readonly HeldCoin[] } | null;
  readonly startingAmount: { readonly purchases: number; readonly firstBuy: CalendarDate } | null;
  readonly withdrawals: { readonly logged: readonly CoinUnits[]; readonly notLogged: readonly CoinUnits[] };
  readonly leftOut: readonly ImportLeftOut[];
  readonly noneInCurrency: readonly string[] | null;
  readonly imported: number;
  readonly deleted: number;
  readonly unitsCut: number;
  readonly feesInCoin: number;
};

const HAND = new Set<Entry['source']>(['manual', 'import-prototype', 'import-json']);
const KIND = { purchase: 'extra', sale: 'sell', receipt: 'held' } as const;

/** The due date of a plan month, as `slots` gives it, for any month key. */
function dueOf(plan: Plan, key: MonthKey): CalendarDate {
  const { year, month } = dateParts(monthStart(key));
  return key === monthKey(plan.firstBuy) ? plan.firstBuy : clampDay(year, month, plan.buyDay);
}

/** The unclaimed day nearest `target` among those `accept` takes, the earlier on a tie (days are in date order). */
function nearest<T extends { readonly date: CalendarDate }>(
  days: readonly T[],
  target: CalendarDate,
  accept: (day: T) => boolean,
) {
  let best: T | null = null;
  for (const day of days) {
    if (!accept(day)) continue;
    if (best === null || Math.abs(daysBetween(target, day.date)) < Math.abs(daysBetween(target, best.date))) best = day;
  }
  return best;
}

/** The day nearest `date` within `span` days of it. */
const closest = (days: readonly Day[], date: CalendarDate, span: number) =>
  nearest(days, date, (day) => near(day, date, span));

/**
 * "A purchase date's month is the plan's month with the anchor nearest it, the earlier month on a tie: a month's due
 * date reaches 15 days either side (`IMPORT_MATCH_DAYS`), and each one-tap monthly estimate of the coin for that
 * month, live or tombstoned, reaches from 3 days before its date (`IMPORT_TYPED_DAYS`) to the day after; a date no
 * anchor reaches makes an extra buy." `entries` are the stored ones, tombstones included, so a tombstoned estimate
 * keeps dating its month; the months are in date order, so a tie keeps the earlier.
 */
function monthsOf(months: readonly SlotStatus[], entries: readonly Entry[]) {
  const taps = entries.filter((entry) => isEstimate(entry) && entry.kind === 'dca');
  return (coin: CoinId, date: CalendarDate) => {
    let best: { readonly key: MonthKey; readonly off: number } | null = null;
    for (const { key, due } of months) {
      const anchors = [
        { at: due, before: IMPORT_MATCH_DAYS, after: IMPORT_MATCH_DAYS },
        ...taps
          .filter((tap) => tap.coin === coin && tap.slot === key)
          .map((tap) => ({ at: tap.date, before: IMPORT_TYPED_DAYS, after: 1 })),
      ];
      for (const { at, before, after } of anchors) {
        const off = daysBetween(at, date);
        if (off >= -before && off <= after && (best === null || Math.abs(off) < best.off))
          best = { key, off: Math.abs(off) };
      }
    }
    return best?.key;
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

/**
 * "A withdrawal has a move in the Log when a live move of its coin, sent from the import's venue, is dated within 1
 * day of it and sends exactly its units (amount plus fee)". Each move answers one withdrawal.
 */
function withdrawals(
  rows: readonly LeftOutRow[],
  live: readonly Entry[],
  venue: string | null,
  context: ImportContext,
) {
  const moves = live.filter((entry) => entry.kind === 'move' && entry.venue === venue);
  const [logged, notLogged] = [new Map<string, CoinUnits>(), new Map<string, CoinUnits>()];
  for (const row of rows.filter((each) => each.reason === 'coin-withdrawal')) {
    const [coin, units, date] = [row.coin as string, row.units as Units, context.dateOf(row.at as Instant)];
    const index = moves.findIndex(
      (move) => move.coin === coin && Math.abs(daysBetween(move.date, date)) <= 1 && compare(move.units, units) === 0,
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
  const counts = { imported: 0, deleted: 0, unitsCut: 0, feesInCoin: 0 };
  for (const movement of file.movements) {
    const id = context.idOf(movement.key);
    const entry = known.get(id);
    const coin = plan.coins.find((each) => each.id === movement.coin)?.id;
    if (entry !== undefined) counts[entry.deletedAt === null ? 'imported' : 'deleted'] += 1;
    else if (movement.role !== 'receipt' && movement.currency !== plan.payCurrency)
      leave('currency', movement.lines, String(movement.currency), null);
    else if (coin === undefined) leave('not-in-plan', movement.lines, movement.coin, movement.units);
    else {
      const item = { movement, id, date: context.dateOf(movement.at), coin };
      const day = days.find((each) => each.coin === coin && each.role === movement.role && each.date === item.date);
      if (day === undefined) days.push({ coin, role: movement.role, date: item.date, items: [item], claimed: false });
      else day.items.push(item);
    }
  }
  days.sort((a, b) => compareDates(a.date, b.date));
  const free = (coin: CoinId, role: Movement['role']) =>
    days.filter((d) => !d.claimed && d.coin === coin && d.role === role);
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

  // Step 2: "a live monthly buy of C for S claims C's purchase date nearest S's due within 15 days; every other
  // hand-recorded purchase or sale, and a monthly buy that claimed nothing, claims C's nearest date of the same role
  // within 3 days of its own date; the earlier date wins a tie". First, so no later step stores what one records.
  const recorded: Recorded[] = [];
  for (const entry of live
    .filter((each) => HAND.has(each.source) && each.kind !== 'held' && each.kind !== 'move')
    .sort(compareEntries)) {
    const purchases = free(entry.coin, 'purchase');
    const monthly = entry.slot === null ? null : closest(purchases, dueOf(plan, entry.slot), IMPORT_MATCH_DAYS);
    const typed = free(entry.coin, entry.kind === 'sell' ? 'sale' : 'purchase');
    const day = monthly ?? closest(typed, entry.date, IMPORT_TYPED_DAYS);
    if (day === null) continue;
    day.claimed = true;
    const units = sum(day.items.map((item) => item.movement.units));
    const amount = sum(day.items.map((item) => item.movement.amount as Money));
    recorded.push({ date: day.date, coin: day.coin, units, amount, count: day.items.length, entry });
  }

  // Steps 3 and 4 leave purchases out before any is stored: the starting amount's 15 days (only dates step 2 left),
  // then the purchases dated on or before a `held` entry the person added.
  const startingAmount = startingGuard(plan, days);
  const held = heldGuard(plan, live, days, choices.addHeld);

  // Step 5: "The live one-tap monthly estimates of coin C for month S take C's purchase date left whose month (step 6)
  // is S, nearest S's due date, the earlier on a tie." "The write tombstones them all and adds that date's purchases
  // as monthly buys for S, with the note of the first of them in `compareEntries` order".
  const months = slotStatuses(plan, stored.entries, context.today);
  const monthOf = monthsOf(months, stored.entries);
  const groups = new Map<string, Entry[]>();
  for (const estimate of live
    .filter((entry) => isEstimate(entry) && entry.kind === 'dca')
    .sort((a, b) => compareDates(a.slot as MonthKey, b.slot as MonthKey) || compareEntries(a, b))) {
    const key = `${estimate.coin}|${estimate.slot}`;
    groups.set(key, [...(groups.get(key) ?? []), estimate]);
  }
  const replaced: { estimates: Entry[]; by: EntityId[] }[] = [];
  for (const estimates of groups.values()) {
    const [{ coin, slot, note }] = estimates as [Entry, ...Entry[]];
    const accept = (each: Day) => monthOf(coin, each.date) === slot;
    const day = nearest(free(coin, 'purchase'), dueOf(plan, slot as MonthKey), accept);
    if (day !== null) replaced.push({ estimates, by: add(day, 'dca', slot, note) });
  }

  // Step 6: "for each plan coin with a share above 0 and each month that was late, due or upcoming before the import,
  // the coin's unclaimed purchase date nearest the due date, among the dates whose month it is, fills the month with
  // all its purchases; the coin's other purchases are extra buys."
  for (const { coin } of plannedParts(plan, plan.monthlyAmount)) {
    for (const slot of months.filter((each) => isOpen(each.status))) {
      const day = nearest(free(coin, 'purchase'), slot.due, (each) => monthOf(coin, each.date) === slot.key);
      if (day !== null) add(day, 'dca', slot.key, '');
    }
  }
  for (const day of days.filter((each) => !each.claimed)) add(day, KIND[day.role], null, '');

  for (const row of file.leftOut)
    if (row.reason !== 'coin-withdrawal') leave(row.reason, row.lines, row.coin, row.units);
  const currencies = new Set(file.movements.flatMap((movement) => movement.currency ?? []));
  return {
    entries: entries.sort(compareEntries),
    replaced,
    recorded,
    held,
    startingAmount,
    withdrawals: withdrawals(file.leftOut, live, choices.venue, context),
    leftOut: list(),
    noneInCurrency: currencies.size === 0 || currencies.has(plan.payCurrency) ? null : [...currencies].sort(),
    ...counts,
  };
}
