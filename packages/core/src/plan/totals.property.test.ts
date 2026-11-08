import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, money } from '../../test/builders';
import { addDays, epochDay, fromEpochDay, monthKey } from '../dates/calendar';
import { compare, plus } from '../money/decimal';
import type { Plan } from '../schema/plan';
import { slots } from './slots';
import { planTotals } from './totals';

const START = epochDay(date('2020-01-01'));
const cents = fc.integer({ min: 1, max: 1_000_000 }).map((value) => money((value / 100).toFixed(2)));
const amountsOrZero = fc.oneof(fc.constant(money('0')), cents);

const basePlans = fc
  .record({
    first: fc.integer({ min: START, max: START + 3650 }),
    length: fc.integer({ min: 0, max: 2000 }),
    buyDay: fc.integer({ min: 1, max: 28 }),
    monthlyAmount: amountsOrZero,
    startingAmount: amountsOrZero,
  })
  .filter(({ monthlyAmount, startingAmount }) => monthlyAmount !== '0' || startingAmount !== '0')
  .map(({ first, length, buyDay, monthlyAmount, startingAmount }) => {
    const firstBuy = fromEpochDay(first);
    return aPlan({ firstBuy, lastBuy: addDays(firstBuy, length), buyDay, monthlyAmount, startingAmount });
  });

/** A plan with skips and at most one pause, entries of the four kinds dated around it, and a today. */
const cases = basePlans.chain((base) => {
  const keys = slots(base).map((slot) => slot.key);
  const from = epochDay(base.firstBuy) - 1000;
  const to = epochDay(base.lastBuy) + 400;
  const days = fc.integer({ min: from, max: to }).map(fromEpochDay);
  const slotKeys = keys.length > 0 ? fc.option(fc.constantFrom(...keys), { nil: null }) : fc.constant(null);
  const pause = fc.option(
    fc
      .record({
        start: fc.integer({ min: epochDay(base.firstBuy), max: epochDay(base.lastBuy) }),
        open: fc.boolean(),
        extra: fc.integer({ min: 0, max: 800 }),
      })
      .map(({ start, open, extra }) => ({
        id: id(),
        from: fromEpochDay(start),
        until: open ? null : fromEpochDay(start + extra),
        note: '',
      })),
    { nil: null },
  );
  const entries = fc.array(
    fc
      .record({
        kind: fc.constantFrom('dca', 'lump', 'extra', 'sell'),
        on: days,
        slot: slotKeys,
        amount: cents,
        deleted: fc.boolean(),
      })
      .map(({ kind, on, slot, amount, deleted }) =>
        anEntry({
          kind,
          date: on,
          slot: kind === 'dca' ? (slot ?? monthKey(on)) : null,
          amount,
          deletedAt: deleted ? instant('2027-01-01T09:00:00+00:00') : null,
        }),
      ),
    { maxLength: 20 },
  );
  return fc.record({
    plan: fc.record({ mask: fc.array(fc.boolean(), { minLength: keys.length, maxLength: keys.length }), pause }).map(
      ({ mask, pause: one }): Plan => ({
        ...base,
        skips: keys
          .filter((_, index) => mask[index])
          .map((slot) => ({ id: id(), slot, note: '', createdAt: instant('2026-01-01T09:00:00+00:00') })),
        pauses: one === null ? [] : [one],
      }),
    ),
    entries,
    today: days,
    amount: cents,
  });
});

describe('plan totals properties (docs/DOMAIN.md §3.10)', () => {
  it('a held entry, whatever its date and cost, changes no field of planTotals', () => {
    const cost = fc.option(amountsOrZero, { nil: null });
    fc.assert(
      fc.property(cases, fc.integer({ min: -4000, max: 4000 }), cost, (generated, offset, amount) => {
        const { plan, entries, today } = generated;
        const held = anEntry({ kind: 'held', slot: null, fee: null, date: addDays(plan.firstBuy, offset), amount });
        expect(planTotals(plan, [...entries, held], today)).toEqual(planTotals(plan, entries, today));
      }),
    );
  });

  it('an extra buy dated before the first buy day changes no total', () => {
    fc.assert(
      fc.property(cases, fc.oneof(fc.constant(1), fc.integer({ min: 1, max: 3650 })), (generated, before) => {
        const { plan, entries, today, amount } = generated;
        const extra = anEntry({ kind: 'extra', slot: null, date: addDays(plan.firstBuy, -before), amount });
        expect(planTotals(plan, [...entries, extra], today)).toEqual(planTotals(plan, entries, today));
      }),
    );
  });

  it('an extra buy from the first buy day on adds its amount, and only the share follows', () => {
    fc.assert(
      fc.property(cases, fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3650 })), (generated, after) => {
        const { plan, entries, today, amount } = generated;
        const extra = anEntry({ kind: 'extra', slot: null, date: addDays(plan.firstBuy, after), amount });
        const without = planTotals(plan, entries, today);
        const withIt = planTotals(plan, [...entries, extra], today);
        expect({ ...withIt, investedSoFar: without.investedSoFar, percentIn: without.percentIn }).toEqual(without);
        expect(compare(withIt.investedSoFar, plus(without.investedSoFar, amount))).toBe(0);
        expect(withIt.percentIn === null).toBe(without.percentIn === null);
        if (withIt.percentIn !== null && without.percentIn !== null) {
          expect(compare(withIt.percentIn, without.percentIn)).toBeGreaterThanOrEqual(0);
          expect(compare(withIt.percentIn, '100' as typeof withIt.percentIn)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});
