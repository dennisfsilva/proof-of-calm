// The tax-year export of a `portfolio-wide` country (docs/DOMAIN.md §3.13, France): one block per sale dated in the
// year, with what form 2086 asks that the log records (the date, line 211; the proceeds, 213; the sale fee, 214), the
// parts of line 212 (the units of each coin held just before the sale, the coin sold valued at its own sale price,
// the others at the closes dated the sale day that the shell gives) and the gross sums toward line 220. It computes
// nothing from line 221 on: no fraction of capital, no net cost, no gain, no total for the year and no threshold
// test, which counsel rules outside docs/JURISDICTIONS.md §1. The cost sums are never reduced by earlier sales.
import type { CalendarDate } from '../dates/calendar';
import { closeDated } from '../market/snapshot';
import { type CurrencyCode, MINOR_UNITS } from '../money/currency';
import {
  compare,
  isPositive,
  type Money,
  minus,
  type Price,
  plus,
  product,
  quotient,
  type Units,
  valueAt,
} from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { compareEntries } from '../portfolio/lots';
import { coinsWithEntries } from '../portfolio/portfolio';
import { assertNever } from '../result';
import type { CountryRules } from '../schema/country';
import { type Entry, isEstimate } from '../schema/entry';
import type { CoinId, EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';
import type { PriceHistories } from '../schema/prices';
import { loggedPrice, textCell } from './csv';
import { paddedAmountCell, type TaxYearSpan } from './tax-year';
import { roundedAmountCell, writtenTotalCell } from './tax-year-snapshot';

/**
 * One coin held just before a sale: `price` is the sale's own for the coin sold (`sale`), the close dated the sale day
 * for the others (`close`), else null; `value` is units × price, for the coin sold amount × units ÷ units sold.
 */
export type CessionHolding = {
  readonly coin: CoinId;
  readonly units: Units;
  /** A one-tap entry counts in the units. */
  readonly estimated: boolean;
  readonly price: Price | null;
  readonly source: 'sale' | 'close' | null;
  readonly value: Money | null;
};

/** One sale of the year, numbered from 1, with the holdings and the purchase sums of the entries ordered before it. */
export type Cession = {
  readonly number: number;
  readonly entry: EntityId;
  readonly date: CalendarDate;
  readonly coin: CoinId;
  readonly units: Units;
  readonly venue: string | null;
  readonly proceeds: Money;
  readonly fee: Money | null;
  /** The sale or any of its holdings counts one-tap units. */
  readonly estimated: boolean;
  readonly holdings: readonly CessionHolding[];
  /** The log holds fewer units of the coin sold just before the sale than it sells, so no estimate is written. */
  readonly short: boolean;
  /** The recorded amounts of every `dca`, `lump`, `extra` and costed `held` entry ordered before the sale. */
  readonly costs: Money;
  /** The same entries' recorded fees. */
  readonly fees: Money;
  /** The `held` entries ordered before the sale with no recorded cost. */
  readonly heldWithoutCost: number;
};

/** The file's blocks and what its header names. */
export type TaxYearCessions = {
  readonly span: TaxYearSpan;
  readonly currency: CurrencyCode;
  readonly ongoing: boolean;
  readonly cessions: readonly Cession[];
  /** Some units of the file are one-tap estimates. */
  readonly estimated: boolean;
  /** A `held` entry before a sale has no recorded cost. */
  readonly uncosted: boolean;
  /** The coins with no close given on a sale day they were held. */
  readonly missing: readonly CoinId[];
  /** The sales whose estimate is empty: a holding has no value, or the sale is `short`. */
  readonly unvalued: number;
};

function assertPortfolioWide(rules: CountryRules): void {
  const model = rules.computationModel;
  switch (model.kind) {
    case 'portfolio-wide':
      return;
    case 'per-lot':
    case 'wealth-snapshot':
      throw new RangeError(`No cessions file for a ${model.kind} country`);
    default:
      assertNever(model);
  }
}

const ZERO = '0' as Money & Units;

/** One sale's block from the live entries ordered before it, all coins and all years. */
function cession(
  plan: Plan,
  sale: Entry,
  before: readonly Entry[],
  histories: PriceHistories,
  number: number,
): Cession {
  const held = new Map<CoinId, Units>();
  const estimates = new Set<CoinId>();
  let costs: Money = ZERO;
  let fees: Money = ZERO;
  let heldWithoutCost = 0;
  for (const entry of before) {
    const units = held.get(entry.coin) ?? ZERO;
    held.set(entry.coin, entry.kind === 'sell' ? minus(units, entry.units) : plus(units, entry.units));
    if (isEstimate(entry)) estimates.add(entry.coin);
    if (entry.kind === 'sell') continue;
    // Only a `held` entry may lack an amount (docs/DOMAIN.md §2.2); a recorded 0 is a cost.
    if (entry.amount === null) heldWithoutCost += 1;
    else [costs, fees] = [plus(costs, entry.amount), plus(fees, entry.fee ?? ZERO)];
  }
  // A sale always records an amount above 0 (docs/DOMAIN.md §2.2).
  const proceeds = sale.amount as Money;
  const sameCurrency = histories.currency === plan.payCurrency;
  const holdings = coinsWithEntries(plan, before).flatMap((coin): CessionHolding[] => {
    const units = held.get(coin) ?? ZERO;
    if (!isPositive(units)) return [];
    const estimated = estimates.has(coin);
    if (coin === sale.coin) {
      const price = loggedPrice(proceeds, sale.units, plan.payCurrency);
      // The exact quotient may not end, so it is rounded once, half-even at the digits the file writes.
      const value = quotient<Money>(product(proceeds, units), sale.units, MINOR_UNITS[plan.payCurrency], 'half-even');
      return [{ coin, units, estimated, price, source: 'sale', value }];
    }
    const history = histories.coins[coin];
    const close = sameCurrency && history !== undefined ? closeDated(history, sale.date) : null;
    if (close === null) return [{ coin, units, estimated, price: null, source: null, value: null }];
    return [{ coin, units, estimated, price: close, source: 'close', value: valueAt(units, close) }];
  });
  return {
    number,
    entry: sale.id,
    date: sale.date,
    coin: sale.coin,
    units: sale.units,
    venue: sale.venue,
    proceeds,
    fee: sale.fee,
    estimated: isEstimate(sale) || holdings.some((holding) => holding.estimated),
    holdings,
    short: compare(held.get(sale.coin) ?? ZERO, sale.units) < 0,
    costs,
    fees,
    heldWithoutCost,
  };
}

/** One year's cessions file; throws a RangeError for a country whose model is not `portfolio-wide`. */
export function taxYearCessions(
  plan: Plan,
  entries: readonly Entry[],
  rules: CountryRules,
  span: TaxYearSpan,
  histories: PriceHistories,
  today: CalendarDate,
): TaxYearCessions {
  assertPortfolioWide(rules);
  const live = liveEntries(entries).sort(compareEntries);
  const ongoing = today <= span.to;
  const last = ongoing ? today : span.to;
  const sales = live.flatMap((entry, index) =>
    entry.kind === 'sell' && span.from <= entry.date && entry.date <= last ? [{ entry, index }] : [],
  );
  const cessions = sales.map(({ entry, index }, n) => cession(plan, entry, live.slice(0, index), histories, n + 1));
  const unpriced = (sale: Cession) => sale.holdings.filter((holding) => holding.value === null);
  return {
    span,
    currency: plan.payCurrency,
    ongoing,
    cessions,
    estimated: cessions.some((sale) => sale.estimated),
    uncosted: cessions.some((sale) => sale.heldWithoutCost > 0),
    missing: coinsWithEntries(plan, live).filter((coin) =>
      cessions.some((sale) => unpriced(sale).some((holding) => holding.coin === coin)),
    ),
    unvalued: cessions.filter((sale) => sale.short || unpriced(sale).length > 0).length,
  };
}

const COLUMNS =
  'row,cession,date,coin,units,units_estimated,venue,sale_price,sale_fee,price,price_source,value,estimated_portfolio_value,purchase_costs_to_date,purchase_fees_to_date,held_without_cost_to_date';

const flag = (value: boolean) => (value ? 'yes' : 'no');

/**
 * The file, laid out as the other tax-year files: each header line as one text cell, an empty row, the columns, then
 * per sale its holding rows and its sale row. Logged amounts are written as logged, padded to the currency's minor
 * digits; values are rounded half-even at them, and the estimate is the sum of the written values, empty when one is
 * or when the sale is `short`.
 */
export function taxYearCessionsCsv(file: TaxYearCessions, header: readonly string[]): string {
  const digits = MINOR_UNITS[file.currency];
  const rows = file.cessions.flatMap((sale) => {
    const start = (row: string, coin: CoinId, units: Units, estimated: boolean) => [
      row,
      String(sale.number),
      sale.date,
      textCell(coin),
      units,
      flag(estimated),
    ];
    const values = sale.holdings.map((holding) => roundedAmountCell(holding.value, digits));
    const holdings = sale.holdings.map((holding) => [
      ...start('holding', holding.coin, holding.units, holding.estimated),
      ...['', '', '', holding.price ?? '', holding.source ?? '', roundedAmountCell(holding.value, digits)],
      ...['', '', '', ''],
    ]);
    const row = [
      ...start('sale', sale.coin, sale.units, sale.estimated),
      textCell(sale.venue ?? ''),
      paddedAmountCell(sale.proceeds, digits),
      paddedAmountCell(sale.fee, digits),
      ...['', '', ''],
      sale.short ? '' : writtenTotalCell(values, digits),
      paddedAmountCell(sale.costs, digits),
      paddedAmountCell(sale.fees, digits),
      String(sale.heldWithoutCost),
    ];
    return [...holdings, row];
  });
  return [...header.map(textCell), '', COLUMNS, ...rows.map((row) => row.join(','))].join('\n');
}
