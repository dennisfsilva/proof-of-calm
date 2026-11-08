import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, split, units } from '../../test/builders';
import { addDays, type CalendarDate } from '../dates/calendar';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { closeOn, heldValueSeries, valueRange, valueSeries } from './series';

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const closes = (start: string, values: readonly string[]) =>
  values.map((value, offset) => [addDays(date(start), offset), value]) as unknown as PriceHistory;
const histories = (coins: Record<string, PriceHistory>, currency = 'EUR') =>
  ({ currency, coins }) as unknown as PriceHistories;
const trade = (kind: 'extra' | 'sell', coin: string, day: string, quantity: string) =>
  anEntry({ kind, slot: null, coin: coin as never, date: date(day), units: units(quantity), amount: money('100') });
const points = (series: readonly { date: CalendarDate; value: string }[] | null) =>
  series?.map((point) => [point.date, point.value]);

describe('closeOn (the prototype’s at())', () => {
  const history = closes('2026-01-02', ['100', '110', '120']);
  const gapped = [history[0], history[2]] as unknown as PriceHistory;

  it('reads the close of the date, else the next close, else the last', () => {
    expect(closeOn(history, date('2026-01-03'))).toBe('110');
    expect(closeOn(gapped, date('2026-01-03'))).toBe('120');
    expect(closeOn(history, date('2026-01-01'))).toBe('100');
    expect(closeOn(history, date('2026-02-01'))).toBe('120');
  });

  it('needs at least one close', () => {
    expect(() => closeOn([] as unknown as PriceHistory, date('2026-01-01'))).toThrow('Missing a close');
  });
});

describe('valueSeries (docs/DOMAIN.md §3.11)', () => {
  const entries = [
    trade('extra', 'BTC', '2026-01-02', '1'),
    trade('extra', 'ETH', '2026-01-03', '10'),
    trade('extra', 'BTC', '2026-01-04', '1'),
    trade('sell', 'BTC', '2026-01-05', '0.5'),
  ];
  const market = histories({
    BTC: closes('2026-01-01', ['100', '110', '120', '130', '140', '150']),
    ETH: closes('2026-01-02', ['10', '11', '12', '13', '14']),
  });

  it('values the units held on each date at that date’s close, purchases and sales included', () => {
    expect(points(valueSeries(plan, entries, market, 'all'))).toEqual([
      ['2026-01-02', '110'],
      ['2026-01-03', '230'],
      ['2026-01-04', '380'],
      ['2026-01-05', '340'],
      ['2026-01-06', '365'],
    ]);
  });

  it('shows the dates of the range before anything was held at zero', () => {
    expect(points(valueSeries(plan, entries, market, '7d'))?.slice(0, 2)).toEqual([
      ['2026-01-01', '0'],
      ['2026-01-02', '110'],
    ]);
  });

  it('counts each range back from the last close; all starts at the first entry', () => {
    const year = histories({
      BTC: closes(
        '2025-01-01',
        Array.from({ length: 400 }, () => '100'),
      ),
    });
    const held = [trade('extra', 'BTC', '2025-01-01', '1')];
    const lengths = (['7d', '30d', '90d', '1y', 'all'] as const).map(
      (range) => valueSeries(plan, held, year, range)?.length,
    );
    expect(lengths).toEqual([8, 31, 91, 366, 400]);
  });

  it('takes the grid of the longest history, whichever coin has it', () => {
    const both = [trade('extra', 'BTC', '2026-01-01', '1'), trade('extra', 'ETH', '2026-01-01', '1')];
    const market = histories({
      BTC: [closes('2026-01-02', ['100'])[0], closes('2026-01-04', ['300'])[0]] as unknown as PriceHistory,
      ETH: closes('2026-01-01', ['1', '2', '3', '4', '5']),
    });
    expect(points(valueSeries(plan, both, market, 'all'))).toEqual([
      ['2026-01-01', '101'],
      ['2026-01-02', '102'],
      ['2026-01-03', '303'],
      ['2026-01-04', '304'],
      ['2026-01-05', '305'],
    ]);
  });

  it('counts a coin that left the plan and leaves deleted entries out', () => {
    const sol = trade('extra', 'SOL', '2026-01-02', '2');
    const deleted = { ...trade('extra', 'BTC', '2026-01-02', '5'), deletedAt: instant('2026-01-03T10:00:00Z') };
    const market = histories({ SOL: closes('2026-01-01', ['50', '60', '70']) });
    expect(points(valueSeries(plan, [sol, deleted], market, 'all'))).toEqual([
      ['2026-01-02', '120'],
      ['2026-01-03', '140'],
    ]);
  });

  it('has no series in another currency, without two closes of a coin, or with nothing held', () => {
    expect(valueSeries(plan, entries, histories({ BTC: closes('2026-01-01', ['1', '2']) }, 'USD'), 'all')).toBeNull();
    expect(valueSeries(plan, entries, histories({ BTC: closes('2026-01-01', ['100']) }), 'all')).toBeNull();
    expect(valueSeries(plan, [], market, 'all')).toBeNull();
    expect(valueSeries(plan, [trade('extra', 'BTC', '2026-02-01', '1')], market, '30d')).toBeNull();
  });
});

describe('valueRange (docs/DOMAIN.md §3.11)', () => {
  const market = histories({
    BTC: closes(
      '2026-01-01',
      Array.from({ length: 40 }, () => '100'),
    ),
    ETH: closes('2026-01-20', ['10', '11']),
  });
  const held = [trade('extra', 'ETH', '2026-01-25', '1'), trade('extra', 'BTC', '2026-01-10', '1')];

  it('counts back from the last close of the longest history; all starts at the first entry', () => {
    expect(valueRange(plan, held, market, '7d')).toEqual({ start: '2026-02-02', end: '2026-02-09' });
    expect(valueRange(plan, held, market, '1y')).toEqual({ start: '2025-02-09', end: '2026-02-09' });
    expect(valueRange(plan, held, market, 'all')).toEqual({ start: '2026-01-10', end: '2026-02-09' });
  });

  it('starts all at the last close when every entry is later, and is the series’ own range', () => {
    const later = [trade('extra', 'BTC', '2026-03-01', '1')];
    expect(valueRange(plan, later, market, 'all')).toEqual({ start: '2026-02-09', end: '2026-02-09' });
    expect(valueSeries(plan, held, market, '7d')?.[0]?.date).toBe('2026-02-02');
  });

  it('has no range in another currency or without two closes of a coin with entries', () => {
    expect(valueRange(plan, held, histories({ BTC: closes('2026-01-01', ['1', '2']) }, 'USD'), '7d')).toBeNull();
    expect(valueRange(plan, held, histories({ BTC: closes('2026-01-01', ['1']) }), '7d')).toBeNull();
  });
});

describe('heldValueSeries (docs/DOMAIN.md §3.11)', () => {
  const market = histories({
    BTC: closes('2026-01-01', ['100', '90', '80']),
    ETH: closes('2026-01-02', ['10', '20']),
    SOL: closes('2026-01-01', ['5', '6', '7']),
  });

  it('values today’s units on every date of the longest history', () => {
    const holdings = [
      { coin: BTC.id, units: units('0.5') },
      { coin: ETH.id, units: units('2') },
      { coin: 'SOL' as never, units: units('0') },
    ];
    expect(points(heldValueSeries(holdings, market))).toEqual([
      ['2026-01-01', '70'],
      ['2026-01-02', '65'],
      ['2026-01-03', '80'],
    ]);
  });

  it('has no series when no held coin has a history', () => {
    expect(heldValueSeries([{ coin: 'LINK' as never, units: units('3') }], market)).toBeNull();
    expect(heldValueSeries([{ coin: BTC.id, units: units('0') }], market)).toBeNull();
  });
});
