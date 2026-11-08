import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, units } from '../../test/builders';
import { EXPORT_DAY, FR_HISTORIES, FR_PLAN, FR_RULES, SPAN_2026 } from '../../test/tax-year/fr-fixture';
import { addDays } from '../dates/calendar';
import { compare, type Money, sum } from '../money/decimal';
import { liveEntries } from '../plan/statuses';
import { compareEntries } from '../portfolio/lots';
import type { Entry } from '../schema/entry';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { taxYearCessions, taxYearCessionsCsv } from './tax-year-cessions';

// docs/DOMAIN.md §3.13: each sale's block reads only the entries ordered before it, its cost sums never fall, its
// estimate is the sum of its written holding values or empty, and the blocks are the live sells of the year.

const KINDS = ['dca', 'lump', 'extra', 'held', 'sell'] as const;
const decimal = (quantity: number) => `${Math.floor(quantity / 100)}.${String(quantity % 100).padStart(2, '0')}`;
const entry = fc
  .record({
    kind: fc.constantFrom(...KINDS),
    coin: fc.constantFrom(BTC.id, ETH.id),
    day: fc.integer({ min: 0, max: 800 }),
    minute: fc.integer({ min: 0, max: 59 }),
    quantity: fc.integer({ min: 1, max: 500 }),
    cents: fc.integer({ min: 1, max: 999_999 }),
    costed: fc.boolean(),
    deleted: fc.boolean(),
  })
  .map(({ kind, coin, day, minute, quantity, cents, costed, deleted }) => {
    const on = addDays(date('2025-06-01'), day);
    return anEntry({
      kind,
      coin,
      date: on,
      slot: kind === 'dca' ? (on.slice(0, 7) as never) : null,
      units: units(decimal(quantity)),
      amount: kind === 'held' && !costed ? null : money(decimal(cents)),
      fee: costed ? money('0.5') : null,
      createdAt: instant(`${on}T09:${String(minute).padStart(2, '0')}:00+00:00`),
      deletedAt: deleted && day % 7 === 0 ? instant(`${on}T23:00:00+00:00`) : null,
    });
  });

/** A close for each coin on some of the days of 2026, or none. */
const histories = fc
  .record({
    btc: fc.array(fc.tuple(fc.integer({ min: 0, max: 364 }), fc.integer({ min: 1, max: 9_999_999 })), {
      maxLength: 40,
    }),
    eth: fc.array(fc.tuple(fc.integer({ min: 0, max: 364 }), fc.integer({ min: 1, max: 9_999_999 })), {
      maxLength: 40,
    }),
  })
  .map(({ btc, eth }) => {
    const series = (closes: readonly (readonly [number, number])[]) =>
      [...new Map(closes.map(([day, price]) => [addDays(date('2026-01-01'), day), decimal(price)]))].sort(([a], [b]) =>
        a < b ? -1 : 1,
      ) as unknown as PriceHistory;
    return { currency: 'EUR', coins: { BTC: series(btc), ETH: series(eth) } } as unknown as PriceHistories;
  });

const run = (entries: readonly Entry[], market: PriceHistories) =>
  taxYearCessions(FR_PLAN, entries, FR_RULES, SPAN_2026, market, EXPORT_DAY);
/** Each block's lines of the file, split into cells: its holding rows, then its sale row. */
const blocks = (entries: readonly Entry[], market: PriceHistories) => {
  const lines = taxYearCessionsCsv(run(entries, market), [])
    .split('\n')
    .slice(2)
    .map((line) => line.split(','));
  const grouped = new Map<string, string[][]>();
  for (const cells of lines) grouped.set(cells[1] ?? '', [...(grouped.get(cells[1] ?? '') ?? []), cells]);
  return grouped;
};
const RUNS = { numRuns: 300 };

describe('taxYearCessions properties (docs/DOMAIN.md §3.13)', () => {
  it('an entry ordered after a sale never changes that sale’s block', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 14 }), entry, histories, (entries, later, market) => {
        const added = { ...later, createdAt: instant('2030-01-01T00:00:00+00:00') };
        const before = run(entries, market).cessions;
        const after = run([...entries, added], market).cessions;
        for (const sale of before.filter((cession) => cession.date <= added.date)) {
          expect(after.find((cession) => cession.entry === sale.entry)).toEqual(sale);
        }
      }),
      RUNS,
    );
  });

  it('purchase_costs_to_date never falls from one sale to the next', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 14 }), histories, (entries, market) => {
        const costs = run(entries, market).cessions.map((sale) => sale.costs);
        for (const [index, cost] of costs.entries()) {
          if (index > 0) expect(compare(cost, costs[index - 1] as Money)).toBeGreaterThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });

  it('the estimate is empty when any holding value is, else the sum of the written holding values', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 14 }), histories, (entries, market) => {
        for (const block of blocks(entries, market).values()) {
          const sale = block.at(-1) ?? [];
          const values = block.slice(0, -1).map((cells) => cells[11] ?? '');
          expect(sale[0]).toBe('sale');
          if (values.includes('')) expect(sale[12]).toBe('');
          else expect(compare(sale[12] as Money, sum(values as Money[]))).toBe(0);
        }
      }),
      RUNS,
    );
  });

  it('selling a whole single-coin holding gives an estimate equal to the sale price', () => {
    const buys = fc.array(fc.tuple(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 1, max: 999_999 })), {
      minLength: 1,
      maxLength: 6,
    });
    fc.assert(
      fc.property(buys, fc.integer({ min: 1, max: 99_999_999 }), histories, (lots, cents, market) => {
        const purchases = lots.map(([quantity, cost], index) =>
          anEntry({
            kind: 'extra',
            slot: null,
            coin: ETH.id,
            date: addDays(date('2025-06-01'), index),
            units: units(decimal(quantity)),
            amount: money(decimal(cost)),
          }),
        );
        const held = sum(purchases.map((purchase) => purchase.units));
        const sale = anEntry({
          kind: 'sell',
          slot: null,
          coin: ETH.id,
          date: date('2026-05-05'),
          units: held,
          amount: money(decimal(cents)),
        });
        const plan = aPlan({ country: 'FR', coins: [BTC, ETH], holdingRule: { kind: 'none' } });
        const csv = taxYearCessionsCsv(
          taxYearCessions(plan, [...purchases, sale], FR_RULES, SPAN_2026, market, EXPORT_DAY),
          [],
        );
        const row = csv.split('\n').at(-1)?.split(',') ?? [];
        expect(row[12]).toBe(row[7]);
      }),
      RUNS,
    );
  });

  it('the sale rows are the live sells dated in the year, in compareEntries order', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 14 }), (entries) => {
        const sells = liveEntries(entries)
          .filter((sale) => sale.kind === 'sell' && sale.date >= SPAN_2026.from && sale.date <= SPAN_2026.to)
          .sort(compareEntries);
        const result = run(entries, FR_HISTORIES).cessions;
        expect(result.map((sale) => [sale.number, sale.entry])).toEqual(
          sells.map((sale, index) => [index + 1, sale.id]),
        );
      }),
      RUNS,
    );
  });
});
