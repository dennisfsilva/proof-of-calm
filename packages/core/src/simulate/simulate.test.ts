import { describe, expect, it } from 'vitest';
import { date, money, split } from '../../test/builders';
import { addDays, daysBetween } from '../dates/calendar';
import type { Percent, Price } from '../money/decimal';
import type { CoinId } from '../schema/ids';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { type SimulationInput, simulate, startDateSensitivity } from './simulate';

/** Histories in euros. */
const eur = (coins: Record<string, PriceHistory>): PriceHistories => ({
  currency: 'EUR',
  coins: coins as PriceHistories['coins'],
});

const history = (closes: Record<string, string>): PriceHistory =>
  Object.entries(closes).map(([day, close]) => [date(day), close as Price]);

/** A close every day from `from` to `to`, all at `close`. */
const constant = (from: string, to: string, close: string): PriceHistory =>
  Array.from({ length: daysBetween(date(from), date(to)) + 1 }, (_, index) => [
    addDays(date(from), index),
    close as Price,
  ]);

// Two coins over a quarter. ETH has no close on 1 February, so its February buy waits for the 15th.
const quarter: SimulationInput = {
  split: split({ BTC: '60', ETH: '40' }),
  monthlyAmount: money('100'),
  startDate: date('2026-01-01'),
  endDate: date('2026-03-31'),
  buyDay: 1,
  histories: eur({
    BTC: history({
      '2025-12-31': '100',
      '2026-01-01': '100',
      '2026-01-15': '50',
      '2026-02-01': '50',
      '2026-02-15': '75',
      '2026-03-01': '120',
      '2026-03-31': '150',
      '2026-04-01': '150',
    }),
    ETH: history({
      '2025-12-31': '10',
      '2026-01-01': '10',
      '2026-01-15': '5',
      '2026-02-15': '5',
      '2026-03-01': '8',
      '2026-03-31': '12',
    }),
  }),
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('simulate (docs/EDUCATION.md §8)', () => {
  it('buys each slot at the close of its due date and follows invested, value and drawdown', () => {
    const { series } = unwrap(simulate(quarter));
    expect(series.map((point) => [point.date, point.invested, point.value, point.drawdown])).toEqual([
      ['2026-01-01', '100', '100', '0'],
      ['2026-01-15', '100', '50', '-50'],
      // BTC's February buy is in; ETH's waits for its next close.
      ['2026-02-01', '160', '110', '0'],
      ['2026-02-15', '200', '195', '0'],
      ['2026-03-01', '300', '412', '0'],
      ['2026-03-31', '300', '549', '0'],
    ]);
  });

  it('counts a gap in the data and buys on the next close', () => {
    const { buys, gaps, summary } = unwrap(simulate(quarter));
    expect(gaps).toEqual([{ coin: 'ETH', due: '2026-02-01', filled: '2026-02-15' }]);
    expect(summary.gaps).toBe(1);
    expect(buys.map((buy) => [buy.coin, buy.due, buy.date, buy.amount, buy.units, buy.close])).toEqual([
      ['BTC', '2026-01-01', '2026-01-01', '60', '0.6', '100'],
      ['BTC', '2026-02-01', '2026-02-01', '60', '1.2', '50'],
      ['BTC', '2026-03-01', '2026-03-01', '60', '0.5', '120'],
      ['ETH', '2026-01-01', '2026-01-01', '40', '4', '10'],
      ['ETH', '2026-02-01', '2026-02-15', '40', '8', '5'],
      ['ETH', '2026-03-01', '2026-03-01', '40', '5', '8'],
    ]);
  });

  it('sums up with the multiple, the deepest fall with its dates, time under water and months in loss', () => {
    expect(unwrap(simulate(quarter)).summary).toEqual({
      invested: '300',
      value: '549',
      multiple: '1.83',
      maxDrawdown: { depth: '-50', peak: '2026-01-01', trough: '2026-01-15', recovery: '2026-02-01' },
      longestUnderwater: { from: '2026-01-01', to: '2026-02-01', days: 31, recovered: true },
      // January ended at 50 for 100 paid, February at 195 for 200; March at 549 for 300.
      monthsInLoss: 2,
      months: 3,
      gaps: 1,
    });
  });

  it('takes the fee from every buy and still counts the full amount as invested', () => {
    const flat = constant('2025-12-01', '2026-12-31', '30000');
    const { summary } = unwrap(
      simulate({
        ...quarter,
        split: split({ BTC: '100' }),
        feePercent: '1.5' as Percent,
        histories: eur({ BTC: flat }),
      }),
    );
    expect([summary.invested, summary.multiple, summary.monthsInLoss]).toEqual(['300', '0.985', 3]);
  });

  it('picks the deepest fall and the longest stretch under water, which can differ', () => {
    const { summary } = unwrap(
      simulate({
        ...quarter,
        split: split({ BTC: '100' }),
        monthlyAmount: money('10'),
        startDate: date('2026-01-01'),
        endDate: date('2026-01-31'),
        histories: eur({
          BTC: history({
            '2026-01-01': '100',
            '2026-01-02': '50',
            '2026-01-03': '100',
            '2026-01-04': '90',
            '2026-01-20': '95',
            '2026-01-31': '99',
          }),
        }),
      }),
    );
    expect(summary.maxDrawdown).toEqual({
      depth: '-50',
      peak: '2026-01-01',
      trough: '2026-01-02',
      recovery: '2026-01-03',
    });
    expect(summary.longestUnderwater).toEqual({ from: '2026-01-03', to: '2026-01-31', days: 28, recovered: false });
  });

  it('buys twice on the next close when the data misses more than a month, and not at all after the end', () => {
    const sparse = history({ '2025-12-31': '10', '2026-01-01': '10', '2026-03-05': '20', '2026-04-10': '20' });
    const result = unwrap(
      simulate({
        ...quarter,
        split: split({ BTC: '100' }),
        endDate: date('2026-04-02'),
        histories: eur({ BTC: sparse }),
      }),
    );
    expect(result.gaps).toEqual([
      { coin: 'BTC', due: '2026-02-01', filled: '2026-03-05' },
      { coin: 'BTC', due: '2026-03-01', filled: '2026-03-05' },
      { coin: 'BTC', due: '2026-04-01', filled: null },
    ]);
    expect(result.series.map((point) => [point.date, point.invested, point.value])).toEqual([
      ['2026-01-01', '100', '100'],
      ['2026-03-05', '300', '400'],
    ]);
  });

  it('gives a coin no buys when the monthly amount is too small to give it a cent', () => {
    const flat = constant('2025-12-01', '2026-12-31', '2');
    const { buys, summary } = unwrap(
      simulate({
        ...quarter,
        monthlyAmount: money('0.01'),
        split: split({ BTC: '50', ETH: '50' }),
        histories: eur({ BTC: flat, ETH: flat }),
      }),
    );
    expect(buys.map((buy) => buy.coin)).toEqual(['BTC', 'BTC', 'BTC']);
    expect(summary.invested).toBe('0.03');
  });

  it('has nothing to show when the data misses the whole period', () => {
    const result = unwrap(
      simulate({
        ...quarter,
        split: split({ BTC: '100' }),
        startDate: date('2026-01-10'),
        endDate: date('2026-01-12'),
        histories: eur({ BTC: history({ '2026-01-09': '10', '2026-01-13': '10' }) }),
      }),
    );
    expect(result.series).toEqual([]);
    expect(result.summary).toEqual({
      invested: '0',
      value: '0',
      multiple: null,
      maxDrawdown: null,
      longestUnderwater: null,
      monthsInLoss: 0,
      months: 0,
      gaps: 1,
    });
  });

  it('leaves out a coin with a zero share, which needs no history', () => {
    const result = unwrap(simulate({ ...quarter, split: split({ BTC: '100', SOL: '0' }) }));
    expect(new Set(result.buys.map((buy) => buy.coin))).toEqual(new Set(['BTC']));
  });

  it('says why a simulation cannot run', () => {
    const run = (overrides: Partial<SimulationInput>) => simulate({ ...quarter, ...overrides });
    const errorOf = (overrides: Partial<SimulationInput>) => {
      const result = run(overrides);
      return result.ok ? null : result.error;
    };
    expect(errorOf({ split: split({ BTC: '60', ETH: '30' }) })).toEqual({ code: 'invalid-split' });
    expect(errorOf({ split: split({ BTC: '110', ETH: '-10' }) })).toEqual({ code: 'invalid-split' });
    expect(errorOf({ split: split({ BTC: '60.00001', ETH: '39.99999' }) })).toEqual({ code: 'invalid-split' });
    expect(errorOf({ split: split({}) })).toEqual({ code: 'invalid-split' });
    expect(errorOf({ monthlyAmount: money('0') })).toEqual({ code: 'invalid-amount' });
    expect(errorOf({ monthlyAmount: money('10.001') })).toEqual({ code: 'invalid-amount' });
    expect(errorOf({ feePercent: '-1' as Percent })).toEqual({ code: 'invalid-fee' });
    expect(errorOf({ feePercent: '100' as Percent })).toEqual({ code: 'invalid-fee' });
    expect(errorOf({ feePercent: '0.12345' as Percent })).toEqual({ code: 'invalid-fee' });
    expect(errorOf({ buyDay: 0 })).toEqual({ code: 'invalid-buy-day' });
    expect(errorOf({ buyDay: 29 })).toEqual({ code: 'invalid-buy-day' });
    expect(errorOf({ buyDay: 1.5 })).toEqual({ code: 'invalid-buy-day' });
    expect(errorOf({ endDate: date('2025-12-31') })).toEqual({ code: 'invalid-dates' });
    expect(errorOf({ histories: eur({ BTC: quarter.histories.coins['BTC' as CoinId] as PriceHistory }) })).toEqual({
      code: 'history-missing',
      coin: 'ETH',
    });
    expect(errorOf({ histories: eur({ ...quarter.histories.coins, ETH: [] }) })).toEqual({
      code: 'history-missing',
      coin: 'ETH',
    });
    expect(errorOf({ startDate: date('2025-12-30') })).toEqual({
      code: 'history-starts-later',
      coin: 'BTC',
      first: '2025-12-31',
    });
    expect(errorOf({ endDate: date('2026-04-01') })).toEqual({
      code: 'history-ends-earlier',
      coin: 'ETH',
      last: '2026-03-31',
    });
  });

  it('refuses history that is out of date order or has a close that is not positive', () => {
    const swapped = history({ '2025-12-31': '10', '2026-01-02': '10', '2026-01-01': '10', '2026-04-01': '10' });
    // A zero close on a day without a buy: the value would collapse without a warning.
    const zero = history({ '2025-12-31': '10', '2026-01-01': '10', '2026-01-15': '0', '2026-04-01': '10' });
    const one = (prices: PriceHistory) => () =>
      simulate({ ...quarter, split: split({ BTC: '100' }), histories: eur({ BTC: prices }) });
    expect(one(swapped)).toThrow(RangeError);
    expect(one(zero)).toThrow(RangeError);
  });
});

describe('startDateSensitivity', () => {
  const flat = constant('2025-01-01', '2027-12-31', '40000');
  const input: SimulationInput = {
    ...quarter,
    split: split({ BTC: '100' }),
    startDate: date('2026-06-30'),
    endDate: date('2026-12-31'),
    buyDay: 28,
    histories: eur({ BTC: flat }),
  };

  it('starts the same plan in each of the twelve months up to its own start, as long and oldest first', () => {
    const rows = startDateSensitivity(input);
    expect(rows.map((row) => [row.startDate, row.endDate])).toEqual([
      ['2025-07-30', '2026-01-31'],
      ['2025-08-30', '2026-02-28'],
      ['2025-09-30', '2026-03-31'],
      ['2025-10-30', '2026-04-30'],
      ['2025-11-30', '2026-05-31'],
      ['2025-12-30', '2026-06-30'],
      ['2026-01-30', '2026-07-31'],
      ['2026-02-28', '2026-08-31'],
      ['2026-03-30', '2026-09-30'],
      ['2026-04-30', '2026-10-31'],
      ['2026-05-30', '2026-11-30'],
      ['2026-06-30', '2026-12-31'],
    ]);
    const last = rows.at(-1)?.result;
    expect(last?.ok && last.value).toEqual(unwrap(simulate(input)).summary);
    for (const row of rows) expect(row.result.ok && row.result.value.multiple).toBe('1');
  });

  it('gives each row the data cannot cover its own error', () => {
    const rows = startDateSensitivity({
      ...input,
      histories: eur({ BTC: constant('2025-10-01', '2027-12-31', '1') }),
    });
    expect(rows.slice(0, 3).map((row) => row.result)).toEqual([
      { ok: false, error: { code: 'history-starts-later', coin: 'BTC', first: '2025-10-01' } },
      { ok: false, error: { code: 'history-starts-later', coin: 'BTC', first: '2025-10-01' } },
      { ok: false, error: { code: 'history-starts-later', coin: 'BTC', first: '2025-10-01' } },
    ]);
    expect(rows.slice(3).every((row) => row.result.ok)).toBe(true);
  });
});
