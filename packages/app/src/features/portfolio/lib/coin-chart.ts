import {
  type CalendarDate,
  type CoinId,
  compare,
  dateScale,
  downsample,
  type Entry,
  extent,
  isPositive,
  linearScale,
  linePath,
  liveEntries,
  type Money,
  type Pixel,
  type Price,
  type PriceHistory,
  paddedDomain,
  quotient,
  recordedAmounts,
  sum,
  ticks,
} from '@proofofcalm/core';
import type { CoinChartMarker } from '@proofofcalm/ui/charts/coin-chart';

// One coin's price chart in a holdings row (ADR-0022, docs/DESIGN.md §4, docs/DOMAIN.md §3.14): the coin's
// closes inside the range, at most POINTS + 1 of them plus the close of every day with an entry, so the
// tooltip and the table name each buy and sale on its own day; placed in viewBox units for CoinChart. The
// value axis is the padded extent of the closes. A buy is a circle and a sale a square at the price paid
// or received, as the prototype's drawChart places them; the average cost is a level drawn only inside
// the domain.

const POINTS = 120;
const GRIDLINES = 3;
/** The price a mark stands at: the Position's average carries the same places (docs/DOMAIN.md §3.6). */
const PRICE_DP = 10;

type ViewBox = { readonly width: number; readonly height: number };

/** The row chart's viewBox: the model is placed in it and CoinRowChart draws it. */
export const COIN_CHART_VIEW_BOX: ViewBox = { width: 300, height: 100 };

export type CoinChartPoint = {
  readonly date: CalendarDate;
  readonly close: Price;
  readonly x: Pixel;
  readonly y: Pixel;
  /** What the coin's live entries of that day bought and sold, for the tooltip and the table; null for none. */
  readonly bought: Money | null;
  readonly sold: Money | null;
};

export type CoinChartModel = {
  /** Oldest first: the first and the last close of the range kept. */
  readonly points: readonly CoinChartPoint[];
  readonly path: string;
  readonly end: { readonly x: Pixel; readonly y: Pixel };
  readonly markers: readonly CoinChartMarker[];
  /** The average cost and its level, which its label names; null without one or outside the domain. */
  readonly average: { readonly y: Pixel; readonly price: Price } | null;
  /** Horizontal gridlines as y in viewBox units. */
  readonly gridlines: readonly Pixel[];
  /** The lowest and the highest close drawn. */
  readonly low: Price;
  readonly high: Price;
};

/** The day's recorded costs; coins held with no recorded cost add nothing (DOMAIN §2.2). */
const total = (entries: readonly Entry[]): Money | null => {
  const costs = recordedAmounts(entries);
  return costs.length === 0 ? null : sum(costs);
};

/**
 * The chart of `coin` over `covered`, from its closes in the pay currency; `average` is the Position's.
 * Null with fewer than two closes inside the range.
 */
export function coinChart(
  entries: readonly Entry[],
  coin: CoinId,
  history: PriceHistory,
  covered: { readonly start: CalendarDate; readonly end: CalendarDate },
  average: Price | null,
  viewBox: ViewBox,
): CoinChartModel | null {
  const inside = history.filter(([day]) => day >= covered.start && day <= covered.end);
  const span = extent(inside.map(([, close]) => close));
  const [first, last] = [inside[0], inside.at(-1)];
  if (inside.length < 2 || span === null || first === undefined || last === undefined) return null;

  const own = liveEntries(entries).filter(
    (entry) => entry.coin === coin && entry.date >= first[0] && entry.date <= last[0],
  );
  const days = new Set(own.map((entry) => entry.date));
  const kept = new Set(downsample(inside, POINTS));
  const closes = inside.filter((close) => kept.has(close) || days.has(close[0]));

  const domain = paddedDomain(span);
  const x = dateScale([first[0], last[0]], [0, viewBox.width]);
  const y = linearScale(domain, [viewBox.height, 0]);
  const points = closes.map(([day, close]): CoinChartPoint => {
    const that = own.filter((entry) => entry.date === day);
    return {
      date: day,
      close,
      x: x(day),
      y: y(close),
      bought: total(that.filter((entry) => entry.kind !== 'sell')),
      sold: total(that.filter((entry) => entry.kind === 'sell')),
    };
  });
  // An entry with no cost (coins held, unknown or nothing paid) has no price to mark.
  const markers = own.flatMap((entry): CoinChartMarker[] =>
    entry.amount === null || !isPositive(entry.amount)
      ? []
      : [
          {
            id: entry.id,
            kind: entry.kind === 'sell' ? 'sell' : 'buy',
            x: x(entry.date),
            y: y(quotient<Price>(entry.amount, entry.units, PRICE_DP, 'half-even')),
          },
        ],
  );
  const level = average !== null && compare(average, domain[0]) >= 0 && compare(average, domain[1]) <= 0;
  return {
    points,
    path: linePath(points.map((point) => [point.x, point.y] as const)),
    end: { x: x(last[0]), y: y(last[1]) },
    markers,
    average: level ? { y: y(average), price: average } : null,
    gridlines: ticks(domain[0], domain[1], GRIDLINES).map(y),
    low: span[0],
    high: span[1],
  };
}
