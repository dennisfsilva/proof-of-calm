// Where the plan is (docs/DOMAIN.md §3.5), ported from the prototype's phase() and extended for
// plans without a sell window and for pauses.
import type { CalendarDate } from '../dates/calendar';
import type { Pause, Plan } from '../schema/plan';
import { type Action, pauseOn, primaryAction } from './statuses';

export type PhaseKind = 'before' | 'buy' | 'hold' | 'sell' | 'exit' | 'done';

export type Phase = {
  readonly kind: PhaseKind;
  /** Without a sell window the hold never ends; the UI says "Holding". */
  readonly openEnded: boolean;
  /**
   * Set when today lies inside a pause; the phase is still `buy` (Today says "Paused until …"). Null once
   * buying ended: the end wins over a pause, also on the end day, and an ended plan cannot be resumed.
   */
  readonly pause: Pause | null;
};

export function phase(plan: Plan, today: CalendarDate): Phase {
  const pause = plan.endedBuyingOn === null ? pauseOn(plan, today) : null;
  const window = plan.sellWindow;
  const kind: PhaseKind =
    today < plan.firstBuy
      ? 'before'
      : today <= plan.lastBuy
        ? 'buy'
        : window === null || today < window.opens
          ? 'hold'
          : today <= window.closes
            ? 'sell'
            : today <= window.exitBy
              ? 'exit'
              : 'done';
  return { kind, openEnded: window === null && kind === 'hold', pause: kind === 'buy' ? pause : null };
}

/**
 * The action Today leads with: the primary action before and during the buying phase. After it the
 * phase leads, as the prototype's heroMain does, and months left open stay in the pending list.
 */
export function leadAction(actions: readonly Action[], current: Phase): Action | null {
  return current.kind === 'before' || current.kind === 'buy' ? primaryAction(actions) : null;
}
