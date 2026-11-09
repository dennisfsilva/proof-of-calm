// Value over time (docs/DOMAIN.md §3.11), ported from the prototype's valueSeries(): on the grid of the
// longest history, the units held on each date times that date's close.
import { addDays, type CalendarDate, compareDates } from '../dates/calendar';
import { isPositive, type Money, minus, type Price, plus, sum, type Units, valueAt } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { unitsIn, unitsOut } from '../portfolio/effect';
import { coinsWithEntries } from '../portfolio/portfolio';
import { defined } from '../result';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { ChartRange } from '../schema/prefs';
import type { PriceHistories, PriceHistory } from '../schema/prices';

export type ValuePoint = { readonly date: CalendarDate; readonly value: Money };

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 } as const satisfies Record<
  Exclude<ChartRange, 'all'>,
  number
>;

/** The close on `date`, else the first close after it, else the last close (the prototype's at()). */
export function closeOn(history: PriceHistory, date: CalendarDate): Price {
  let low = 0;
  let high = history.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (defined(history[middle], 'a close')[0] < date) low = middle + 1;
    else high = middle;
  }
  return defined(history[low], 'a close')[1];
}

/** The items whose coin has at least two closes, with that history (the prototype's chart rule). */
function withHistory<T extends { readonly coin: CoinId }>(
  items: readonly T[],
  histories: PriceHistories,
): (T & { readonly history: PriceHistory })[] {
  return items.flatMap((item) => {
    const history = histories.coins[item.coin];
    return history !== undefined && history.length > 1 ? [{ ...item, history }] : [];
  });
}

/** The longest history; on a tie, the first. The list is not empty. */
function gridOf(items: readonly { readonly history: PriceHistory }[]): PriceHistory {
  return items.reduce((longest, item) => (item.history.length > longest.history.length ? item : longest)).history;
}

/** The coins with live entries that have at least two closes, with their history. */
function pricedCoins(plan: Plan, live: readonly Entry[], histories: PriceHistories) {
  return withHistory(
    coinsWithEntries(plan, live).map((coin) => ({ coin })),
    histories,
  );
}

/**
 * The dates a range covers: it counts back from the last close of the longest history, both ends
 * included; `all` starts at the first entry, or at the last close when every entry is later. Null when
 * the histories are not in the pay currency or no coin with entries has two closes.
 */
export function valueRange(
  plan: Plan,
  entries: readonly Entry[],
  histories: PriceHistories,
  range: ChartRange,
): { readonly start: CalendarDate; readonly end: CalendarDate } | null {
  if (histories.currency !== plan.payCurrency) return null;
  const live = liveEntries(entries);
  const priced = pricedCoins(plan, live, histories);
  if (priced.length === 0) return null;
  const end = defined(gridOf(priced).at(-1), 'the last close')[0];
  const start =
    range === 'all'
      ? live.reduce((first, entry) => (entry.date < first ? entry.date : first), end)
      : addDays(end, -RANGE_DAYS[range]);
  return { start, end };
}

/**
 * The portfolio's value on each date of the range (valueRange): the units held that day (entries dated
 * on or before it) times that day's close, in the histories' currency, which must be the pay currency.
 * Null while nothing can be drawn.
 */
export function valueSeries(
  plan: Plan,
  entries: readonly Entry[],
  histories: PriceHistories,
  range: ChartRange,
): ValuePoint[] | null {
  const covered = valueRange(plan, entries, histories, range);
  if (covered === null) return null;
  const live = liveEntries(entries);
  const priced = pricedCoins(plan, live, histories);
  const grid = gridOf(priced);
  const { start } = covered;

  const holdings = priced.map(({ coin, history }) => ({
    history,
    pending: live.filter((entry) => entry.coin === coin).sort((a, b) => compareDates(a.date, b.date)),
    units: '0' as Units,
  }));
  const points = grid
    .filter(([date]) => date >= start)
    .map(([date]): ValuePoint => {
      let value = '0' as Money;
      for (const holding of holdings) {
        const later = holding.pending.findIndex((entry) => entry.date > date);
        const due = holding.pending.splice(0, later === -1 ? holding.pending.length : later);
        holding.units = due.reduce((held, entry) => minus(plus(held, unitsIn(entry)), unitsOut(entry)), holding.units);
        if (isPositive(holding.units)) value = plus(value, valueAt(holding.units, closeOn(holding.history, date)));
      }
      return { date, value };
    });
  return points.some((point) => isPositive(point.value)) ? points : null;
}

/**
 * Today's units valued on every date of the longest history, so that a fall in the series is the
 * market's, never the deposits' (the Red day's drawdown, §3.11). Null when no held coin has a history.
 */
export function heldValueSeries(
  holdings: readonly { readonly coin: CoinId; readonly units: Units }[],
  histories: PriceHistories,
): ValuePoint[] | null {
  const priced = withHistory(
    holdings.filter((holding) => isPositive(holding.units)),
    histories,
  );
  if (priced.length === 0) return null;
  return gridOf(priced).map(([date]) => ({
    date,
    value: sum(priced.map((holding) => valueAt(holding.units, closeOn(holding.history, date)))),
  }));
}
