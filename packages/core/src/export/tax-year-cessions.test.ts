import { describe, expect, it } from 'vitest';
import { BTC, date, ETH, money, units } from '../../test/builders';
import expected from '../../test/tax-year/fr-2026.csv?raw';
import {
  at,
  EXPORT_DAY,
  entry,
  FR_ENTRIES,
  FR_HEADER,
  FR_HISTORIES,
  FR_PLAN,
  FR_RULES,
  SPAN_2026,
} from '../../test/tax-year/fr-fixture';
import { NL_RULES } from '../../test/tax-year/nl-fixture';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { PriceHistories } from '../schema/prices';
import { taxYearCessions, taxYearCessionsCsv } from './tax-year-cessions';

const cessions = (entries: readonly Entry[], histories = FR_HISTORIES, today = EXPORT_DAY) =>
  taxYearCessions(FR_PLAN, entries, FR_RULES, SPAN_2026, histories, today);
const csvRows = (entries: readonly Entry[], histories = FR_HISTORIES) =>
  taxYearCessionsCsv(cessions(entries, histories), []).split('\n').slice(2);

describe('taxYearCessions: the FR fixture (test/tax-year/fr-fixture.ts)', () => {
  it('gives exactly fr-2026.csv', () => {
    expect(`${taxYearCessionsCsv(cessions(FR_ENTRIES), FR_HEADER)}\n`).toBe(expected);
  });

  it('keeps exact values and what the header needs', () => {
    const result = cessions(FR_ENTRIES);
    expect(result).toMatchObject({
      span: SPAN_2026,
      currency: 'EUR',
      ongoing: false,
      estimated: true,
      uncosted: true,
      missing: ['ETH'],
      unvalued: 1,
    });
    expect(result.cessions.map((sale) => [sale.number, sale.costs, sale.fees, sale.heldWithoutCost])).toEqual([
      [1, '14800', '12.4', 1],
      [2, '15800', '12.4', 1],
    ]);
    expect(result.cessions[1]?.holdings).toEqual([
      { coin: 'BTC', units: '0.152345', estimated: true, price: '65432.1', source: 'close', value: '9968.2532745' },
      { coin: 'ETH', units: '2.5', estimated: false, price: '2500.1', source: 'sale', value: '6250.25' },
    ]);
  });
});

describe('taxYearCessions (docs/DOMAIN.md §3.13)', () => {
  it('with no histories, or histories in another currency, empties every close-priced cell', () => {
    const none = { currency: 'EUR', coins: {} } as unknown as PriceHistories;
    const dollars = { ...FR_HISTORIES, currency: 'USD' } as PriceHistories;
    for (const histories of [none, dollars]) {
      expect(csvRows(FR_ENTRIES, histories).slice(3)).toEqual([
        'holding,2,2026-09-20,BTC,0.152345,yes,,,,,,,,,,',
        'holding,2,2026-09-20,ETH,2.5,no,,,,2500.1,sale,6250.25,,,,',
        'sale,2,2026-09-20,ETH,2.5,yes,,6250.25,,,,,,15800.00,12.40,1',
      ]);
      expect(cessions(FR_ENTRIES, histories)).toMatchObject({ missing: ['BTC', 'ETH'], unvalued: 2 });
    }
  });

  it('counts a same-day purchase created before the sale, never one created after', () => {
    const buy = (time: string, coin = BTC.id) =>
      entry('extra', '2026-04-15', coin, {
        units: units('1'),
        amount: money('500'),
        fee: money('1'),
        createdAt: at('2026-04-15', time),
      });
    const sale = entry('sell', '2026-04-15', BTC.id, { units: units('0.5'), amount: money('40000') });
    expect(csvRows([buy('08:00:00'), sale, buy('10:00:00'), buy('10:00:00', ETH.id)])).toEqual([
      'holding,1,2026-04-15,BTC,1,no,,,,80000,sale,80000.00,,,,',
      'sale,1,2026-04-15,BTC,0.5,no,,40000.00,,,,,80000.00,500.00,1.00,0',
    ]);
  });

  it('gives a coin sold out before the sale no holding row, and keeps its purchases in the costs', () => {
    const rows = csvRows([
      entry('lump', '2026-01-05', ETH.id, { units: units('1'), amount: money('3000'), fee: money('3') }),
      entry('sell', '2026-02-05', ETH.id, { units: units('1'), amount: money('3500') }),
      entry('lump', '2026-01-05', BTC.id, { units: units('0.1'), amount: money('7000') }),
      entry('sell', '2026-03-05', BTC.id, { units: units('0.1'), amount: money('7500'), fee: money('2.5') }),
    ]);
    expect(rows.slice(3)).toEqual([
      'holding,2,2026-03-05,BTC,0.1,no,,,,75000,sale,7500.00,,,,',
      'sale,2,2026-03-05,BTC,0.1,no,,7500.00,2.50,,,,7500.00,10000.00,3.00,0',
    ]);
  });

  it('empties the estimate of a sale the log holds no units of the coin sold for, and counts it unvalued', () => {
    const sale = entry('sell', '2026-04-15', BTC.id, { units: units('0.12'), amount: money('8000') });
    expect(csvRows([sale])).toEqual(['sale,1,2026-04-15,BTC,0.12,no,,8000.00,,,,,,0.00,0.00,0']);
    expect(cessions([sale])).toMatchObject({ missing: [], unvalued: 1 });
  });

  it('empties the estimate of a sale of a coin not held while another coin is, and keeps that coin’s row', () => {
    const entries = [
      entry('lump', '2026-01-05', BTC.id, { units: units('1'), amount: money('50000') }),
      entry('sell', '2026-09-20', ETH.id, { units: units('2'), amount: money('5000') }),
    ];
    expect(csvRows(entries)).toEqual([
      'holding,1,2026-09-20,BTC,1,no,,,,65432.1,close,65432.10,,,,',
      'sale,1,2026-09-20,ETH,2,no,,5000.00,,,,,,50000.00,0.00,0',
    ]);
    expect(cessions(entries)).toMatchObject({ missing: [], unvalued: 1 });
  });

  it('empties the estimate of a sale of more units than the log holds, and keeps the sale-priced row', () => {
    const entries = [
      entry('lump', '2026-01-05', BTC.id, { units: units('0.03'), amount: money('2400'), venue: 'Kraken' }),
      entry('lump', '2026-02-05', BTC.id, { units: units('0.02'), amount: money('1600'), venue: 'Bitvavo' }),
      entry('sell', '2026-04-15', BTC.id, { units: units('0.12'), amount: money('8000') }),
    ];
    expect(csvRows(entries)).toEqual([
      'holding,1,2026-04-15,BTC,0.05,no,,,,66666.67,sale,3333.33,,,,',
      'sale,1,2026-04-15,BTC,0.12,no,,8000.00,,,,,,4000.00,0.00,0',
    ]);
    expect(cessions(entries)).toMatchObject({ missing: [], unvalued: 1 });
  });

  it('lists only the sales up to today while the year runs', () => {
    const result = cessions(FR_ENTRIES, FR_HISTORIES, date('2026-09-19'));
    expect(result.ongoing).toBe(true);
    expect(result.cessions.map((sale) => sale.date)).toEqual(['2026-04-15']);
  });

  it('throws for a model other than portfolio-wide', () => {
    const refuse = (rules: CountryRules) => () =>
      taxYearCessions(FR_PLAN, FR_ENTRIES, rules, SPAN_2026, FR_HISTORIES, EXPORT_DAY);
    expect(refuse({ ...FR_RULES, computationModel: { kind: 'per-lot' } })).toThrow(RangeError);
    expect(refuse(NL_RULES)).toThrow(RangeError);
    expect(refuse({ ...FR_RULES, computationModel: { kind: 'other' } as never })).toThrow('Unhandled case');
  });
});
