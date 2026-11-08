import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, units } from '../../test/builders';
import { FIXTURE_RULES } from '../../test/country-change/fixture';
import expected2026 from '../../test/tax-year/pt-2026.csv?raw';
import expected2027 from '../../test/tax-year/pt-2027.csv?raw';
import { PT_ENTRIES, PT_HEADER, PT_PLAN, PT_RULES } from '../../test/tax-year/pt-fixture';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { taxYearFileName } from './backup';
import {
  defaultTaxYear,
  type LotPiece,
  taxYearEndingIn,
  taxYearLots,
  taxYearLotsCsv,
  taxYearSpan,
  taxYears,
} from './tax-year';

const PT_YEAR = PT_RULES.taxYear;
const GB_YEAR = { start: '04-06', end: '04-05' };
const IT: CountryRules = {
  ...PT_RULES,
  code: 'IT',
  holdingRule: { kind: 'none' },
  lotRule: 'lifo',
  lotScope: 'global',
};
const XX: CountryRules = FIXTURE_RULES.XX;

let created = 0;
/** Entries in the order written, each logged a minute after the one before. */
const at = () => {
  created += 1;
  return instant(`2026-01-01T09:${String(created % 60).padStart(2, '0')}:00+00:00`);
};
const buy = (day: string, quantity: string, amount: string | null, fields: Partial<Entry> = {}) =>
  anEntry({
    kind: 'extra',
    slot: null,
    date: date(day),
    units: units(quantity),
    amount: amount === null ? null : money(amount),
    createdAt: at(),
    ...fields,
  });
const sell = (day: string, quantity: string, amount: string, fields: Partial<Entry> = {}) =>
  anEntry({
    kind: 'sell',
    slot: null,
    date: date(day),
    units: units(quantity),
    amount: money(amount),
    createdAt: at(),
    ...fields,
  });
const lotsIn = (
  endingIn: number,
  entries: readonly Entry[],
  today: string,
  rules: CountryRules = PT_RULES,
  plan = PT_PLAN,
) => taxYearLots(plan, entries, rules, taxYearSpan(rules.taxYear, endingIn), date(today));
const figures = (piece: LotPiece) => [piece.acquired, piece.units, piece.costBasis, piece.fee, piece.disposedOn];

describe('tax-year spans (docs/DOMAIN.md §3.13, docs/JURISDICTIONS.md §4)', () => {
  it('PT ending in 2026 is 2026-01-01 to 2026-12-31', () => {
    expect(taxYearSpan(PT_YEAR, 2026)).toEqual({ endingIn: 2026, from: '2026-01-01', to: '2026-12-31' });
  });

  it('GB ending in 2026 is 2025-04-06 to 2026-04-05', () => {
    expect(taxYearSpan(GB_YEAR, 2026)).toEqual({ endingIn: 2026, from: '2025-04-06', to: '2026-04-05' });
  });

  it('PT: 2026-12-31 → 2026 and 2027-01-01 → 2027', () => {
    expect(taxYearEndingIn(date('2026-12-31'), PT_YEAR)).toBe(2026);
    expect(taxYearEndingIn(date('2027-01-01'), PT_YEAR)).toBe(2027);
  });

  it('GB: 2026-04-05 → 2026 and 2026-04-06 → 2027, a plan buying on the 6th included', () => {
    expect(taxYearEndingIn(date('2026-04-05'), GB_YEAR)).toBe(2026);
    expect(taxYearEndingIn(date('2026-04-06'), GB_YEAR)).toBe(2027);
    const sixth = buy('2026-04-06', '1', '100');
    const gb = { ...PT_RULES, taxYear: GB_YEAR };
    expect(lotsIn(2026, [sixth], '2026-05-01', gb).pieces).toEqual([]);
    expect(lotsIn(2027, [sixth], '2026-05-01', gb).pieces.map(figures)).toEqual([
      ['2026-04-06', '1', '100', null, null],
    ]);
  });
});

describe('tax years', () => {
  const entries = [buy('2024-05-01', '1', '100'), buy('2026-03-01', '1', '100')];

  it("taxYears runs from the first entry's year to today's, newest first", () => {
    expect(taxYears(entries, PT_YEAR, date('2026-11-07'))).toEqual([2026, 2025, 2024]);
    const deleted = buy('2020-01-01', '1', '100', { deletedAt: instant('2026-01-02T09:00:00+00:00') });
    expect(taxYears([deleted, ...entries], PT_YEAR, date('2026-11-07'))).toEqual([2026, 2025, 2024]);
    expect(taxYears([buy('2027-02-01', '1', '100')], PT_YEAR, date('2026-11-07'))).toEqual([2026]);
    expect(taxYears([], PT_YEAR, date('2026-11-07'))).toEqual([]);
  });

  it('defaultTaxYear: the latest ended year, else the current one, else null', () => {
    expect(defaultTaxYear(entries, PT_YEAR, date('2026-11-07'))).toBe(2025);
    expect(defaultTaxYear(entries.slice(1), PT_YEAR, date('2026-11-07'))).toBe(2026);
    expect(defaultTaxYear([], PT_YEAR, date('2026-11-07'))).toBeNull();
  });

  it('on span.to the year is still running, and the day after it has ended', () => {
    expect(defaultTaxYear(entries, PT_YEAR, date('2026-12-31'))).toBe(2025);
    expect(lotsIn(2026, entries, '2026-12-31').ongoing).toBe(true);
    expect(defaultTaxYear(entries, PT_YEAR, date('2027-01-01'))).toBe(2026);
    expect(lotsIn(2026, entries, '2027-01-01').ongoing).toBe(false);
  });
});

describe('taxYearFileName', () => {
  it('names the span, the country and the export day', () => {
    expect(taxYearFileName('proof-of-calm', taxYearSpan(PT_YEAR, 2026), 'PT', date('2027-02-10'))).toBe(
      'proof-of-calm-tax-year-2026-PT-2027-02-10.csv',
    );
    expect(taxYearFileName('proof-of-calm', taxYearSpan(GB_YEAR, 2027), 'GB', date('2027-05-10'))).toBe(
      'proof-of-calm-tax-year-2026-27-GB-2027-05-10.csv',
    );
    expect(taxYearFileName('proof-of-calm', taxYearSpan(GB_YEAR, 2100), 'GB', date('2100-05-10'))).toBe(
      'proof-of-calm-tax-year-2099-00-GB-2100-05-10.csv',
    );
  });
});

describe('taxYearLots: the PT fixture (test/tax-year/pt-fixture.ts)', () => {
  it('the PT fixture gives the expected CSVs', () => {
    const in2026 = lotsIn(2026, PT_ENTRIES, '2027-02-10');
    const in2027 = lotsIn(2027, PT_ENTRIES, '2027-05-10');
    expect(`${taxYearLotsCsv(in2026, PT_HEADER)}\n`).toBe(expected2026);
    expect(`${taxYearLotsCsv(in2027, PT_HEADER)}\n`).toBe(expected2027);
  });

  it('flags what the header names', () => {
    const { pieces: _2026, ...in2026 } = lotsIn(2026, PT_ENTRIES, '2027-02-10');
    expect(in2026).toEqual({
      span: taxYearSpan(PT_YEAR, 2026),
      currency: 'EUR',
      lotRule: 'fifo',
      lotScope: 'per-venue',
      ongoing: false,
      uncosted: true,
      estimated: true,
      unmatched: true,
      crossVenue: 1,
      planRuleDiffers: false,
    });
    const in2027 = lotsIn(2027, PT_ENTRIES, '2027-05-10');
    expect([in2027.ongoing, in2027.unmatched, in2027.crossVenue]).toEqual([true, false, 0]);
  });
});

describe('taxYearLots: single cases', () => {
  it('a sale after the year end leaves the year-end piece whole', () => {
    const entries = [buy('2026-03-01', '1', '100'), sell('2027-02-01', '0.4', '80')];
    expect(lotsIn(2026, entries, '2027-03-01').pieces.map(figures)).toEqual([['2026-03-01', '1', '100', null, null]]);
  });

  it('Italy takes the latest lot first', () => {
    const entries = [buy('2026-01-01', '1', '100'), buy('2026-02-01', '1', '200'), sell('2026-03-01', '1', '300')];
    const pieces = lotsIn(2026, entries, '2027-01-10', IT).pieces;
    expect(pieces.map(figures)).toEqual([
      ['2026-01-01', '1', '100', null, null],
      ['2026-02-01', '1', '200', null, '2026-03-01'],
    ]);
    expect(pieces[1]).toMatchObject({ proceeds: '300', eligibleFrom: null, pastHoldingRule: null });
  });

  it('XX matches first in, first out', () => {
    const entries = [buy('2026-01-01', '1', '100'), buy('2026-02-01', '1', '200'), sell('2026-03-01', '1', '300')];
    const pieces = lotsIn(2026, entries, '2027-01-10', XX).pieces;
    expect(pieces.map(figures)).toEqual([
      ['2026-01-01', '1', '100', null, '2026-03-01'],
      ['2026-02-01', '1', '200', null, null],
    ]);
  });

  it('a PT lot of 2025-08-01 sold 2026-06-01 has past_holding_rule no', () => {
    const entries = [buy('2025-08-01', '1', '100'), sell('2026-06-01', '0.5', '80')];
    const [sold, held] = lotsIn(2026, entries, '2027-01-10').pieces;
    expect(sold).toMatchObject({ eligibleFrom: '2026-08-01', pastHoldingRule: false, disposedOn: '2026-06-01' });
    expect(held).toMatchObject({ eligibleFrom: '2026-08-01', pastHoldingRule: true, disposedOn: null });
  });

  it('dates a year-end piece against today while the year runs', () => {
    const entries = [buy('2025-08-01', '1', '100')];
    expect(lotsIn(2026, entries, '2026-07-31').pieces[0]?.pastHoldingRule).toBe(false);
    expect(lotsIn(2026, entries, '2026-08-01').pieces[0]?.pastHoldingRule).toBe(true);
  });

  it('the 2026 piece of a lot sold across 2026 and 2027 is the same cent in both files', () => {
    const entries = [buy('2025-12-01', '3', '100'), sell('2026-03-01', '1', '50'), sell('2027-03-01', '1', '60')];
    const in2026 = lotsIn(2026, entries, '2027-02-01').pieces.map((piece) => piece.costBasis);
    const in2027 = lotsIn(2027, entries, '2028-02-01').pieces.map((piece) => piece.costBasis);
    expect(in2026).toEqual(['33.33', '66.67']);
    expect(in2027).toEqual(['33.34', '33.33']);
  });

  it('a cost of 100.005 splits without throwing', () => {
    const entries = [buy('2025-12-01', '3', '100.005'), sell('2026-03-01', '1', '50')];
    const lots = lotsIn(2026, entries, '2027-02-01');
    expect(lots.pieces.map((piece) => piece.costBasis)).toEqual(['33.335', '66.67']);
    expect(
      taxYearLotsCsv(lots, [])
        .split('\n')
        .slice(2)
        .map((row) => row.split(',')[5]),
    ).toEqual(['33.335', '66.67']);
  });

  it("the plan's own holding rule leaves eligible_from on the country's rule and sets planRuleDiffers", () => {
    const plan = aPlan({ holdingRule: { kind: 'years', years: 1, effect: 'exempt' } });
    const lots = lotsIn(2026, [buy('2026-03-15', '1', '100')], '2027-01-10', PT_RULES, plan);
    expect(lots.pieces[0]?.eligibleFrom).toBe('2027-03-15');
    expect(lots.planRuleDiffers).toBe(true);
  });

  it("dates a lot by the country's acquisition-date overrides", () => {
    const override = {
      acquiredFrom: date('2026-01-01'),
      rule: { kind: 'years', years: 1, effect: 'exempt' },
      note: '',
    } as const;
    const rules: CountryRules = { ...PT_RULES, holdingRuleOverrides: [override] };
    const lots = lotsIn(2026, [buy('2025-03-15', '1', '100'), buy('2026-03-15', '1', '100')], '2027-01-10', rules);
    expect(lots.pieces.map((piece) => piece.eligibleFrom)).toEqual(['2026-03-15', '2027-03-16']);
  });

  it('an empty cost_basis and uncosted for a held lot with no cost', () => {
    const noCost = lotsIn(2026, [buy('2026-03-01', '1', null, { kind: 'held' })], '2027-01-10');
    expect(noCost.pieces.map(figures)).toEqual([['2026-03-01', '1', null, null, null]]);
    expect(noCost.uncosted).toBe(true);
    const atZero = lotsIn(2026, [buy('2026-03-01', '1', '0', { kind: 'held' })], '2027-01-10');
    expect(atZero.uncosted).toBe(false);
    expect(taxYearLotsCsv(atZero, []).split('\n')[2]).toBe('held,2026-03-01,BTC,,1,0.00,,2027-03-01,no,,,,,no');
  });

  it('exports an initial buy as initial, as the log does', () => {
    const lots = lotsIn(2026, [buy('2026-03-01', '1', '100', { kind: 'lump', fee: money('1') })], '2027-01-10');
    expect(taxYearLotsCsv(lots, []).split('\n')[2]).toBe('initial,2026-03-01,BTC,,1,100.00,1.00,2027-03-01,no,,,,,no');
  });

  it("lists the plan's coins in its order, then any other coin of the log", () => {
    const sol = 'SOL' as CoinId;
    const entries = [
      buy('2026-01-01', '1', '100', { coin: sol }),
      buy('2026-02-01', '1', '100', { coin: ETH.id }),
      buy('2026-03-01', '1', '100'),
    ];
    expect(lotsIn(2026, entries, '2027-01-10').pieces.map((piece) => piece.coin)).toEqual([BTC.id, ETH.id, sol]);
  });

  it('refuses a country whose file is not per lot, or whose lot rule it does not match', () => {
    const span = taxYearSpan(PT_YEAR, 2026);
    const refuse = (rules: CountryRules) => () => taxYearLots(PT_PLAN, [], rules, span, date('2027-01-10'));
    expect(refuse({ ...PT_RULES, computationModel: { kind: 'portfolio-wide' } })).toThrow(RangeError);
    expect(refuse({ ...PT_RULES, computationModel: { kind: 'wealth-snapshot', date: '01-01' } })).toThrow(RangeError);
    expect(refuse({ ...PT_RULES, computationModel: { kind: 'other' } as never })).toThrow('Unhandled case');
    for (const lotRule of ['pooled', 'specific', 'average'] as const) {
      expect(refuse({ ...PT_RULES, lotRule })).toThrow(RangeError);
    }
    expect(refuse({ ...PT_RULES, lotRule: 'other' as never })).toThrow('Unhandled case');
  });
});
