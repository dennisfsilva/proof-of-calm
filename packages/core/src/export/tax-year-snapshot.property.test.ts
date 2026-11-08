import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, BTC, date, ETH, money, units } from '../../test/builders';
import { EXPORT_DAY, NL_HISTORIES, NL_PLAN, NL_RULES, SPAN_2026 } from '../../test/tax-year/nl-fixture';
import { addDays } from '../dates/calendar';
import { type Money, minus, plus, sum } from '../money/decimal';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { taxYearSnapshot, taxYearSnapshotCsv } from './tax-year-snapshot';

// docs/DOMAIN.md §3.13: on a log with no short sale, each coin's year-end units are its 1 January units plus the
// year's purchases and held entries, less its sales; nothing dated before or after the year counts as a flow. In the
// file, the total row's amount cells are the sums of the coin rows' written cells, empty when one of them is.

const KINDS = ['dca', 'lump', 'extra', 'held', 'sell'] as const;
/** Each coin starts with 100 units in 2025, and at most 12 entries of at most 5 units follow: no sale goes short. */
const start = [BTC, ETH].map((coin) =>
  anEntry({ kind: 'lump', slot: null, coin: coin.id, date: date('2025-01-01'), units: units('100') }),
);
const entry = fc
  .record({
    kind: fc.constantFrom(...KINDS),
    coin: fc.constantFrom(BTC.id, ETH.id),
    day: fc.integer({ min: 0, max: 820 }),
    quantity: fc.integer({ min: 1, max: 500 }),
    costed: fc.boolean(),
  })
  .map(({ kind, coin, day, quantity, costed }) => {
    const on = addDays(date('2025-01-02'), day);
    return anEntry({
      kind,
      coin,
      date: on,
      slot: kind === 'dca' ? (on.slice(0, 7) as never) : null,
      units: units(`${Math.floor(quantity / 100)}.${String(quantity % 100).padStart(2, '0')}`),
      amount: kind === 'held' && !costed ? null : money('100'),
    });
  });

describe('taxYearSnapshot properties (docs/DOMAIN.md §3.13)', () => {
  it('closing units = opening + bought + held − sold, per coin', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), (entries) => {
        const result = taxYearSnapshot(NL_PLAN, [...start, ...entries], NL_RULES, SPAN_2026, NL_HISTORIES, EXPORT_DAY);
        expect(result.rows.map((row) => row.coin)).toEqual(['BTC', 'ETH']);
        for (const row of result.rows) {
          const expected = minus(plus(plus(row.openingUnits, row.boughtUnits), row.heldUnits), row.soldUnits);
          expect(row.closingUnits).toBe(expected);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the total row’s value cells equal the sum of the coin cells', () => {
    const AMOUNTS = [3, 5, 6, 8, 10, 11, 13];
    /** A close with up to six decimals on each date, or none. */
    const close = fc.option(
      fc.integer({ min: 1, max: 99_999_999 }).map((value) => `${Math.floor(value / 1000)}.${value % 1000}5`),
      { nil: null },
    );
    const market = fc.record({ btc: fc.tuple(close, close), eth: fc.tuple(close, close) }).map(({ btc, eth }) => {
      const series = ([eve, end]: readonly (string | null)[]) =>
        [
          ...(eve === null ? [] : [['2025-12-31', eve]]),
          ...(end === null ? [] : [['2026-12-31', end]]),
        ] as unknown as PriceHistory;
      return { currency: 'EUR', coins: { BTC: series(btc), ETH: series(eth) } } as unknown as PriceHistories;
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), market, (entries, histories) => {
        const result = taxYearSnapshot(NL_PLAN, [...start, ...entries], NL_RULES, SPAN_2026, histories, EXPORT_DAY);
        const cells = taxYearSnapshotCsv(result, [])
          .split('\n')
          .slice(2)
          .map((line) => line.split(','));
        const total = cells.at(-1) ?? [];
        expect(total.slice(0, 2)).toEqual(['total', '']);
        for (const column of AMOUNTS) {
          const written = cells.slice(0, -1).map((row) => row[column] ?? '');
          const expected = written.includes('') ? '' : sum(written as Money[]);
          expect(total[column] === '' ? '' : sum([total[column] as Money])).toBe(expected);
        }
        for (const column of [2, 4, 7, 9, 12]) expect(total[column]).toBe('');
      }),
      { numRuns: 200 },
    );
  });
});
