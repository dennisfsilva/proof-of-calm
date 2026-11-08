import {
  addDays,
  CHART_RANGES,
  type ChartRange,
  type Entry,
  type Instant,
  type PriceHistories,
  type PriceHistory,
} from '@proofofcalm/core';
import { anEntry, aPlan, BTC, date, ETH, money, split, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import type { HistoriesState } from './use-histories';
import { type ChartState, chartState, valueChart } from './value-chart';

// The value chart's geometry on the core's chart maths (ADR-0022, docs/DOMAIN.md §3.14), at fixed closes.

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const buy = (coin: string, day: string, quantity: string) =>
  anEntry({
    kind: 'extra',
    slot: null,
    coin: coin as never,
    date: date(day),
    units: units(quantity),
    amount: money('100'),
  });
const closes = (start: string, values: readonly string[]) =>
  values.map((value, offset) => [addDays(date(start), offset), value]) as unknown as PriceHistory;
const histories = (coins: Record<string, PriceHistory>) => ({ currency: 'EUR', coins }) as unknown as PriceHistories;
const VIEW = { width: 100, height: 50 };

describe('valueChart', () => {
  const entries = [buy('BTC', '2026-01-02', '1'), buy('BTC', '2026-01-04', '1')];
  const market = histories({ BTC: closes('2026-01-01', ['100', '110', '120', '130', '140', '150']) });

  it('draws the series on the padded value domain and the dates of the range', () => {
    // 110, 120, 260, 280, 300 from 2 to 6 January; the domain 94.8 to 315.2 (8 % of the span each side).
    expect(valueChart(plan, entries, market, 'all', VIEW)).toEqual({
      points: [
        { date: '2026-01-02', value: '110' },
        { date: '2026-01-03', value: '120' },
        { date: '2026-01-04', value: '260' },
        { date: '2026-01-05', value: '280' },
        { date: '2026-01-06', value: '300' },
      ],
      first: { date: '2026-01-02', value: '110' },
      last: { date: '2026-01-06', value: '300' },
      path: 'M0 46.6L25 44.3L50 12.5L75 8L100 3.4',
      end: { x: 100, y: 3.4 },
      // Ticks at 100, 200 and 300.
      gridlines: [48.8, 26.1, 3.4],
      low: '110',
      high: '300',
    });
  });

  it('counts each range back from the last close and keeps at most 121 points', () => {
    const long = histories({
      BTC: closes(
        '2025-01-01',
        Array.from({ length: 400 }, (_, day) => String(100 + day)),
      ),
    });
    const charts = CHART_RANGES.map((range) => valueChart(plan, [buy('BTC', '2025-01-01', '1')], long, range, VIEW));
    expect(charts.map((chart) => [chart?.points.length, chart?.points[0]?.date, chart?.points.at(-1)?.date])).toEqual([
      [8, '2026-01-28', '2026-02-04'],
      [31, '2026-01-05', '2026-02-04'],
      [91, '2025-11-06', '2026-02-04'],
      [121, '2025-02-04', '2026-02-04'],
      [121, '2025-01-01', '2026-02-04'],
    ]);
    expect(charts.every((chart) => chart?.end.x === 100)).toBe(true);
  });

  it('is null when a coin with entries has no history, or nothing was held in the range', () => {
    expect(valueChart(plan, [...entries, buy('ETH', '2026-01-03', '2')], market, 'all', VIEW)).toBeNull();
    expect(valueChart(plan, [], market, 'all', VIEW)).toBeNull();
  });

  it('draws a flat series as a level line in the middle', () => {
    const flat = histories({ BTC: closes('2026-01-01', ['100', '100', '100']) });
    const chart = valueChart(plan, [buy('BTC', '2026-01-01', '1')], flat, 'all', VIEW);
    expect(chart?.path).toBe('M0 25L50 25L100 25');
    expect([chart?.low, chart?.high]).toEqual(['100', '100']);
  });
});

// The one place the chart's state is chosen (docs/CONTENT-STYLE.md §3, "Portfolio value chart"): one row per
// state, each a named fixture, in the order chartState checks them.
describe('chartState', () => {
  const sell = (coin: string, day: string, quantity: string) => ({
    ...buy(coin, day, quantity),
    kind: 'sell' as const,
  });
  /** 365 daily closes, 21 Oct 2025 to 20 Oct 2026. */
  const year = closes(
    '2025-10-21',
    Array.from({ length: 365 }, (_, day) => String(100 + day)),
  );
  const ready = (coins: Record<string, PriceHistory>, currency = 'EUR'): HistoriesState => ({
    status: 'ready',
    histories: { ...histories(coins), currency } as PriceHistories,
    fetchedAt: '2026-10-20T14:05:00.000Z' as Instant,
  });
  const drawn = (start: string, end: string, ownDates: boolean) => ({
    kind: 'draws',
    chart: expect.objectContaining({ path: expect.any(String) }),
    ownDates,
    start,
    end,
    fetchedAt: '2026-10-20T14:05:00.000Z',
  });
  const soldOut = [buy('BTC', '2025-01-10', '1'), sell('BTC', '2025-03-01', '1')];
  /** Bought and sold on 21 Oct 2026, the day after the last close: nothing is held at the end of it. */
  const soldLater = [buy('BTC', '2026-10-21', '1'), sell('BTC', '2026-10-21', '1')];

  const rows: readonly (readonly [string, readonly Entry[], HistoriesState, ChartRange, unknown])[] = [
    ['no entries', [], ready({ BTC: year }), '30d', { kind: 'none' }],
    ['loading', [buy('BTC', '2026-01-01', '1')], { status: 'loading' }, '30d', { kind: 'loading' }],
    [
      'failed',
      [buy('BTC', '2026-01-01', '1')],
      { status: 'failed', failure: { kind: 'network' } },
      '30d',
      { kind: 'unavailable' },
    ],
    [
      'one coin with one close',
      [buy('BTC', '2026-01-01', '1')],
      ready({ BTC: closes('2026-10-20', ['100']) }),
      '30d',
      { kind: 'too-few-closes', coins: ['BTC'] },
    ],
    [
      'two coins without two closes, in chart order',
      [buy('ETH', '2026-01-01', '1'), buy('BTC', '2026-01-02', '1')],
      ready({ BTC: closes('2026-10-20', ['100']) }),
      'all',
      { kind: 'too-few-closes', coins: ['BTC', 'ETH'] },
    ],
    [
      'a purchase of a coin outside the catalogue beside coins with closes',
      [buy('BTC', '2026-01-01', '1'), buy('ETH', '2026-01-01', '1'), buy('KAS', '2026-02-01', '100')],
      ready({ BTC: year, ETH: year }),
      '30d',
      { kind: 'too-few-closes', coins: ['KAS'] },
    ],
    [
      'only coins outside the catalogue, whose closes are never asked for',
      [buy('KAS', '2026-02-01', '100')],
      { status: 'loading' },
      '30d',
      { kind: 'too-few-closes', coins: ['KAS'] },
    ],
    [
      'a coin outside the catalogue beside a read that failed',
      [buy('BTC', '2026-01-01', '1'), buy('KAS', '2026-02-01', '100')],
      { status: 'failed', failure: { kind: 'network' } },
      '30d',
      { kind: 'unavailable' },
    ],
    [
      'closes in another currency',
      [buy('BTC', '2026-01-01', '1')],
      ready({ BTC: year }, 'USD'),
      '30d',
      { kind: 'unavailable' },
    ],
    [
      'a range that draws',
      [buy('BTC', '2026-01-01', '1')],
      ready({ BTC: year }),
      '30d',
      drawn('2026-09-20', '2026-10-20', false),
    ],
    [
      'closes starting after the 30d range’s first day',
      [buy('BTC', '2026-10-01', '1')],
      ready({ BTC: closes('2026-10-18', ['100', '110', '121']) }),
      '30d',
      drawn('2026-10-18', '2026-10-20', true),
    ],
    [
      '7d empty while all draws',
      [buy('BTC', '2026-01-01', '1'), sell('BTC', '2026-10-01', '1')],
      ready({ BTC: year }),
      '7d',
      { kind: 'range-empty', range: '7d', start: '2026-10-13', end: '2026-10-20' },
    ],
    [
      'every entry after the last close',
      [buy('BTC', '2026-10-22', '1')],
      ready({ BTC: year }),
      'all',
      { kind: 'starts-later', end: '2026-10-20' },
    ],
    [
      'bought on one day and sold the next, both after the last close',
      [buy('BTC', '2026-10-22', '1'), sell('BTC', '2026-10-23', '1')],
      ready({ BTC: year }),
      'all',
      { kind: 'starts-later', end: '2026-10-20' },
    ],
    [
      'bought and sold on one day after the last close',
      soldLater,
      ready({ BTC: year }),
      'all',
      { kind: 'nothing-held', start: '2025-10-21', end: '2026-10-20' },
    ],
    [
      'only sales after the last close',
      [sell('BTC', '2026-10-21', '1'), sell('BTC', '2026-10-25', '0.5')],
      ready({ BTC: year }),
      'all',
      { kind: 'nothing-held', start: '2025-10-21', end: '2026-10-20' },
    ],
    [
      'sold out before the closes start',
      soldOut,
      ready({ BTC: year }),
      'all',
      { kind: 'nothing-held', start: '2025-10-21', end: '2026-10-20' },
    ],
    [
      'sold on the first close day',
      [buy('BTC', '2025-09-01', '1'), sell('BTC', '2025-10-21', '1')],
      ready({ BTC: year }),
      '90d',
      { kind: 'nothing-held', start: '2025-10-21', end: '2026-10-20' },
    ],
  ];

  it.each(rows)('%s', (_, entries, state, range, expected) => {
    expect(chartState(plan, entries, state, range, VIEW)).toEqual(expected);
  });

  it.each([
    ['before the closes', soldOut],
    ['after the last close', soldLater],
  ])('says a plan sold out %s held nothing on every range, never that the chart starts later', (_, sold) => {
    const states = CHART_RANGES.map((range) => chartState(plan, sold, ready({ BTC: year }), range, VIEW));
    expect(states).toEqual(
      CHART_RANGES.map(
        (): ChartState => ({ kind: 'nothing-held', start: date('2025-10-21'), end: date('2026-10-20') }),
      ),
    );
  });
});
