import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aPlan, date } from '../../test/builders';
import { addDays, addMonthsToKey, epochDay, fromEpochDay, monthKey } from '../dates/calendar';
import { slots } from './slots';

const START = epochDay(date('2020-01-01'));
const firstBuys = fc.integer({ min: START, max: START + 3650 }).map(fromEpochDay);
const lengths = fc.integer({ min: 0, max: 7300 });
const buyDays = fc.integer({ min: 1, max: 31 });

const plans = fc
  .tuple(firstBuys, lengths, buyDays)
  .map(([firstBuy, length, buyDay]) => aPlan({ firstBuy, lastBuy: addDays(firstBuy, length), buyDay }));

describe('slot generation properties (docs/DOMAIN.md §3.1)', () => {
  it('has consecutive, strictly increasing month keys starting at the first buy', () => {
    fc.assert(
      fc.property(plans, (plan) => {
        const result = slots(plan);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toEqual({ key: monthKey(plan.firstBuy), due: plan.firstBuy });
        result.forEach((slot, index) => {
          if (index > 0) expect(slot.key).toBe(addMonthsToKey(result[index - 1]!.key, 1));
        });
      }),
    );
  });

  it('keeps every due date inside its month and on or before the last buy', () => {
    fc.assert(
      fc.property(plans, (plan) => {
        for (const slot of slots(plan)) {
          expect(monthKey(slot.due)).toBe(slot.key);
          expect(slot.due <= plan.lastBuy).toBe(true);
        }
      }),
    );
  });

  it('changes length with the buy day only through the last month', () => {
    fc.assert(
      fc.property(plans, buyDays, (plan, otherDay) => {
        const a = slots(plan);
        const b = slots({ ...plan, buyDay: otherDay });
        expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);
        const shorter = a.length <= b.length ? a : b;
        const longer = a.length <= b.length ? b : a;
        expect(longer.slice(0, shorter.length).map((slot) => slot.key)).toEqual(shorter.map((slot) => slot.key));
        if (a.length !== b.length) expect(monthKey(plan.lastBuy)).toBe(longer.at(-1)?.key);
      }),
    );
  });
});
