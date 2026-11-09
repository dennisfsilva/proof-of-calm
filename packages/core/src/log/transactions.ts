// The Log (docs/DOMAIN.md §3.9), ported from the prototype's transactions(): one row per transaction,
// newest first, with skipped months merged in where the buy would have been, and month headers.
import {
  type CalendarDate,
  clampDay,
  compareDates,
  dateParts,
  type MonthKey,
  monthKey,
  monthStart,
} from '../dates/calendar';
import { type HoldingStatus, holdingStatus } from '../holding/eligible-from';
import { compare, type Money, sum } from '../money/decimal';
import { slots } from '../plan/slots';
import { liveEntries } from '../plan/statuses';
import { entryRole } from '../portfolio/effect';
import { DEFAULT_HOLDING_CONTEXT, type HoldingContext } from '../portfolio/eligibility';
import { type Entry, type EntryKind, recordedAmounts } from '../schema/entry';
import type { Plan, Skip } from '../schema/plan';
import { transactionKey } from './group';

export type TransactionRow = {
  readonly type: 'transaction';
  readonly key: string;
  readonly kind: EntryKind;
  readonly date: CalendarDate;
  readonly slot: MonthKey | null;
  /** Largest amount first; an item with no recorded cost (`held`) last. */
  readonly items: readonly Entry[];
  /** The recorded costs summed; null when no item has one. */
  readonly total: Money | null;
  readonly fees: Money;
  /** For buys, the holding status of the first item; for sales, null. */
  readonly holding: HoldingStatus | null;
};

export type SkipRow = {
  readonly type: 'skip';
  readonly key: string;
  /** The due date of the skipped slot, so the row sits where the buy would have been. */
  readonly date: CalendarDate;
  readonly slot: MonthKey;
  readonly skip: Skip;
};

export type LogRow = TransactionRow | SkipRow;

export type MonthHeader = { readonly month: MonthKey; readonly bought: Money; readonly sold: Money };

export type Log = { readonly rows: readonly LogRow[]; readonly months: readonly MonthHeader[] };

function skipDate(plan: Plan, slot: MonthKey): CalendarDate {
  const planned = slots(plan).find((candidate) => candidate.key === slot);
  if (planned !== undefined) return planned.due;
  // The plan's dates changed after the skip: place it on the month's buy day.
  const { year, month } = dateParts(monthStart(slot));
  return clampDay(year, month, plan.buyDay);
}

/** Largest amount first, an entry with no recorded cost after every one with a cost. */
function byAmount(a: Entry, b: Entry): number {
  if (a.amount === null || b.amount === null) return Number(a.amount === null) - Number(b.amount === null);
  return compare(b.amount, a.amount);
}

export function transactions(
  plan: Plan,
  entries: readonly Entry[],
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): Log {
  const groups = new Map<string, Entry[]>();
  for (const entry of liveEntries(entries)) {
    const key = transactionKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const rows: LogRow[] = [...groups.entries()].map(([key, group]): TransactionRow => {
    const items = [...group].sort(byAmount);
    const costs = recordedAmounts(items);
    const first = items[0] as Entry;
    return {
      type: 'transaction',
      key,
      kind: first.kind,
      date: first.date,
      slot: first.kind === 'dca' ? first.slot : null,
      items,
      total: costs.length === 0 ? null : sum(costs),
      fees: sum(items.map((entry) => entry.fee ?? ('0' as Money))),
      holding:
        entryRole(first.kind) !== 'purchase' ? null : holdingStatus(first.date, plan.holdingRule, context.overrides),
    };
  });
  for (const skip of plan.skips) {
    const date = skipDate(plan, skip.slot);
    rows.push({ type: 'skip', key: `skip|${date}|${skip.slot}`, date, slot: skip.slot, skip });
  }
  // Newest first, then by key descending; keys are unique, so no two rows tie.
  rows.sort((a, b) => compareDates(b.date, a.date) || (a.key < b.key ? 1 : -1));

  const months: MonthHeader[] = [];
  for (const row of rows) {
    const month = monthKey(row.date);
    let header = months.find((candidate) => candidate.month === month);
    if (header === undefined) {
      header = { month, bought: '0' as Money, sold: '0' as Money };
      months.push(header);
    }
    // Coins held were not bought in the month (a gift among them), as the plan's totals leave them out (§3.10).
    if (row.type === 'transaction' && row.kind !== 'held') {
      const index = months.indexOf(header);
      const total = sum(recordedAmounts(row.items));
      months[index] =
        entryRole(row.kind) === 'sale'
          ? { ...header, sold: sum([header.sold, total]) }
          : { ...header, bought: sum([header.bought, total]) };
    }
  }
  return { rows, months };
}
