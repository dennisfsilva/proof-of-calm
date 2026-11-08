// Slot statuses (docs/DOMAIN.md §3.2) and the actions for today (§3.3), ported from the prototype's
// slotStatus(), focusSlot(), nowActions() and nextAction(), extended with skips and pauses.
import { type CalendarDate, compareDates, type MonthKey, minDate, monthKey } from '../dates/calendar';
import { isPositive, type Money, sum } from '../money/decimal';
import { type Entry, recordedAmounts } from '../schema/entry';
import type { Pause, Plan, Skip } from '../schema/plan';
import { type Slot, slots } from './slots';

/** Entries that count: soft-deleted ones stay only for the undo window and sync (§2.2). */
export function liveEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.deletedAt === null);
}

export type SlotStatus = Slot &
  (
    | {
        readonly status: 'done';
        readonly loggedAmount: Money;
        readonly loggedOn: CalendarDate;
        readonly entries: readonly Entry[];
      }
    | { readonly status: 'skipped'; readonly skip: Skip }
    | { readonly status: 'paused'; readonly pause: Pause }
    | { readonly status: 'late' | 'due' | 'upcoming' }
  );

/** The pause that contains `date`, if any. */
export function pauseOn(plan: Pick<Plan, 'pauses'>, date: CalendarDate): Pause | null {
  return plan.pauses.find((pause) => pause.from <= date && (pause.until === null || date <= pause.until)) ?? null;
}

/** First match wins: done, skipped, paused, late, due, upcoming. Nothing nags about skipped or paused slots. */
export function slotStatuses(plan: Plan, entries: readonly Entry[], today: CalendarDate): SlotStatus[] {
  const live = liveEntries(entries);
  return slots(plan).map((slot): SlotStatus => {
    const logged = live.filter((entry) => entry.kind === 'dca' && entry.slot === slot.key);
    const [first, ...rest] = logged;
    if (first !== undefined) {
      return {
        ...slot,
        status: 'done',
        loggedAmount: sum(recordedAmounts(logged)),
        loggedOn: minDate(first.date, ...rest.map((entry) => entry.date)),
        entries: logged,
      };
    }
    const skip = plan.skips.find((candidate) => candidate.slot === slot.key);
    if (skip !== undefined) return { ...slot, status: 'skipped', skip };
    const pause = pauseOn(plan, slot.due);
    if (pause !== null) return { ...slot, status: 'paused', pause };
    if (slot.due < today) return { ...slot, status: 'late' };
    return { ...slot, status: slot.due === today ? 'due' : 'upcoming' };
  });
}

const OPEN = new Set(['late', 'due', 'upcoming']);

/** Whether a slot still asks for a buy. */
export function isOpen(status: SlotStatus['status']): status is 'late' | 'due' | 'upcoming' {
  return OPEN.has(status);
}

/**
 * The slot of the current month, whatever its status; otherwise the first open slot due today or
 * later; otherwise none.
 */
export function focusSlot(statuses: readonly SlotStatus[], today: CalendarDate): SlotStatus | null {
  const current = monthKey(today);
  return (
    statuses.find((slot) => slot.key === current) ??
    statuses.find((slot) => isOpen(slot.status) && slot.due >= today) ??
    null
  );
}

export type ActionStatus = 'done' | 'skipped' | 'paused' | 'late' | 'due' | 'upcoming';

export type Action = {
  readonly kind: 'dca' | 'lump';
  /** The slot of a monthly buy; null for the starting amount. */
  readonly slot: MonthKey | null;
  readonly due: CalendarDate;
  readonly status: ActionStatus;
  readonly plannedAmount: Money;
  readonly loggedAmount: Money;
};

function dcaAction(plan: Plan, slot: SlotStatus): Action {
  return {
    kind: 'dca',
    slot: slot.key,
    due: slot.due,
    status: slot.status,
    plannedAmount: plan.monthlyAmount,
    loggedAmount: slot.status === 'done' ? slot.loggedAmount : ('0' as Money),
  };
}

/**
 * The starting amount while it is not logged, every late slot, and the focus slot even when done
 * (so Today can show "Logged" with "Add to it"), sorted by due date. The starting amount comes first
 * on a tie, as in the prototype.
 */
export function actionsNow(plan: Plan, entries: readonly Entry[], today: CalendarDate): Action[] {
  const statuses = slotStatuses(plan, entries, today);
  const focus = focusSlot(statuses, today);
  const actions: Action[] = [];
  const startingLogged = liveEntries(entries).some((entry) => entry.kind === 'lump');
  if (isPositive(plan.startingAmount) && !startingLogged) {
    actions.push({
      kind: 'lump',
      slot: null,
      due: plan.firstBuy,
      status: plan.firstBuy < today ? 'late' : plan.firstBuy === today ? 'due' : 'upcoming',
      plannedAmount: plan.startingAmount,
      loggedAmount: '0' as Money,
    });
  }
  for (const slot of statuses) {
    if (slot.status === 'late' && slot.key !== focus?.key) actions.push(dcaAction(plan, slot));
  }
  if (focus !== null) actions.push(dcaAction(plan, focus));
  return actions.sort((a, b) => compareDates(a.due, b.due));
}

/** The one action Today shows with its button: the first that still asks for a buy, or none. */
export function primaryAction(actions: readonly Action[]): Action | null {
  return actions.find((action) => isOpen(action.status)) ?? null;
}
