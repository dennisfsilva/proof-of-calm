import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, money, units } from '../../test/builders';
import { GB_PLAN, GB_RULES } from '../../test/tax-year/gb-fixture';
import { POOLED_MATCH_DAYS } from '../constants';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { CoinId } from '../schema/ids';
import { taxYearPool, taxYearPoolCsv } from './tax-year-pool';

// The raw listing for the lot rules the app does not match (docs/DOMAIN.md §3.13): which entries a tax
// year lists, the 30-day window under `pooled`, and the CSV's cells.

const span = { from: date('2026-04-06'), to: date('2027-04-05') };
const today = date('2027-06-01');
const buy = (on: string, overrides: Partial<Entry> = {}) =>
  anEntry({ kind: 'extra', slot: null, date: date(on), ...overrides });
const sell = (on: string, overrides: Partial<Entry> = {}) =>
  anEntry({ kind: 'sell', slot: null, date: date(on), units: units('0.001'), amount: money('80'), ...overrides });
const dates = (entries: readonly Entry[], rules: CountryRules = GB_RULES, at = today) =>
  taxYearPool(GB_PLAN, entries, rules, span, at).rows.map((row) => `${row.kind} ${row.date}`);

const US_RULES: CountryRules = {
  ...GB_RULES,
  code: 'US',
  holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' },
  lotRule: 'specific',
  lotScope: 'per-venue',
};

describe('taxYearPool (docs/DOMAIN.md §3.13)', () => {
  it("earlier years' sales of a coin sold in the span are listed", () => {
    // Buy 1 at 100, sell 1, buy 1 at 200: the pool's cost is 200, not 150, so the earlier sale must be there.
    const entries = [
      buy('2025-05-01', { amount: money('100'), units: units('1') }),
      sell('2025-08-01', { units: units('1') }),
      buy('2026-05-01', { amount: money('200'), units: units('1') }),
      sell('2026-09-01', { units: units('1') }),
    ];
    expect(dates(entries)).toEqual(['extra 2025-05-01', 'sell 2025-08-01', 'extra 2026-05-01', 'sell 2026-09-01']);
  });

  it('a purchase after span.to + 30 is not listed', () => {
    expect(POOLED_MATCH_DAYS).toBe(30);
    const entries = [
      sell('2027-03-20'),
      buy('2027-04-06'),
      anEntry({ kind: 'held', slot: null, date: date('2027-04-20'), amount: null, fee: null }),
      sell('2027-04-21'),
      buy('2027-05-05'),
      buy('2027-05-06'),
    ];
    expect(dates(entries)).toEqual(['sell 2027-03-20', 'extra 2027-04-06', 'held 2027-04-20', 'extra 2027-05-05']);
  });

  it('a coin with no sale in the span lists only the span’s entries', () => {
    const entries = [
      buy('2025-05-01'),
      sell('2026-04-05'),
      buy('2026-04-05'),
      buy('2026-04-06'),
      buy('2027-04-05'),
      buy('2027-04-06'),
      sell('2027-04-06'),
    ];
    expect(dates(entries)).toEqual(['extra 2026-04-06', 'extra 2027-04-05']);
  });

  it('windowOpen until span.to + 30; ongoing until span.to', () => {
    const at = (day: string) => taxYearPool(GB_PLAN, [], GB_RULES, span, date(day));
    expect(at('2027-04-05')).toMatchObject({ ongoing: true, windowOpen: true });
    expect(at('2027-04-06')).toMatchObject({ ongoing: false, windowOpen: true });
    expect(at('2027-05-05')).toMatchObject({ ongoing: false, windowOpen: true });
    expect(at('2027-05-06')).toMatchObject({ ongoing: false, windowOpen: false });
  });

  it('specific and average list no window', () => {
    const entries = [sell('2027-03-20'), buy('2027-04-06')];
    for (const lotRule of ['specific', 'average'] as const) {
      const rules = { ...US_RULES, lotRule };
      expect(dates(entries, rules)).toEqual(['sell 2027-03-20']);
      expect(taxYearPool(GB_PLAN, entries, rules, span, date('2027-04-06'))).toMatchObject({
        lotRule,
        ongoing: false,
        windowOpen: false,
      });
    }
  });

  it("fills a purchase's cost, fee and the country's holding date, and a sale's proceeds and fee", () => {
    const entries = [
      buy('2026-05-01', { amount: money('100'), fee: money('0.50'), venue: 'Kraken' }),
      sell('2026-06-01', { amount: money('80'), fee: money('0.40') }),
    ];
    // The plan keeps no rule; the file dates by the country's (US: a year and a day).
    const pool = taxYearPool(GB_PLAN, entries, US_RULES, span, today);
    expect(pool.rows).toEqual([
      {
        kind: 'extra',
        date: date('2026-05-01'),
        coin: 'BTC',
        venue: 'Kraken',
        units: units('0.001'),
        costBasis: money('100'),
        fee: money('0.50'),
        eligibleFrom: date('2027-05-02'),
        proceeds: null,
        disposalFee: null,
        estimated: false,
      },
      {
        kind: 'sell',
        date: date('2026-06-01'),
        coin: 'BTC',
        venue: null,
        units: units('0.001'),
        costBasis: null,
        fee: null,
        eligibleFrom: null,
        proceeds: money('80'),
        disposalFee: money('0.40'),
        estimated: false,
      },
    ]);
    expect(pool).toMatchObject({ uncosted: false, estimated: false });
  });

  it('a held lot at cost 0 is costed; one with no cost is not', () => {
    const held = (amount: string | null) =>
      anEntry({ kind: 'held', slot: null, date: date('2026-05-01'), amount: amount === null ? null : money(amount) });
    expect(taxYearPool(GB_PLAN, [held('0')], GB_RULES, span, today).uncosted).toBe(false);
    expect(taxYearPool(GB_PLAN, [held(null)], GB_RULES, span, today).uncosted).toBe(true);
  });

  it("lists the plan's coins in order, then other coins, each in compareEntries order", () => {
    const plan = aPlan({ ...GB_PLAN, coins: [ETH, BTC] });
    const sol = 'SOL' as CoinId;
    const entries = [
      buy('2026-06-01', { coin: sol }),
      buy('2026-05-02'),
      buy('2026-05-01', { coin: ETH.id }),
      buy('2026-05-01'),
    ];
    const rows = taxYearPool(plan, entries, GB_RULES, span, today).rows;
    expect(rows.map((row) => `${row.coin} ${row.date}`)).toEqual([
      'ETH 2026-05-01',
      'BTC 2026-05-01',
      'BTC 2026-05-02',
      'SOL 2026-06-01',
    ]);
  });
});

describe('taxYearPoolCsv (docs/DOMAIN.md §3.13)', () => {
  const columns = 'kind,date,coin,venue,units,cost_basis,fee,eligible_from,proceeds,disposal_fee,units_estimated';

  it('writes the header rows, an empty row and the columns when nothing is listed', () => {
    const pool = taxYearPool(GB_PLAN, [], GB_RULES, span, today);
    expect(taxYearPoolCsv(pool, ['one', '+two'])).toBe(['one', "'+two", '', columns].join('\n'));
  });

  it('writes coin and venue through textCell: a trigger at the start, after a ; and after a line break', () => {
    const entries = [
      buy('2026-05-01', { coin: '-X' as CoinId, venue: '=A;@B\nC', amount: money('1'), source: 'one-tap' }),
    ];
    const pool = taxYearPool(GB_PLAN, entries, GB_RULES, span, today);
    expect(taxYearPoolCsv(pool, [])).toBe(
      ['', columns, `extra,2026-05-01,'-X,"'=A;'@B\nC",0.001,1,,,,,yes`].join('\n'),
    );
  });
});
