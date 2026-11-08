// Holdings per coin and in total (docs/DOMAIN.md §3.6), ported from the prototype's portfolio().
// Fees are shown separately and not taken off profit or loss, as in the prototype. Units with no recorded cost
// count in the value and stay out of invested, the average and P/L, and so does a sale's share taken from them.
import type { CurrencyCode } from '../money/currency';
import {
  isPositive,
  isZero,
  type Money,
  max,
  minus,
  type Percent,
  type Price,
  percentage,
  plus,
  product,
  quotient,
  type Ratio,
  ratio,
  sum,
  type Units,
  valueAt,
} from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { type Entry, recordedAmounts } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { PriceSnapshot } from '../schema/prices';
import { DEFAULT_HOLDING_CONTEXT, type HoldingContext, heldLots, matchLots, type SaleMatch } from './lots';

export type Position = {
  readonly coin: CoinId;
  readonly boughtUnits: Units;
  readonly soldUnits: Units;
  /** max(0, bought − sold). */
  readonly units: Units;
  /** The remaining units of lots with no recorded cost (`heldLots`), at most `units`: in the value, out of P/L. */
  readonly unrecordedUnits: Units;
  readonly invested: Money;
  readonly proceeds: Money;
  readonly fees: Money;
  /** Pay currency per unit bought with a recorded cost; null before the first such buy. */
  readonly average: Price | null;
  /** In the pay currency; null without a price. */
  readonly price: Price | null;
  readonly value: Money | null;
  /** Value of the units with a cost + costed proceeds − invested; null without a price or a costed purchase. */
  readonly pnl: Money | null;
  readonly pnlPct: Percent | null;
  /** Share of the portfolio: by value when every held coin is priced, else by amount invested. */
  readonly weight: Ratio | null;
  readonly buys: number;
  readonly sells: number;
};

export type Portfolio = {
  readonly positions: readonly Position[];
  readonly invested: Money;
  readonly proceeds: Money;
  readonly fees: Money;
  /** Only when every coin with units has a price; never a partial sum. */
  readonly value: Money | null;
  readonly pnl: Money | null;
  readonly pnlPct: Percent | null;
  /** (costed proceeds + value of the units with a cost) / invested. */
  readonly multiple: Ratio | null;
  readonly priced: boolean;
  readonly buys: number;
  readonly sells: number;
};

const PRICE_DP = 10;
const PERCENT_DP = 4;
const RATIO_DP = 6;

/** The plan's coins in order, then any other coin that has entries, in order of appearance. */
export function coinsWithEntries(plan: Plan, entries: readonly Entry[]): CoinId[] {
  const ids = plan.coins.map((coin) => coin.id);
  for (const entry of entries) if (!ids.includes(entry.coin)) ids.push(entry.coin);
  return ids;
}

/** The coin's price in `currency`; a missing or zero price is no price. */
export function priceIn(prices: PriceSnapshot | null | undefined, coin: CoinId, currency: CurrencyCode): Price | null {
  const price = prices?.prices[coin]?.[currency];
  return price !== undefined && isPositive(price) ? price : null;
}

export function priceOf(prices: PriceSnapshot | null | undefined, coin: CoinId, plan: Plan): Price | null {
  return priceIn(prices, coin, plan.payCurrency);
}

/** A sale's proceeds less the share of its units taken from lots with no cost, half-even at 10 places. */
function costedProceeds(sale: Entry, match: SaleMatch | undefined): Money {
  const amount = sale.amount ?? ('0' as Money);
  if (match === undefined || isZero(match.uncosted)) return amount;
  return minus(amount, quotient<Money>(product(amount, match.uncosted), sale.units, PRICE_DP, 'half-even'));
}

export function portfolio(
  plan: Plan,
  entries: readonly Entry[],
  prices?: PriceSnapshot | null,
  context: HoldingContext = DEFAULT_HOLDING_CONTEXT,
): Portfolio {
  const live = liveEntries(entries);
  const raw = coinsWithEntries(plan, live).map((coin) => {
    const own = live.filter((entry) => entry.coin === coin);
    const buys = own.filter((entry) => entry.kind !== 'sell');
    const sells = own.filter((entry) => entry.kind === 'sell');
    const costedBuys = buys.filter((entry) => entry.amount !== null);
    const boughtUnits = sum(buys.map((entry) => entry.units));
    const soldUnits = sum(sells.map((entry) => entry.units));
    const units = max(minus(boughtUnits, soldUnits), '0' as Units);
    // The lots as `sellableNow` reads them: a sale larger than its venue's lots takes the rest from lots held then, and
    // a sale no lot held at its date covers (imported) from the oldest lots left, uncosted where those had no cost.
    const match = heldLots(matchLots(own, coin, context.lotScope, context.lotRule));
    const unrecordedUnits = sum(match.lots.filter((lot) => lot.cost === null).map((lot) => lot.remainingUnits));
    // Only recorded costs: a `held` entry with no cost adds its units and nothing to invested (§3.6).
    const invested = sum(recordedAmounts(costedBuys));
    const costedUnits = sum(costedBuys.map((entry) => entry.units));
    const proceeds = sum(recordedAmounts(sells));
    const sales = new Map(match.sales.map((sale) => [sale.id, sale]));
    const costed = sum(sells.map((sale) => costedProceeds(sale, sales.get(sale.id))));
    const fees = sum(own.map((entry) => entry.fee ?? ('0' as Money)));
    const price = priceOf(prices, coin, plan);
    const value = price === null ? null : valueAt(units, price);
    const costedValue = price === null ? null : valueAt(minus(units, unrecordedUnits), price);
    // Purchases with none of them costed give no P/L; a coin with only sales (imported) keeps value + proceeds.
    const pnl =
      costedValue === null || (buys.length > 0 && costedBuys.length === 0)
        ? null
        : minus(plus(costedValue, costed), invested);
    return {
      coin,
      boughtUnits,
      soldUnits,
      units,
      unrecordedUnits,
      invested,
      proceeds,
      fees,
      average: isPositive(costedUnits) ? quotient<Price>(invested, costedUnits, PRICE_DP, 'half-even') : null,
      price,
      value,
      pnl,
      pnlPct: pnl !== null && isPositive(invested) ? percentage(pnl, invested, PERCENT_DP) : null,
      buys: buys.length,
      sells: sells.length,
      costed: plus(costedValue ?? ('0' as Money), costed),
    };
  });

  const invested = sum(raw.map((position) => position.invested));
  const proceeds = sum(raw.map((position) => position.proceeds));
  const priced = raw.every((position) => isZero(position.units) || position.value !== null);
  const value = priced ? sum(raw.map((position) => position.value ?? ('0' as Money))) : null;
  // The costed parts over every coin: the value of the units with a cost plus the costed proceeds.
  const costed = sum(raw.map((position) => position.costed));
  const pnl = value === null ? null : minus(costed, invested);
  const byValue = value !== null && isPositive(value);

  const positions = raw.map(({ costed: _costed, ...position }): Position => {
    const weight = byValue
      ? ratio(position.value ?? ('0' as Money), value, RATIO_DP)
      : isPositive(invested)
        ? ratio(position.invested, invested, RATIO_DP)
        : null;
    return { ...position, weight };
  });

  return {
    positions,
    invested,
    proceeds,
    fees: sum(raw.map((position) => position.fees)),
    value,
    pnl,
    pnlPct: pnl !== null && isPositive(invested) ? percentage(pnl, invested, PERCENT_DP) : null,
    multiple: value !== null && isPositive(invested) ? ratio(costed, invested, RATIO_DP) : null,
    priced,
    buys: raw.reduce((count, position) => count + position.buys, 0),
    sells: raw.reduce((count, position) => count + position.sells, 0),
  };
}
