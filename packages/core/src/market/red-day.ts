// Drawdowns and the Red day (docs/DOMAIN.md §3.11, ADR-0013). The shell passes heldValueSeries(), today's
// units valued over the history, so every figure describes the market and never the user's deposits.
import { RED_DAY } from '../constants';
import { type CalendarDate, daysBetween } from '../dates/calendar';
import { compare, isPositive, type Money, max, minus, type Percent, product, quotient } from '../money/decimal';
import { defined } from '../result';
import type { ValuePoint } from './series';

export type Drawdown = {
  /** Change from the latest value at least seven days earlier, in percent; null in the first week. */
  readonly sevenDay: Percent | null;
  /** Distance below the highest value of the 90 days ending on the date, in percent (zero or less). */
  readonly fromHigh90: Percent;
  /** Distance below the highest value of the series so far, in percent (zero or less). */
  readonly fromAllTimeHigh: Percent;
};
export type DrawdownPoint = Drawdown & { readonly date: CalendarDate };

export type RedDayThresholds = { readonly sevenDay: Percent; readonly fromHigh90: Percent };
export type RedDayFlag = { readonly date: CalendarDate; readonly red: boolean };
export type RedDayEpisode = {
  /** The first Red day of the episode; the banner is dismissed once per episode, by this date. */
  readonly start: CalendarDate;
  /** The latest Red day of the episode. */
  readonly last: CalendarDate;
};

const WEEK_DAYS = 7;
const HIGH_DAYS = 90;
const PERCENT_DP = 4;
const HUNDRED = '100' as Money;

/**
 * (now − then) / then in percent, truncated toward zero: a threshold with four decimals or fewer is
 * crossed only when the exact figure crosses it.
 */
function change(now: Money, then: Money): Percent {
  return quotient<Percent>(product(minus(now, then), HUNDRED), then, PERCENT_DP, 'down');
}

function below(value: Money, high: Money): Percent {
  return isPositive(high) ? change(value, high) : ('0' as Percent);
}

/** The drawdown on every date of a series ascending by date, in one pass. */
export function drawdowns(series: readonly ValuePoint[]): DrawdownPoint[] {
  const recent: ValuePoint[] = []; // points less than a week old
  const highs: ValuePoint[] = []; // candidates for the 90-day high, values decreasing
  let weekAgo: ValuePoint | undefined;
  let high = '0' as Money;
  return series.map((point) => {
    recent.push(point);
    const fresh = recent.findIndex((earlier) => daysBetween(earlier.date, point.date) < WEEK_DAYS);
    if (fresh > 0) weekAgo = recent[fresh - 1];
    recent.splice(0, fresh);

    highs.splice(highs.findLastIndex((earlier) => compare(earlier.value, point.value) > 0) + 1);
    highs.push(point);
    highs.splice(
      0,
      highs.findIndex((earlier) => daysBetween(earlier.date, point.date) < HIGH_DAYS),
    );

    high = max(high, point.value);
    return {
      date: point.date,
      sevenDay: weekAgo !== undefined && isPositive(weekAgo.value) ? change(point.value, weekAgo.value) : null,
      fromHigh90: below(point.value, defined(highs[0], 'the 90-day high').value),
      fromAllTimeHigh: below(point.value, high),
    };
  });
}

/** The drawdown on the series' last date, which the Red day page shows with that date. */
export function drawdownNow(series: readonly ValuePoint[]): DrawdownPoint | null {
  return drawdowns(series).at(-1) ?? null;
}

/** A seven-day fall of 10 % or more, or 30 % or more below the 90-day high (RED_DAY). */
export function redDay(drawdown: Drawdown, thresholds: RedDayThresholds = RED_DAY): boolean {
  return (
    (drawdown.sevenDay !== null && compare(drawdown.sevenDay, thresholds.sevenDay) <= 0) ||
    compare(drawdown.fromHigh90, thresholds.fromHigh90) <= 0
  );
}

/** Whether each date of the series was a Red day, judged on that date's own drawdown. */
export function redDays(series: readonly ValuePoint[], thresholds: RedDayThresholds = RED_DAY): RedDayFlag[] {
  return drawdowns(series).map((point) => ({ date: point.date, red: redDay(point, thresholds) }));
}

/**
 * The episode under way on `today`, if any: it starts on a Red day and ends once the condition has been
 * clear for RED_DAY.episodeClearDays consecutive days (missing days count as clear). `days` ascend;
 * those after `today` are not read, so an episode never starts or lasts past it.
 */
export function redDayEpisode(days: readonly RedDayFlag[], today: CalendarDate): RedDayEpisode | null {
  let episode: RedDayEpisode | null = null;
  for (const day of days) {
    if (daysBetween(day.date, today) < 0) break;
    if (!day.red) continue;
    episode =
      episode !== null && daysBetween(episode.last, day.date) <= RED_DAY.episodeClearDays
        ? { start: episode.start, last: day.date }
        : { start: day.date, last: day.date };
  }
  return episode !== null && daysBetween(episode.last, today) < RED_DAY.episodeClearDays ? episode : null;
}
