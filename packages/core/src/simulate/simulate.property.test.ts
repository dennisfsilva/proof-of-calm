import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, type CalendarDate } from '../dates/calendar';
import {
  abs,
  compare,
  decimal,
  isNegative,
  type Money,
  minus,
  type Percent,
  type Price,
  quotient,
  type Ratio,
} from '../money/decimal';
import type { CoinId } from '../schema/ids';
import type { Split } from '../schema/plan';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { type SimulationInput, simulate } from './simulate';

const COINS = ['BTC', 'ETH', 'SOL', 'LINK'] as CoinId[];
const ORIGIN = '2015-01-01' as CalendarDate;

/** Shares in whole percent that sum to 100, from cut points in 1..99. */
const sharesArb = (count: number) =>
  fc.uniqueArray(fc.integer({ min: 1, max: 99 }), { minLength: count - 1, maxLength: count - 1 }).map((cuts) => {
    const edges = [0, ...[...cuts].sort((a, b) => a - b), 100];
    return edges.slice(1).map((edge, index) => String(edge - (edges[index] as number)) as Percent);
  });

const planArb = fc.record({
  start: fc.integer({ min: 0, max: 3000 }),
  length: fc.integer({ min: 0, max: 400 }),
  buyDay: fc.integer({ min: 1, max: 28 }),
  cents: fc.integer({ min: 1, max: 1_000_000 }),
  coins: fc.integer({ min: 1, max: 4 }).chain((count) => sharesArb(count)),
});
const closeArb = fc.integer({ min: 1, max: 100_000_000 }).map((cents) => decimal<Price>((cents / 100).toFixed(2)));

type PlanShape = { start: number; length: number; buyDay: number; cents: number; coins: Percent[] };

/** Daily closes for each coin from the day before the start to the day after the end. */
function inputOf(
  plan: PlanShape,
  closesFor: (coin: number, day: number) => Price,
  feePercent: Percent = '0' as Percent,
): SimulationInput {
  const startDate = addDays(ORIGIN, plan.start);
  const endDate = addDays(startDate, plan.length);
  const days = plan.length + 3;
  const coins: Record<string, PriceHistory> = {};
  const split: Record<string, Percent> = {};
  plan.coins.forEach((share, coin) => {
    const id = COINS[coin] as CoinId;
    split[id] = share;
    coins[id] = Array.from({ length: days }, (_, day) => [addDays(startDate, day - 1), closesFor(coin, day)]);
  });
  return {
    split: split as Split,
    monthlyAmount: decimal<Money>((plan.cents / 100).toFixed(2)),
    startDate,
    endDate,
    buyDay: plan.buyDay,
    feePercent,
    histories: { currency: 'EUR', coins: coins as PriceHistories['coins'] },
  };
}

function run(input: SimulationInput) {
  const result = simulate(input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('simulator properties (docs/EDUCATION.md §8)', () => {
  it('returns exactly 1 − fee at a constant price', () => {
    const feeArb = fc.integer({ min: 0, max: 500 }).map((bps) => decimal<Percent>((bps / 100).toFixed(2)));
    fc.assert(
      fc.property(planArb, fc.array(closeArb, { minLength: 4, maxLength: 4 }), feeArb, (plan, closes, fee) => {
        const { summary } = run(inputOf(plan, (coin) => closes[coin] as Price, fee));
        const expected = minus('1' as Ratio, quotient<Ratio>(fee, '100' as Percent, 6, 'down'));
        expect(summary.multiple).toBe(expected);
      }),
      { numRuns: 60 },
    );
  });

  it('never lowers what was invested and keeps the drawdown within −100 % and 0', () => {
    fc.assert(
      fc.property(planArb, fc.array(closeArb, { minLength: 410, maxLength: 410 }), (plan, closes) => {
        const { series, summary } = run(
          inputOf(plan, (coin, day) => closes[(day * (coin + 1)) % closes.length] as Price),
        );
        series.forEach((point, index) => {
          if (index > 0)
            expect(compare(point.invested, (series[index - 1] as typeof point).invested)).toBeGreaterThanOrEqual(0);
          expect(isNegative(point.value)).toBe(false);
          expect(compare(point.drawdown, '-100' as Percent)).toBeGreaterThanOrEqual(0);
          expect(compare(point.drawdown, '0' as Percent)).toBeLessThanOrEqual(0);
        });
        // The deepest point of the drawdown series is the maximum drawdown.
        const deepest = series.reduce(
          (low, point) => (compare(point.drawdown, low) < 0 ? point.drawdown : low),
          '0' as Percent,
        );
        expect(summary.maxDrawdown?.depth ?? '0').toBe(deepest);
      }),
      { numRuns: 40 },
    );
  });

  it('gives the same result for one coin as for N coins with identical histories', () => {
    fc.assert(
      fc.property(planArb, fc.array(closeArb, { minLength: 410, maxLength: 410 }), (plan, closes) => {
        const close = (_coin: number, day: number) => closes[day] as Price;
        const split = run(inputOf(plan, close));
        const single = run(inputOf({ ...plan, coins: ['100' as Percent] }, close));
        expect(split.series.map((point) => point.invested)).toEqual(single.series.map((point) => point.invested));
        split.series.forEach((point, index) => {
          const other = single.series[index] as typeof point;
          // Units carry 18 decimals per coin, so the values agree far below a cent.
          expect(compare(abs(minus(point.value, other.value)), '0.000000001' as Money)).toBeLessThanOrEqual(0);
        });
        const multiples = [split.summary.multiple, single.summary.multiple] as Ratio[];
        expect(
          compare(abs(minus(multiples[0] as Ratio, multiples[1] as Ratio)), '0.000001' as Ratio),
        ).toBeLessThanOrEqual(0);
      }),
      { numRuns: 40 },
    );
    // 40 runs over 410-day histories passed the 5 s default on CI (run 39439755397).
  }, 30_000);
});
