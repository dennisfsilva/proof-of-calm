import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, money, split, units } from '../../test/builders';
import { CHART_RANGES } from '../constants';
import { addDays } from '../dates/calendar';
import type { PriceHistories, PriceHistory } from '../schema/prices';
import { valueRange, valueSeries } from './series';

// docs/DOMAIN.md §3.11: valueRange names the dates valueSeries draws from, so the chart's dated lines never
// claim days it does not cover. Whatever the closes, the entries and the range: whenever the series draws,
// the range exists, starts no later than it ends, and holds every point.

const plan = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const ORIGIN = date('2026-01-01');

/** A history of 0 to 20 daily closes starting 0 to 40 days after the origin, every close positive. */
const history = fc
  .record({ offset: fc.nat(40), values: fc.array(fc.integer({ min: 1, max: 1000 }), { maxLength: 20 }) })
  .map(
    ({ offset, values }) =>
      values.map((value, day) => [addDays(ORIGIN, offset + day), String(value)]) as unknown as PriceHistory,
  );
const entry = fc
  .record({
    kind: fc.constantFrom('extra' as const, 'sell' as const),
    coin: fc.constantFrom('BTC', 'ETH'),
    day: fc.nat(70),
    quantity: fc.integer({ min: 1, max: 5 }),
  })
  .map(({ kind, coin, day, quantity }) =>
    anEntry({
      kind,
      slot: null,
      coin: coin as never,
      date: addDays(ORIGIN, day - 5),
      units: units(String(quantity)),
      amount: money('100'),
    }),
  );
const histories = fc
  .record({ BTC: history, ETH: history, currency: fc.constantFrom('EUR', 'EUR', 'USD') })
  .map(({ currency, ...coins }) => ({ currency, coins }) as unknown as PriceHistories);

describe('valueRange covers valueSeries (docs/DOMAIN.md §3.11)', () => {
  it('exists whenever the series draws, starts no later than it ends, and holds every point', () => {
    fc.assert(
      fc.property(
        histories,
        fc.array(entry, { maxLength: 6 }),
        fc.constantFrom(...CHART_RANGES),
        (market, entries, range) => {
          const series = valueSeries(plan, entries, market, range);
          if (series === null) return;
          const covered = valueRange(plan, entries, market, range);
          expect(covered).not.toBeNull();
          if (covered === null) return;
          expect(covered.start <= covered.end).toBe(true);
          for (const point of series) {
            expect(point.date >= covered.start && point.date <= covered.end).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
