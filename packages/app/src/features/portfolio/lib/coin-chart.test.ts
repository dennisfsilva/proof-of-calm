import { addDays, type CalendarDate, type Price, type PriceHistory } from '@proofofcalm/core';
import { anEntry, date, instant, money, units } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { coinChart } from './coin-chart';

// One coin's row chart on the core's chart maths (ADR-0022, docs/DOMAIN.md §3.14), at fixed closes: the
// coin's live buys and sales inside the range as marks, the average cost as a level inside the domain.

const entry = (coin: string, kind: 'extra' | 'sell', day: string, amount: string, quantity: string) =>
  anEntry({
    kind,
    slot: null,
    coin: coin as never,
    date: date(day),
    units: units(quantity),
    amount: money(amount),
  });
const closes = (start: string, values: readonly string[]) =>
  values.map((value, offset) => [addDays(date(start), offset), value]) as unknown as PriceHistory;
const range = (start: string, end: string) => ({ start: date(start), end: date(end) });
const price = (value: string) => value as Price;
const VIEW = { width: 100, height: 50 };

// 100 to 150 from 1 to 6 January: the domain 96 to 154 (8 % of the span each side), a day every 20 px.
const history = closes('2026-01-01', ['100', '110', '120', '130', '140', '150']);
const january = range('2026-01-01', '2026-01-06');

describe('coinChart', () => {
  it("marks only the coin's live entries inside the range, a buy as a circle and a sale as a square", () => {
    const bought = entry('BTC', 'extra', '2026-01-02', '100', '1');
    const sold = entry('BTC', 'sell', '2026-01-04', '260', '2');
    const entries = [
      bought,
      sold,
      entry('ETH', 'extra', '2026-01-03', '100', '1'),
      { ...entry('BTC', 'extra', '2026-01-05', '100', '1'), deletedAt: instant('2026-01-05T10:00:00.000Z') },
    ];
    const chart = coinChart(entries, 'BTC' as never, history, january, null, VIEW);
    // At the price paid: 100 and 130 a unit, as the prototype's drawChart places them.
    expect(chart?.markers).toEqual([
      { id: bought.id, kind: 'buy', x: 20, y: 46.6 },
      { id: sold.id, kind: 'sell', x: 60, y: 20.7 },
    ]);
    // The tooltip's parts: what was bought and sold on each point's day.
    expect(chart?.points.map(({ date: day, bought: buy, sold: sale }) => [day, buy, sale])).toEqual([
      ['2026-01-01', null, null],
      ['2026-01-02', '100', null],
      ['2026-01-03', null, null],
      ['2026-01-04', null, '260'],
      ['2026-01-05', null, null],
      ['2026-01-06', null, null],
    ]);
  });

  it('draws no mark for coins held with no cost, and adds nothing for them to the day bought', () => {
    const held = (day: string, amount: string | null) =>
      anEntry({
        kind: 'held',
        slot: null,
        fee: null,
        date: date(day),
        units: units('1'),
        amount: amount === null ? null : money(amount),
      });
    const bought = entry('BTC', 'extra', '2026-01-02', '100', '1');
    const entries = [bought, held('2026-01-02', null), held('2026-01-03', null), held('2026-01-05', '0')];
    const chart = coinChart(entries, 'BTC' as never, history, january, null, VIEW);
    expect(chart?.markers).toEqual([{ id: bought.id, kind: 'buy', x: 20, y: 46.6 }]);
    expect(chart?.points.map(({ bought: buy }) => buy)).toEqual([null, '100', null, null, '0', null]);
  });

  it('draws no mark for a buy outside the range', () => {
    const entries = [entry('BTC', 'extra', '2025-12-31', '100', '1'), entry('BTC', 'extra', '2026-01-07', '100', '1')];
    expect(coinChart(entries, 'BTC' as never, history, january, null, VIEW)?.markers).toEqual([]);
  });

  it('draws the price line, the last point and the extremes on the padded domain', () => {
    expect(coinChart([], 'BTC' as never, history, january, null, VIEW)).toMatchObject({
      path: 'M0 46.6L20 37.9L40 29.3L60 20.7L80 12.1L100 3.4',
      end: { x: 100, y: 3.4 },
      low: '100',
      high: '150',
    });
  });

  it('draws no average without a position, and none outside the domain', () => {
    expect(coinChart([], 'BTC' as never, history, january, null, VIEW)?.average).toBeNull();
    expect(coinChart([], 'BTC' as never, history, january, price('120'), VIEW)?.average).toEqual({
      y: 29.3,
      price: '120',
    });
    expect(coinChart([], 'BTC' as never, history, january, price('200'), VIEW)?.average).toBeNull();
  });

  it('is null with fewer than two closes inside the range', () => {
    expect(coinChart([], 'BTC' as never, history, range('2026-01-06', '2026-01-20'), null, VIEW)).toBeNull();
    expect(coinChart([], 'BTC' as never, [] as unknown as PriceHistory, january, null, VIEW)).toBeNull();
  });

  it("draws on the closes' own dates when they start after the range's first day", () => {
    const chart = coinChart([], 'BTC' as never, history, range('2025-12-07', '2026-01-06'), null, VIEW);
    expect(chart?.points[0]).toMatchObject({ date: '2026-01-01', x: 0 });
    expect(chart?.points.at(-1)).toMatchObject({ date: '2026-01-06', x: 100 });
  });

  it("keeps the close of every entry's day when a long range is thinned", () => {
    const year = closes(
      '2025-01-01',
      Array.from({ length: 365 }, (_, day) => String(100 + day)),
    );
    const day = addDays(date('2025-01-01'), 199) as CalendarDate;
    const bought = entry('BTC', 'extra', day, '50', '1');
    const chart = coinChart([bought], 'BTC' as never, year, range('2025-01-01', '2025-12-31'), null, VIEW);
    expect(chart?.points.length).toBeLessThanOrEqual(122);
    expect(chart?.points.find((point) => point.date === day)).toMatchObject({ close: '299', bought: '50' });
  });
});
