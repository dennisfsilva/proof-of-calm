import {
  type CalendarDate,
  type ChartRange,
  type CoinId,
  coinsWithEntries,
  dateScale,
  downsample,
  type Entry,
  extent,
  type Instant,
  isPositive,
  linearScale,
  linePath,
  liveEntries,
  type Money,
  type Pixel,
  type Plan,
  type PriceHistories,
  paddedDomain,
  portfolio,
  ticks,
  type ValuePoint,
  valueRange,
  valueSeries,
} from '@proofofcalm/core';
import { type HistoriesState, servesHistory } from './use-histories';

// The Portfolio value chart's geometry (ADR-0022, docs/DOMAIN.md §3.11 and §3.14): the core's value series
// for the range, at most POINTS + 1 points (the line and the table view show the same ones), placed in
// viewBox units for LineChart. The value axis is the padded extent; the gridlines are its round values.

/** A year of closes becomes about one point every three days: plenty for a 160 px line. */
const POINTS = 120;
const GRIDLINES = 3;

export type ValueChartModel = {
  /** The points drawn, oldest first, the first and the last of the range kept. */
  readonly points: readonly ValuePoint[];
  /** The first and the last of `points`, which the label names. */
  readonly first: ValuePoint;
  readonly last: ValuePoint;
  readonly path: string;
  readonly end: { readonly x: Pixel; readonly y: Pixel };
  /** Horizontal gridlines as y in viewBox units. */
  readonly gridlines: readonly Pixel[];
  /** The lowest and the highest value drawn. */
  readonly low: Money;
  readonly high: Money;
};

/** The coins with live entries, in the plan's order and then the others: those the chart needs closes for. */
export function chartCoins(plan: Plan, entries: readonly Entry[]): CoinId[] {
  const live = liveEntries(entries);
  return coinsWithEntries(plan, live).filter((coin) => live.some((entry) => entry.coin === coin));
}

/**
 * The coins with fewer than two closes, in the order given. While there is one no range can draw (a partial
 * value is never drawn, as the Portfolio total is never a partial sum, §3.6).
 */
function tooFewCloses(coins: readonly CoinId[], histories: PriceHistories): CoinId[] {
  return coins.filter((coin) => (histories.coins[coin]?.length ?? 0) < 2);
}

type ViewBox = { readonly width: number; readonly height: number };

/** Null while the chart cannot be drawn: a coin has fewer than two closes, or the series has nothing held in it. */
export function valueChart(
  plan: Plan,
  entries: readonly Entry[],
  histories: PriceHistories,
  range: ChartRange,
  viewBox: ViewBox,
): ValueChartModel | null {
  if (tooFewCloses(chartCoins(plan, entries), histories).length > 0) return null;
  const series = valueSeries(plan, entries, histories, range);
  const span = series === null ? null : extent(series.map((point) => point.value));
  if (series === null || span === null) return null;
  const points = downsample(series, POINTS);
  // Not empty: the series has a value, and downsample keeps the first and the last point.
  const [first, last] = [points[0], points.at(-1)] as [ValuePoint, ValuePoint];

  const domain = paddedDomain(span);
  const x = dateScale([first.date, last.date], [0, viewBox.width]);
  const y = linearScale(domain, [viewBox.height, 0]);
  const placed = points.map((point) => [x(point.date), y(point.value)] as const);
  return {
    points,
    first,
    last,
    path: linePath(placed),
    end: { x: x(last.date), y: y(last.value) },
    gridlines: ticks(domain[0], domain[1], GRIDLINES).map(y),
    low: span[0],
    high: span[1],
  };
}

/** What the chart shows; the component renders it and decides nothing (docs/CONTENT-STYLE.md §3). */
export type ChartState =
  /** No coin with live entries: nothing is rendered. */
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  /** The closes could not be read, or they are not in the pay currency. */
  | { readonly kind: 'unavailable' }
  /** The coins with entries that have fewer than two closes, in chart order. */
  | { readonly kind: 'too-few-closes'; readonly coins: readonly CoinId[] }
  /** Every entry is dated after the last close, and a coin is held at the end of one of their days. */
  | { readonly kind: 'starts-later'; readonly end: CalendarDate }
  /** Nothing was held on any day of the closes, from their first to their last. */
  | { readonly kind: 'nothing-held'; readonly start: CalendarDate; readonly end: CalendarDate }
  /** The range has nothing to draw, while a longer one has: the range's own dates. */
  | {
      readonly kind: 'range-empty';
      readonly range: ChartRange;
      readonly start: CalendarDate;
      readonly end: CalendarDate;
    }
  /**
   * The dates of the first and the last point; `ownDates` when the first is later than the range's first
   * day; `fetchedAt` the closes' time, which the line under the chart states.
   */
  | {
      readonly kind: 'draws';
      readonly chart: ValueChartModel;
      readonly ownDates: boolean;
      readonly start: CalendarDate;
      readonly end: CalendarDate;
      readonly fetchedAt: Instant;
    };

/**
 * The first date of the grid the series is drawn on, the longest history (on a tie the first coin's, §3.11),
 * whose last date is valueRange's end. The coins are not empty and each has two closes.
 */
function gridStart(coins: readonly CoinId[], histories: PriceHistories, end: CalendarDate): CalendarDate {
  const grid = coins
    .map((coin) => histories.coins[coin] ?? [])
    .reduce((longest, history) => (history.length > longest.length ? history : longest));
  return grid[0]?.[0] ?? end;
}

/**
 * The chart's one state, checked in this order: no coin with entries, every coin outside the catalogue (whose
 * closes are never read), the closes loading, failed, a coin with fewer than two closes (one outside the
 * catalogue has none), closes in another currency; then the range draws; else All draws, so a longer
 * range has a value; else every entry is later than the last close and holds a coin at the end of its day, so a
 * later close draws; else nothing was held on any close.
 */
export function chartState(
  plan: Plan,
  entries: readonly Entry[],
  histories: HistoriesState,
  range: ChartRange,
  viewBox: ViewBox,
): ChartState {
  const coins = chartCoins(plan, entries);
  if (coins.length === 0) return { kind: 'none' };
  if (!coins.some(servesHistory)) return { kind: 'too-few-closes', coins };
  if (histories.status === 'loading') return { kind: 'loading' };
  if (histories.status === 'failed') return { kind: 'unavailable' };
  const closes = histories.histories;
  const short = tooFewCloses(coins, closes);
  if (short.length > 0) return { kind: 'too-few-closes', coins: short };
  const covered = valueRange(plan, entries, closes, range);
  if (covered === null) return { kind: 'unavailable' };

  const chart = valueChart(plan, entries, closes, range, viewBox);
  if (chart !== null) {
    const { first, last } = chart;
    const { fetchedAt } = histories;
    return { kind: 'draws', chart, ownDates: first.date > covered.start, start: first.date, end: last.date, fetchedAt };
  }
  // All starts at the first entry and nothing is held before it, so All draws whenever any range does.
  if (range !== 'all' && valueChart(plan, entries, closes, 'all', viewBox) !== null) {
    return { kind: 'range-empty', range, start: covered.start, end: covered.end };
  }
  const live = liveEntries(entries);
  if (live.every((entry) => entry.date > covered.end) && heldOnAnEntryDay(plan, live)) {
    return { kind: 'starts-later', end: covered.end };
  }
  return { kind: 'nothing-held', start: gridStart(coins, closes, covered.end), end: covered.end };
}

/**
 * Whether a coin is held at the end of a day with an entry, by the positions of the entries dated on or before it
 * (§3.6, units = max(0, bought − sold), as the series counts them): a close on that day would draw.
 */
function heldOnAnEntryDay(plan: Plan, live: readonly Entry[]): boolean {
  return [...new Set(live.map((entry) => entry.date))].some((day) =>
    portfolio(
      plan,
      live.filter((entry) => entry.date <= day),
    ).positions.some((position) => isPositive(position.units)),
  );
}
