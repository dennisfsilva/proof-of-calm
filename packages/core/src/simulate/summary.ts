// What a simulation shows (docs/EDUCATION.md §8): the path first (invested, value, drawdown each day),
// then the final multiple, the deepest drawdown with its dates, the longest time under water and the
// months that ended in loss. No annualised return.
import { type UnderwaterSegment, underwaterSegments } from '../charts/underwater';
import { type CalendarDate, daysBetween, monthKey } from '../dates/calendar';
import {
  compare,
  isPositive,
  type Money,
  minus,
  type Percent,
  percentage,
  product,
  type Ratio,
  ratio,
  round,
} from '../money/decimal';

/** The days simulated, with what had been paid and what was held, in value, at the end of each. */
export type SimulatedDays = {
  readonly dates: readonly CalendarDate[];
  readonly invested: readonly Money[];
  readonly values: readonly Money[];
};

export type SimulationPoint = {
  readonly date: CalendarDate;
  /** Everything paid so far, fees included. */
  readonly invested: Money;
  /** Σ units × close of the day, at ten decimals. */
  readonly value: Money;
  /** value / the highest value so far − 1, in percent at four decimals: 0 at a high, −100 at nothing left. */
  readonly drawdown: Percent;
};

export type MaxDrawdown = {
  readonly depth: Percent;
  readonly peak: CalendarDate;
  readonly trough: CalendarDate;
  /** The first day back at the peak's value; null when that did not happen before the end. */
  readonly recovery: CalendarDate | null;
};

export type UnderwaterPeriod = {
  /** The peak the value fell from. */
  readonly from: CalendarDate;
  /** The recovery, or the last day for a stretch still under water at the end. */
  readonly to: CalendarDate;
  readonly days: number;
  readonly recovered: boolean;
};

export type SimulationSummary = {
  readonly invested: Money;
  readonly value: Money;
  /** value / invested at six decimals; null when nothing was bought. */
  readonly multiple: Ratio | null;
  readonly maxDrawdown: MaxDrawdown | null;
  readonly longestUnderwater: UnderwaterPeriod | null;
  /** Calendar months whose last day ended with the value, at the minor unit, below what was invested. */
  readonly monthsInLoss: number;
  readonly months: number;
  /** Buys that could not be made on their due date. */
  readonly gaps: number;
};

const PERCENT_DECIMALS = 4;
const MULTIPLE_DECIMALS = 6;

/** How far `value` is below `high`, in percent; only called below a positive high. */
function depth(value: Money, high: Money): Percent {
  return percentage(minus(value, high), high, PERCENT_DECIMALS);
}

/** The path: each day's amount invested, value and drawdown from the highest value so far. */
export function series(days: SimulatedDays): SimulationPoint[] {
  let high = '0' as Money;
  return days.dates.map((date, index) => {
    const value = days.values[index] as Money;
    const below = compare(value, high) < 0;
    if (!below) high = value;
    return {
      date,
      invested: days.invested[index] as Money,
      value,
      drawdown: below ? depth(value, high) : ('0' as Percent),
    };
  });
}

const at = <T>(list: readonly T[], index: number) => list[index] as T;

/** The deepest fall from a peak and the longest time under water; they need not be the same fall. */
function falls({ dates, values }: SimulatedDays) {
  let deepest: UnderwaterSegment | null = null;
  let longest: UnderwaterPeriod | null = null;
  for (const segment of underwaterSegments(values)) {
    // trough / peak compared cross-multiplied, exactly: the lower ratio is the deeper fall.
    const deeper =
      deepest === null ||
      compare(
        product<Money>(at(values, segment.trough), at(values, deepest.peak)),
        product<Money>(at(values, deepest.trough), at(values, segment.peak)),
      ) < 0;
    if (deeper) deepest = segment;
    const from = at(dates, segment.peak);
    const to = at(dates, segment.recovery ?? dates.length - 1);
    const length = daysBetween(from, to);
    if (longest === null || length > longest.days) {
      longest = { from, to, days: length, recovered: segment.recovery !== null };
    }
  }
  const maxDrawdown: MaxDrawdown | null =
    deepest === null
      ? null
      : {
          depth: depth(at(values, deepest.trough), at(values, deepest.peak)),
          peak: at(dates, deepest.peak),
          trough: at(dates, deepest.trough),
          recovery: deepest.recovery === null ? null : at(dates, deepest.recovery),
        };
  return { maxDrawdown, longestUnderwater: longest };
}

/** The calendar months simulated, and those whose last day ended below what was invested. */
function lossMonths({ dates, invested, values }: SimulatedDays, minorDigits: number) {
  let months = 0;
  let monthsInLoss = 0;
  dates.forEach((date, index) => {
    const next = dates[index + 1];
    if (next !== undefined && monthKey(next) === monthKey(date)) return;
    months += 1;
    if (compare(round(at(values, index), minorDigits, 'half-even'), at(invested, index)) < 0) monthsInLoss += 1;
  });
  return { monthsInLoss, months };
}

export function summarize(days: SimulatedDays, gaps: number, minorDigits: number): SimulationSummary {
  const paid = days.invested.at(-1) ?? ('0' as Money);
  const value = days.values.at(-1) ?? ('0' as Money);
  return {
    invested: paid,
    value,
    multiple: isPositive(paid) ? ratio(value, paid, MULTIPLE_DECIMALS) : null,
    ...falls(days),
    ...lossMonths(days, minorDigits),
    gaps,
  };
}
