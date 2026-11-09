import { describe, expect, it } from 'vitest';
import { anEntry, BTC, date, money, units } from '../../test/builders';
import expected from '../../test/tax-year/nl-2026.csv?raw';
import {
  EXPORT_DAY,
  NL_ENTRIES,
  NL_HEADER,
  NL_HISTORIES,
  NL_PLAN,
  NL_RULES,
  SPAN_2026,
} from '../../test/tax-year/nl-fixture';
import type { Entry } from '../schema/entry';
import type { PriceHistories } from '../schema/prices';
import { taxYearSpan } from './tax-year';
import { taxYearSnapshot, taxYearSnapshotCsv } from './tax-year-snapshot';

const snapshot = (entries: readonly Entry[], today = EXPORT_DAY, histories = NL_HISTORIES) =>
  taxYearSnapshot(NL_PLAN, entries, NL_RULES, SPAN_2026, histories, today);
const held = (fields: Partial<Entry>) =>
  anEntry({ kind: 'held', slot: null, coin: BTC.id, units: units('0.1'), amount: money('10'), ...fields });

describe('taxYearSnapshot: the NL fixture (test/tax-year/nl-fixture.ts)', () => {
  it('values 1 January at the eve’s closes and the year end at its own, with the year’s flows per coin', () => {
    const result = snapshot(NL_ENTRIES);
    expect(result.reference).toBe('2026-01-01');
    expect(result.currency).toBe('EUR');
    expect(result.opening).toMatchObject({ date: '2025-12-31', total: '38181.63735', missing: [] });
    expect(result.closing).toMatchObject({ date: '2026-12-31', total: '34773.4211725', missing: [] });
    expect(result.rows).toEqual([
      {
        coin: 'BTC',
        openingUnits: '0.35',
        openingValue: '30679.01235',
        boughtUnits: '0.022345',
        boughtAmount: '1900',
        boughtFee: '0.45',
        heldUnits: '0.02',
        heldCost: null,
        soldUnits: '0.1',
        proceeds: '9500',
        saleFee: '4.75',
        closingUnits: '0.292345',
        closingValue: '27772.9211725',
      },
      {
        coin: 'ETH',
        openingUnits: '2.5',
        openingValue: '7502.625',
        boughtUnits: '0',
        boughtAmount: '0',
        boughtFee: '0',
        heldUnits: '0.5',
        heldCost: '0',
        soldUnits: '1',
        proceeds: '3200',
        saleFee: '1.6',
        closingUnits: '2',
        closingValue: '7000.5',
      },
    ]);
    expect(result).toMatchObject({ ongoing: false, uncosted: true, estimated: true, heldInYear: true });
  });
});

describe('taxYearSnapshot (docs/DOMAIN.md §3.13)', () => {
  it('leaves the year end out while the year runs, through its last day', () => {
    expect(snapshot(NL_ENTRIES, date('2026-12-31'))).toMatchObject({ ongoing: true, closing: null });
    expect(snapshot(NL_ENTRIES, date('2026-12-31')).rows[0]).toMatchObject({ closingUnits: null, closingValue: null });
    expect(snapshot(NL_ENTRIES, date('2027-01-01')).ongoing).toBe(false);
  });

  it('gives an uncosted held entry an empty cost and sets uncosted; a cost of 0 is a cost', () => {
    const uncosted = snapshot([held({ date: date('2026-03-01'), amount: null })]);
    expect(uncosted.rows[0]?.heldCost).toBeNull();
    expect(uncosted.uncosted).toBe(true);
    const free = snapshot([held({ date: date('2026-03-01'), amount: money('0') })]);
    expect(free.rows[0]?.heldCost).toBe('0');
    expect(free.uncosted).toBe(false);
  });

  it('sets estimated for one-tap units up to the year end, and not for a later one', () => {
    const tap = (day: string) =>
      anEntry({ date: date(day), slot: null, kind: 'extra', units: units('0.1'), source: 'one-tap' });
    expect(snapshot([tap('2025-06-01')]).estimated).toBe(true);
    expect(snapshot([tap('2026-06-01')]).estimated).toBe(true);
    expect(snapshot([held({ date: date('2025-06-01') }), tap('2027-01-01')]).estimated).toBe(false);
  });

  it('sets heldInYear only for a held entry dated in the year', () => {
    expect(snapshot([held({ date: date('2026-01-01') })]).heldInYear).toBe(true);
    expect(snapshot([held({ date: date('2026-12-31') })]).heldInYear).toBe(true);
    expect(snapshot([held({ date: date('2025-12-31') })]).heldInYear).toBe(false);
    expect(snapshot([held({ date: date('2027-01-01') })]).heldInYear).toBe(false);
  });

  it('gives a row to each coin held on 1 January or with an entry in the year, and none to the others', () => {
    const rows = snapshot([
      held({ date: date('2027-02-01') }),
      anEntry({ kind: 'extra', slot: null, coin: 'SOL' as never, date: date('2026-02-01'), units: units('4') }),
    ]).rows;
    expect(rows.map((row) => row.coin)).toEqual(['SOL']);
    expect(rows[0]).toMatchObject({ openingUnits: '0', openingValue: '0', boughtUnits: '4', closingValue: null });
  });

  it('lists every held coin as missing when the histories are in another currency', () => {
    const result = snapshot(NL_ENTRIES, EXPORT_DAY, { ...NL_HISTORIES, currency: 'USD' } as PriceHistories);
    expect(result.opening.missing).toEqual(['BTC', 'ETH']);
    expect(result.closing?.missing).toEqual(['BTC', 'ETH']);
    expect(result.rows.map((row) => [row.openingValue, row.closingValue])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('takes the reference date inside a year that spans two calendar years', () => {
    const april = { ...NL_RULES, taxYear: { start: '04-06', end: '04-05' } };
    const span = taxYearSpan(april.taxYear, 2027);
    const onFirst = taxYearSnapshot(NL_PLAN, NL_ENTRIES, april, span, NL_HISTORIES, EXPORT_DAY);
    expect(onFirst.reference).toBe('2027-01-01');
    expect(onFirst.opening.date).toBe('2026-12-31');
    const sixth = { ...april, computationModel: { kind: 'wealth-snapshot' as const, date: '04-06' } };
    expect(taxYearSnapshot(NL_PLAN, NL_ENTRIES, sixth, span, NL_HISTORIES, EXPORT_DAY).reference).toBe('2026-04-06');
  });

  it('throws for a country whose model is not the snapshot', () => {
    const refuse = (kind: 'per-lot' | 'portfolio-wide') => () =>
      taxYearSnapshot(
        NL_PLAN,
        NL_ENTRIES,
        { ...NL_RULES, computationModel: { kind } },
        SPAN_2026,
        NL_HISTORIES,
        EXPORT_DAY,
      );
    expect(refuse('per-lot')).toThrow(RangeError);
    expect(refuse('portfolio-wide')).toThrow(RangeError);
    const other = { ...NL_RULES, computationModel: { kind: 'other' } as never };
    expect(() => taxYearSnapshot(NL_PLAN, NL_ENTRIES, other, SPAN_2026, NL_HISTORIES, EXPORT_DAY)).toThrow(
      'Unhandled case',
    );
    const odd = anEntry({ kind: 'other' as never, date: date('2026-03-01'), slot: null });
    expect(() => snapshot([odd])).toThrow('Unhandled case');
  });

  it('fails on an entry kind it does not know while the year is open, with no closing value read first', () => {
    const odd = anEntry({ kind: 'other' as never, date: date('2026-03-01'), slot: null });
    expect(() => snapshot([odd], date('2026-12-31'))).toThrow('Unhandled case');
  });
});

describe('taxYearSnapshotCsv (docs/DOMAIN.md §3.13)', () => {
  it('the NL fixture gives exactly nl-2026.csv', () => {
    expect(`${taxYearSnapshotCsv(snapshot(NL_ENTRIES), NL_HEADER)}\n`).toBe(expected);
  });

  it('leaves the year-end cells empty while the year runs, and a missing value empty in its total', () => {
    const lines = taxYearSnapshotCsv(snapshot(NL_ENTRIES, date('2026-06-30')), []).split('\n');
    expect(lines[2]).toBe('coin,BTC,0.35,30679.01,0.022345,1900.00,0.45,0.02,,0.1,9500.00,4.75,,');
    expect(lines[4]).toBe('total,,,38181.63,,1900.00,0.45,,,,12700.00,6.35,,');
    const gapped = { ...NL_HISTORIES, coins: { BTC: NL_HISTORIES.coins[BTC.id] } } as PriceHistories;
    const missing = taxYearSnapshotCsv(snapshot(NL_ENTRIES, EXPORT_DAY, gapped), []).split('\n');
    expect(missing[3]).toBe('coin,ETH,2.5,,0,0.00,0.00,0.5,0.00,1,3200.00,1.60,2,');
    expect(missing[4]).toBe('total,,,,,1900.00,0.45,,,,12700.00,6.35,,');
  });

  it('names the columns by the reference date and the year end, and guards the coin and the header', () => {
    const april = { ...NL_RULES, taxYear: { start: '04-06', end: '04-05' } };
    const span = taxYearSpan(april.taxYear, 2027);
    const coin = anEntry({ kind: 'extra', slot: null, coin: '-A1' as never, date: date('2027-02-01') });
    const file = taxYearSnapshotCsv(taxYearSnapshot(NL_PLAN, [coin], april, span, NL_HISTORIES, EXPORT_DAY), [
      '+header',
    ]).split('\n');
    expect(file[0]).toBe("'+header");
    expect(file[2]).toContain('units_on_01-01,value_on_01-01,');
    expect(file[2]).toMatch(/,units_on_04-05,value_on_04-05$/);
    expect(file[3]?.startsWith("coin,'-A1,0,0.00,0.001,")).toBe(true);
  });
});
