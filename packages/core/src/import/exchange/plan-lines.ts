// The estimate line (docs/DOMAIN.md §3.13, "Lines that ask for a change"): a Log row of one-tap estimates for a month
// that the file leaves while a purchase made after the month's reach counts for another month or as an extra buy. This
// module finds the rows that pass the cheap tests; `importRemedies` keeps those whose change, made as the Log makes it,
// records the purchases by the row's estimates and keeps every other date group.
import { IMPORT_ESTIMATE_CHECKS, IMPORT_MATCH_DAYS } from '../../constants';
import {
  addDays,
  addMonthsToKey,
  type CalendarDate,
  clampDay,
  dateParts,
  type MonthKey,
  monthStart,
} from '../../dates/calendar';
import { transactionKey } from '../../log/group';
import { slots } from '../../plan/slots';
import { liveEntries } from '../../plan/statuses';
import { compareEntries } from '../../portfolio/lots';
import { type Entry, isEstimate } from '../../schema/entry';
import type { Plan } from '../../schema/plan';
import type { ExchangeImportPlan } from './plan';

export type EstimateLine = {
  /** The row's estimates the file leaves, one per coin, in the plan's coin order. */
  readonly estimates: readonly Entry[];
  readonly month: MonthKey;
  readonly date: CalendarDate;
  /** Each coin's purchases on `date` as this import adds them. */
  readonly added: readonly Entry[];
  /** The month they count for; null for extra buys. */
  readonly other: MonthKey | null;
};

/** The due date of the month after `key`, as `slots` gives it (never the first buy's month). */
function nextDue(plan: Plan, key: MonthKey): CalendarDate {
  const { year, month } = dateParts(monthStart(addMonthsToKey(key, 1)));
  return clampDay(year, month, plan.buyDay);
}

/**
 * The Log's rows of live one-tap monthly estimates for a month S of the plan, newest first, that hold estimates the file
 * leaves, each its coin's only live estimate for S, when every such coin's earliest purchase this import adds after S's
 * reach (its due date + `IMPORT_MATCH_DAYS`) and before the next month's due date falls on one date D, and the coins'
 * purchases on D are all monthly buys for one month or all extra buys. At most `IMPORT_ESTIMATE_CHECKS` rows.
 */
export function estimateLines(
  stored: { readonly plan: Plan; readonly entries: readonly Entry[] },
  shown: ExchangeImportPlan,
): EstimateLine[] {
  const { plan } = stored;
  const dues = new Map(slots(plan).map((slot) => [slot.key, slot.due]));
  const live = liveEntries(stored.entries).sort(compareEntries).reverse();
  const taps = live.filter((entry) => entry.kind === 'dca' && isEstimate(entry));
  const replaced = new Set(shown.replaced.flatMap((item) => item.estimates.map((each) => each.id)));
  const bought = shown.entries.filter((entry) => entry.kind === 'dca' || entry.kind === 'extra');
  const rows = new Map<string, Entry[]>();
  for (const entry of live) rows.set(transactionKey(entry), [...(rows.get(transactionKey(entry)) ?? []), entry]);
  const lines: EstimateLine[] = [];
  for (const key of new Set(taps.map(transactionKey))) {
    const row = rows.get(key) as Entry[];
    const [first] = row as [Entry];
    const due = dues.get(first.slot as MonthKey);
    if (due === undefined || row.some((entry) => !taps.includes(entry))) continue;
    const staying = plan.coins.flatMap((coin) =>
      row.filter((entry) => entry.coin === coin.id && !replaced.has(entry.id)),
    );
    const only = (estimate: Entry) =>
      taps.filter((entry) => entry.coin === estimate.coin && entry.slot === estimate.slot).length === 1;
    const after = addDays(due, IMPORT_MATCH_DAYS);
    const before = nextDue(plan, first.slot as MonthKey);
    const earliest = staying.map(
      (estimate) =>
        bought
          .filter((entry) => entry.coin === estimate.coin && entry.date > after && entry.date < before)
          .sort(compareEntries)[0]?.date,
    );
    const date = earliest[0];
    if (date === undefined || !staying.every(only) || earliest.some((each) => each !== date)) continue;
    const added = bought.filter((entry) => entry.date === date && staying.some((each) => each.coin === entry.coin));
    const [one] = added as [Entry];
    const other = one.kind === 'dca' ? one.slot : null;
    if (added.some((entry) => (entry.kind === 'dca' ? entry.slot : null) !== other)) continue;
    lines.push({ estimates: staying, month: first.slot as MonthKey, date, added, other });
  }
  return lines.slice(0, IMPORT_ESTIMATE_CHECKS);
}
