// The portfolio's value at the end of one calendar day (docs/DOMAIN.md §3.13): the units held after every entry
// dated on or before it, each priced at the close dated exactly that day. A close dated D is the price at 00:00 UTC
// on D + 1 (ADR-0036, Readings of 2026-10-20), so no neighbouring close stands in: a coin without one is missing.
import type { CalendarDate } from '../dates/calendar';
import type { CurrencyCode } from '../money/currency';
import { isPositive, type Money, minus, type Price, plus, sum, type Units, valueAt } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { defined } from '../result';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { PriceHistories, PriceHistory } from '../schema/prices';

/** One held coin: its units and their value, null without a close dated on the day. */
export type SnapshotCoin = { readonly coin: CoinId; readonly units: Units; readonly value: Money | null };

/**
 * The coins with positive units, the plan's in its order, then the others; `total` is the exact sum of their values,
 * null while any coin is `missing` (no close dated on the day, or histories in another currency).
 */
export type SnapshotValue = {
  readonly date: CalendarDate;
  readonly currency: CurrencyCode;
  readonly coins: readonly SnapshotCoin[];
  readonly total: Money | null;
  readonly missing: readonly CoinId[];
};

/** The close dated exactly `date`, else null. */
function closeDated(history: PriceHistory, date: CalendarDate): Price | null {
  let low = 0;
  let high = history.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const close = defined(history[middle], 'a close');
    if (close[0] === date) return close[1];
    if (close[0] < date) low = middle + 1;
    else high = middle;
  }
  return null;
}

/** Units held per coin after the live entries dated on or before `date`, sales subtracted, as in `valueSeries`. */
function unitsHeldOn(entries: readonly Entry[], date: CalendarDate): Map<CoinId, Units> {
  const held = new Map<CoinId, Units>();
  for (const entry of liveEntries(entries)) {
    if (entry.date > date) continue;
    const before = held.get(entry.coin) ?? ('0' as Units);
    held.set(entry.coin, entry.kind === 'sell' ? minus(before, entry.units) : plus(before, entry.units));
  }
  return held;
}

/** `units` priced at the closes dated `closeOn`, in the pay currency; a holding of 0 or less counts as none. */
export function holdingsValue(
  plan: Plan,
  units: ReadonlyMap<CoinId, Units>,
  histories: PriceHistories,
  closeOn: CalendarDate,
): SnapshotValue {
  const order = plan.coins.map((coin) => coin.id);
  const rank = (coin: CoinId) => (order.includes(coin) ? order.indexOf(coin) : order.length);
  const sameCurrency = histories.currency === plan.payCurrency;
  const coins = [...units]
    .filter(([, held]) => isPositive(held))
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([coin, held]): SnapshotCoin => {
      const history = histories.coins[coin];
      const close = sameCurrency && history !== undefined ? closeDated(history, closeOn) : null;
      return { coin, units: held, value: close === null ? null : valueAt(held, close) };
    });
  const missing = coins.filter((coin) => coin.value === null).map((coin) => coin.coin);
  const values = coins.flatMap((coin) => (coin.value === null ? [] : [coin.value]));
  return {
    date: closeOn,
    currency: plan.payCurrency,
    coins,
    total: missing.length === 0 ? sum(values) : null,
    missing,
  };
}

/** The value at the end of `date`: entries dated on or before it, priced at the closes dated `date`. */
export function snapshotValue(
  plan: Plan,
  entries: readonly Entry[],
  histories: PriceHistories,
  date: CalendarDate,
): SnapshotValue {
  return holdingsValue(plan, unitsHeldOn(entries, date), histories, date);
}
