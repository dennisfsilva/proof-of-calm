import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, money, units } from '../../test/builders';
import { addDays } from '../dates/calendar';
import { sum } from '../money/decimal';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { snapshotValue } from './snapshot';

// docs/DOMAIN.md §3.13: snapshotValue is the value at the end of `date`, so nothing dated later moves it,
// and its total is the exact sum of the coins' values whenever every held coin is priced.

const plan = aPlan({ coins: [BTC, ETH] });
const ORIGIN = date('2026-12-01');
const DAY = date('2026-12-31');

/** Up to 40 daily closes from the origin, each kept or dropped, so a gap can fall on the date. */
const history = fc
  .array(fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }), { maxLength: 40 })
  .map(
    (values) =>
      values.flatMap((value, day) =>
        value === null ? [] : [[addDays(ORIGIN, day), `${value}.${day % 7}`]],
      ) as unknown as PriceHistory,
  );
const histories = fc
  .record({ BTC: history, ETH: history, currency: fc.constantFrom('EUR', 'EUR', 'EUR', 'USD') })
  .map(({ currency, ...coins }) => ({ currency, coins }) as unknown as PriceHistories);
const entry = (days: { min: number; max: number }) =>
  fc
    .record({
      kind: fc.constantFrom('extra' as const, 'held' as const, 'sell' as const),
      coin: fc.constantFrom('BTC', 'ETH', 'SOL'),
      day: fc.integer(days),
      quantity: fc.integer({ min: 1, max: 5_000 }),
    })
    .map(({ kind, coin, day, quantity }) =>
      anEntry({
        kind,
        slot: null,
        coin: coin as never,
        date: addDays(DAY, day),
        units: units(`0.${String(quantity).padStart(4, '0')}`),
        amount: money('100'),
      }),
    );

describe('snapshotValue properties (docs/DOMAIN.md §3.13)', () => {
  it('never changes when an entry dated after the date is added', () => {
    fc.assert(
      fc.property(
        histories,
        fc.array(entry({ min: -60, max: 0 }), { maxLength: 8 }),
        entry({ min: 1, max: 30 }),
        (market, entries, later) => {
          expect(snapshotValue(plan, [...entries, later], market, DAY)).toEqual(
            snapshotValue(plan, entries, market, DAY),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('totals the coins’ values exactly when nothing is missing, and only then', () => {
    fc.assert(
      fc.property(histories, fc.array(entry({ min: -60, max: 0 }), { maxLength: 8 }), (market, entries) => {
        const value = snapshotValue(plan, entries, market, DAY);
        if (value.missing.length > 0) {
          expect(value.total).toBeNull();
          return;
        }
        const values = value.coins.map((coin) => coin.value);
        expect(values).not.toContain(null);
        expect(value.total).toBe(sum(values.filter((coin) => coin !== null)));
      }),
      { numRuns: 200 },
    );
  });
});
