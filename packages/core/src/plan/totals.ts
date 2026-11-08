// Plan totals and the Buy / Hold / Sell strip (docs/DOMAIN.md §3.10), ported from the prototype's
// planTotals() and renderStrip(), with skips and pauses taken out of the planned total, and extra buys
// before the first buy day out of the invested total (§12).
import { addDays, type CalendarDate, daysBetween, maxDate } from '../dates/calendar';
import {
  compare,
  isPositive,
  isZero,
  type Money,
  max,
  min,
  type Percent,
  percentage,
  plus,
  product,
  type Ratio,
  ratio,
  sum,
} from '../money/decimal';
import { type Entry, recordedAmounts } from '../schema/entry';
import type { Plan } from '../schema/plan';
import { isOpen, liveEntries, slotStatuses } from './statuses';

export type PlanTotals = {
  readonly slotCount: number;
  /** Slots that are neither skipped nor paused. */
  readonly activeSlots: number;
  readonly plannedDca: Money;
  readonly plannedStarting: Money;
  readonly plannedTotal: Money;
  /** Monthly buys and starting amounts whatever their date, and extra buys from the first buy day on; never sales. */
  readonly investedSoFar: Money;
  /** 0 to 100, one decimal half-even; null when nothing is planned (every slot skipped, no starting amount). */
  readonly percentIn: Percent | null;
  /** Slots still asking for a buy: late, due or upcoming. */
  readonly buysLeft: number;
};

export function planTotals(plan: Plan, entries: readonly Entry[], today: CalendarDate): PlanTotals {
  const statuses = slotStatuses(plan, entries, today);
  const activeSlots = statuses.filter((slot) => slot.status !== 'skipped' && slot.status !== 'paused').length;
  const live = liveEntries(entries);
  // Coins held (`held`), whatever their date, and an extra buy dated before the first buy day are not the plan's
  // buys: Portfolio counts them, the plan's totals do not (docs/DOMAIN.md §3.10, §12).
  const planBuys = live.filter(
    (entry) => entry.kind === 'dca' || entry.kind === 'lump' || (entry.kind === 'extra' && entry.date >= plan.firstBuy),
  );
  const loggedStarting = sum(recordedAmounts(live.filter((entry) => entry.kind === 'lump')));
  const plannedDca = product<Money>(plan.monthlyAmount, String(activeSlots) as Money);
  const plannedStarting = max(plan.startingAmount, loggedStarting);
  const plannedTotal = plus(plannedDca, plannedStarting);
  const investedSoFar = sum(recordedAmounts(planBuys));
  const percentIn = isZero(plannedTotal) ? null : min(percentage(investedSoFar, plannedTotal, 1), '100' as Percent);
  return {
    slotCount: statuses.length,
    activeSlots,
    plannedDca,
    plannedStarting,
    plannedTotal,
    investedSoFar,
    percentIn,
    buysLeft: statuses.filter((slot) => isOpen(slot.status)).length,
  };
}

export type StripSegment = {
  readonly kind: 'buy' | 'hold' | 'sell' | 'exit';
  readonly from: Ratio;
  readonly to: Ratio;
  /** The hold of a plan without a sell window has no end. */
  readonly openEnded: boolean;
};

export type Strip = {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
  readonly segments: readonly StripSegment[];
  /** The expected peak inside the window, when both reference dates are set. */
  readonly peak: { readonly from: Ratio; readonly to: Ratio } | null;
  /** Where today sits, 0 to 1; null before the first buy or after the end. */
  readonly today: Ratio | null;
  /** The part of the strip already behind, 0 to 1. */
  readonly elapsed: Ratio;
};

const POSITION_DP = 6;

/**
 * Positions are `daysBetween(firstBuy, d) / daysBetween(firstBuy, end)`. With a sell window the
 * end is `exitBy`; without one, the strip is Buy then an open-ended Hold drawn as long as the buy
 * phase (and stretched to today once today is later).
 */
export function strip(plan: Plan, today: CalendarDate): Strip {
  const window = plan.sellWindow;
  const buyDays = daysBetween(plan.firstBuy, plan.lastBuy);
  const end = window !== null ? window.exitBy : maxDate(addDays(plan.lastBuy, Math.max(buyDays, 1)), today);
  const span = String(Math.max(daysBetween(plan.firstBuy, end), 1)) as Money;
  const at = (date: CalendarDate): Ratio => {
    const position = ratio(String(Math.max(daysBetween(plan.firstBuy, date), 0)) as Money, span, POSITION_DP);
    return compare(position, '1' as Ratio) > 0 ? ('1' as Ratio) : position;
  };
  const segments: StripSegment[] =
    window === null
      ? [
          { kind: 'buy', from: at(plan.firstBuy), to: at(plan.lastBuy), openEnded: false },
          { kind: 'hold', from: at(plan.lastBuy), to: at(end), openEnded: true },
        ]
      : [
          { kind: 'buy', from: at(plan.firstBuy), to: at(plan.lastBuy), openEnded: false },
          { kind: 'hold', from: at(plan.lastBuy), to: at(window.opens), openEnded: false },
          { kind: 'sell', from: at(window.opens), to: at(window.closes), openEnded: false },
          { kind: 'exit', from: at(window.closes), to: at(window.exitBy), openEnded: false },
        ];
  const { peakFrom, peakTo } = plan.references;
  const peak =
    peakFrom !== undefined && peakTo !== undefined && peakTo > peakFrom ? { from: at(peakFrom), to: at(peakTo) } : null;
  const inside = today >= plan.firstBuy && today <= end;
  const elapsed = today <= plan.firstBuy ? ('0' as Ratio) : at(today);
  return {
    start: plan.firstBuy,
    end,
    segments,
    peak,
    today: inside ? at(today) : null,
    elapsed: isPositive(elapsed) ? elapsed : ('0' as Ratio),
  };
}
