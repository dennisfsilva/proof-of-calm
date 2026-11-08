// The simulator (docs/EDUCATION.md §8): what buying the same amount every month into a split would have
// done over past daily closes, the years it hurt included. Slots come from the plan's generator and
// each month's amount is split over the coins as a plan splits it.
import { addMonthsClamped, type CalendarDate, compareDates } from '../dates/calendar';
import { MINOR_UNITS } from '../money/currency';
import {
  compare,
  decimalPlaces,
  isNegative,
  isPositive,
  type Money,
  minus,
  type Percent,
  type Price,
  percentOf,
  plus,
  product,
  quotient,
  round,
  sum,
  type Units,
} from '../money/decimal';
import { splitLargestRemainder } from '../money/split';
import { type Slot, slots } from '../plan/slots';
import { err, ok, type Result } from '../result';
import type { CoinId } from '../schema/ids';
import type { Split } from '../schema/plan';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { type SimulatedDays, type SimulationPoint, type SimulationSummary, series, summarize } from './summary';

export type { MaxDrawdown, SimulationPoint, SimulationSummary, UnderwaterPeriod } from './summary';

export type SimulationInput = {
  /** Shares in percent, as a plan's split; on a tie the cent left over goes to the earlier coin. */
  readonly split: Split;
  /** In the currency of the histories, whose minor unit splits it. */
  readonly monthlyAmount: Money;
  /** The first buy; every later one is on `buyDay`. */
  readonly startDate: CalendarDate;
  /** The last day simulated and the latest possible buy. */
  readonly endDate: CalendarDate;
  readonly buyDay: number;
  /** A flat fee taken from every buy, in percent; none by default. */
  readonly feePercent?: Percent;
  /** Daily closes per coin, all in one currency (docs/DOMAIN.md §3.11). */
  readonly histories: PriceHistories;
};

export type SimulationError =
  | { readonly code: 'invalid-split' }
  | { readonly code: 'invalid-amount' }
  | { readonly code: 'invalid-fee' }
  | { readonly code: 'invalid-buy-day' }
  | { readonly code: 'invalid-dates' }
  | { readonly code: 'history-missing'; readonly coin: CoinId }
  | { readonly code: 'history-starts-later'; readonly coin: CoinId; readonly first: CalendarDate }
  | { readonly code: 'history-ends-earlier'; readonly coin: CoinId; readonly last: CalendarDate };

/** One buy of one coin at the close of the day it was made. */
export type SimulatedBuy = {
  readonly coin: CoinId;
  readonly due: CalendarDate;
  /** The due date, or the next day with a close when the data has a gap. */
  readonly date: CalendarDate;
  readonly amount: Money;
  readonly fee: Money;
  readonly units: Units;
  readonly close: Price;
};

/** A due date without a close: bought on `filled` instead, or not at all before the end (null). */
export type SimulationGap = { readonly coin: CoinId; readonly due: CalendarDate; readonly filled: CalendarDate | null };

export type Simulation = {
  readonly summary: SimulationSummary;
  readonly series: readonly SimulationPoint[];
  readonly buys: readonly SimulatedBuy[];
  readonly gaps: readonly SimulationGap[];
};

type Run = SimulatedDays & { readonly buys: readonly SimulatedBuy[]; readonly gaps: readonly SimulationGap[] };

/** Units keep 18 decimals: a buy at an unchanged price is then worth its amount to within 1e-12. */
const UNIT_DECIMALS = 18;
/** The value series carries ten decimals, like an average price (docs/DOMAIN.md §3.6). */
const VALUE_DECIMALS = 10;
const PERCENT_DECIMALS = 4;
/** The sensitivity table starts the plan in each of this many months (docs/EDUCATION.md §7). */
const SENSITIVITY_MONTHS = 12;

type Funded = { readonly coin: CoinId; readonly share: Percent; readonly history: PriceHistory };

const minorDigits = (input: SimulationInput) => MINOR_UNITS[input.histories.currency];

function inputError(input: SimulationInput): SimulationError | null {
  const shares = Object.values(input.split);
  if (
    shares.some((share) => isNegative(share) || decimalPlaces(share) > PERCENT_DECIMALS) ||
    compare(sum(shares), '100' as Percent) !== 0
  ) {
    return { code: 'invalid-split' };
  }
  if (!isPositive(input.monthlyAmount) || decimalPlaces(input.monthlyAmount) > minorDigits(input)) {
    return { code: 'invalid-amount' };
  }
  const fee = input.feePercent ?? ('0' as Percent);
  if (isNegative(fee) || compare(fee, '100' as Percent) >= 0 || decimalPlaces(fee) > PERCENT_DECIMALS) {
    return { code: 'invalid-fee' };
  }
  if (!Number.isInteger(input.buyDay) || input.buyDay < 1 || input.buyDay > 28) return { code: 'invalid-buy-day' };
  if (input.endDate < input.startDate) return { code: 'invalid-dates' };
  return null;
}

/** The coins with a share, each with a history that covers the whole simulation. */
function prepare(input: SimulationInput): Result<Funded[], SimulationError> {
  const invalid = inputError(input);
  if (invalid !== null) return err(invalid);
  const coins: Funded[] = [];
  for (const [coin, share] of Object.entries(input.split) as [CoinId, Percent][]) {
    if (!isPositive(share)) continue;
    const history = input.histories.coins[coin] ?? [];
    const first = history[0];
    const last = history.at(-1);
    if (first === undefined || last === undefined) return err({ code: 'history-missing', coin });
    if (first[0] > input.startDate) return err({ code: 'history-starts-later', coin, first: first[0] });
    if (last[0] < input.endDate) return err({ code: 'history-ends-earlier', coin, last: last[0] });
    coins.push({ coin, share, history });
  }
  return ok(coins);
}

/** Every slot bought at the close of its due date, or of the next day with a close, up to the end. */
function buysOf(funded: Funded, amount: Money, fee: Money, schedule: readonly Slot[], endDate: CalendarDate) {
  const buys: SimulatedBuy[] = [];
  const gaps: SimulationGap[] = [];
  const { coin, history } = funded;
  const net = minus(amount, fee);
  let index = 0;
  for (const { due } of schedule) {
    // The history reaches the end date, so there is a close on or after every due date.
    while ((history[index] as PriceHistory[number])[0] < due) index += 1;
    const [date, close] = history[index] as PriceHistory[number];
    if (date > endDate) {
      gaps.push({ coin, due, filled: null });
      continue;
    }
    if (date !== due) gaps.push({ coin, due, filled: date });
    buys.push({ coin, due, date, amount, fee, units: quotient<Units>(net, close, UNIT_DECIMALS, 'down'), close });
  }
  return { buys, gaps };
}

/** One coin while the days are walked: its buys and gaps, where it is in its history, what it holds. */
type CoinState = {
  readonly coin: CoinId;
  readonly history: PriceHistory;
  readonly buys: readonly SimulatedBuy[];
  readonly gaps: readonly SimulationGap[];
  next: number;
  applied: number;
  close: Price;
  units: Units;
};

/**
 * Moves to the latest close on or before `date` (the history starts on or before the first day),
 * checking on the way that the closes are positive and in date order: the data is ours, so a bad
 * history is a programmer error.
 */
function moveTo(state: CoinState, date: CalendarDate): void {
  while (state.next < state.history.length && (state.history[state.next] as PriceHistory[number])[0] <= date) {
    const [day, close] = state.history[state.next] as PriceHistory[number];
    const previous = state.history[state.next - 1];
    if (!isPositive(close) || (previous !== undefined && previous[0] >= day)) {
      throw new RangeError(`The ${state.coin} history needs positive closes in date order (${day})`);
    }
    state.close = close;
    state.next += 1;
  }
}

/** Takes in the buys made on `date` and returns what they cost. */
function buyOn(state: CoinState, date: CalendarDate): Money {
  let paid = '0' as Money;
  while (state.applied < state.buys.length && (state.buys[state.applied] as SimulatedBuy).date === date) {
    const buy = state.buys[state.applied] as SimulatedBuy;
    state.units = plus(state.units, buy.units);
    paid = plus(paid, buy.amount);
    state.applied += 1;
  }
  return paid;
}

function run(input: SimulationInput, coins: readonly Funded[]): Run {
  const amounts = splitLargestRemainder(
    input.monthlyAmount,
    coins.map((coin) => coin.share),
    minorDigits(input),
  );
  const schedule = slots({ ...input, firstBuy: input.startDate, lastBuy: input.endDate });
  const feePercent = input.feePercent ?? ('0' as Percent);
  const states = coins.map((coin, index): CoinState => {
    const amount = amounts[index] as Money;
    // A monthly amount too small to give every coin a cent leaves a coin without buys.
    const bought = isPositive(amount)
      ? buysOf(coin, amount, percentOf(amount, feePercent), schedule, input.endDate)
      : { buys: [], gaps: [] };
    return {
      ...bought,
      coin: coin.coin,
      history: coin.history,
      next: 0,
      applied: 0,
      close: '0' as Price,
      units: '0' as Units,
    };
  });

  const days = new Set<CalendarDate>();
  for (const coin of coins) {
    for (const [date] of coin.history) if (date >= input.startDate && date <= input.endDate) days.add(date);
  }
  const dates = [...days].sort(compareDates);
  const invested: Money[] = [];
  const values: Money[] = [];
  let paid = '0' as Money;
  for (const date of dates) {
    let value = '0' as Money;
    for (const state of states) {
      moveTo(state, date);
      paid = plus(paid, buyOn(state, date));
      value = plus(value, product<Money>(state.units, state.close));
    }
    invested.push(paid);
    values.push(round(value, VALUE_DECIMALS, 'half-even'));
  }
  const buys = states.flatMap((state) => state.buys);
  return { dates, invested, values, buys, gaps: states.flatMap((state) => state.gaps) };
}

/** The simulation of `input`, or why it cannot be run (a user's choice the data cannot cover). */
export function simulate(input: SimulationInput): Result<Simulation, SimulationError> {
  const coins = prepare(input);
  if (!coins.ok) return coins;
  const result = run(input, coins.value);
  return ok({
    summary: summarize(result, result.gaps.length, minorDigits(input)),
    series: series(result),
    buys: result.buys,
    gaps: result.gaps,
  });
}

export type SensitivityRow = {
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly result: Result<SimulationSummary, SimulationError>;
};

/**
 * The start-date sensitivity table: the same plan (amount, split, buy day, fee and length in months)
 * started in each of the twelve months up to and including its own start, oldest first, so every row
 * ends within the data the plan itself uses. A row the data cannot cover carries its error.
 */
export function startDateSensitivity(input: SimulationInput): SensitivityRow[] {
  return Array.from({ length: SENSITIVITY_MONTHS }, (_, index) => {
    const offset = index - (SENSITIVITY_MONTHS - 1);
    const shifted = {
      ...input,
      startDate: addMonthsClamped(input.startDate, offset),
      endDate: addMonthsClamped(input.endDate, offset),
    };
    const coins = prepare(shifted);
    if (!coins.ok) return { startDate: shifted.startDate, endDate: shifted.endDate, result: coins };
    const result = run(shifted, coins.value);
    const summary = summarize(result, result.gaps.length, minorDigits(input));
    return { startDate: shifted.startDate, endDate: shifted.endDate, result: ok(summary) };
  });
}
