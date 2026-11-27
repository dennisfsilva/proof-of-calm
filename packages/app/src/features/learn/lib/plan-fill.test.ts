import type { Coin, Plan } from '@proofofcalm/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { fillFromPlan, type PlanFill } from './plan-fill';
import { readShares } from './split';

// `Fill in from your plan` (docs/EDUCATION.md §7, the verdict V1 of #14): the split in the plan's order, the buy
// day, and the amount only for a euro plan with a monthly amount above 0. Never the dates, the starting amount,
// pauses, skips or the fee, and nothing is written.

const plan = fixtureSnapshot().plan as Plan;
const [BTC, ETH] = plan.coins as [Coin, Coin];
const english = createNumberInput('en-GB');
const with_ = (changes: Partial<Plan>) => ({ ...plan, ...changes }) as Plan;

describe('fillFromPlan', () => {
  it('fills the split in the plan’s order, the buy day and the monthly amount of a euro plan', () => {
    const fill = fillFromPlan(with_({ coins: [ETH, BTC], split: { ETH: '30', BTC: '70' } as Plan['split'] }), english);
    expect(fill).toEqual({
      split: { coins: [ETH, BTC], shares: { ETH: '30', BTC: '70' } },
      buyDay: 5,
      amount: '100.00',
      line: null,
    });
  });

  it.each([1, 28])('copies the plan’s buy day %i', (buyDay) => {
    expect(fillFromPlan(with_({ buyDay }), english).buyDay).toBe(buyDay);
  });

  it('a monthly amount of 0 fills no amount and says so', () => {
    const fill = fillFromPlan(with_({ monthlyAmount: '0' as Plan['monthlyAmount'] }), english);
    expect(fill.amount).toBeNull();
    expect(fill.line).toBe('no-monthly');
  });

  it('a monthly amount of 0.01 fills 0.01', () => {
    const fill = fillFromPlan(with_({ monthlyAmount: '0.01' as Plan['monthlyAmount'] }), english);
    expect(fill).toMatchObject({ amount: '0.01', line: null });
  });

  it('a plan paid in another currency fills no amount and says the simulator works in euros', () => {
    const usd = fillFromPlan(with_({ payCurrency: 'USD' as Plan['payCurrency'] }), english);
    expect(usd).toMatchObject({ amount: null, line: 'other-currency', buyDay: 5 });
    expect(usd.split.coins).toEqual(plan.coins);
    const none = fillFromPlan(
      with_({ payCurrency: 'USD' as Plan['payCurrency'], monthlyAmount: '0' as Plan['monthlyAmount'] }),
      english,
    );
    expect(none.line).toBe('other-currency');
  });

  it('writes the amount and the shares in the person’s locale, and they read back as the plan’s', () => {
    const german = createNumberInput('de-DE');
    const fill = fillFromPlan(
      with_({
        monthlyAmount: '1234.5' as Plan['monthlyAmount'],
        split: { BTC: '66.667', ETH: '33.333' } as Plan['split'],
      }),
      german,
    );
    expect(fill.amount).toBe('1.234,50');
    expect(fill.split.shares).toEqual({ BTC: '66,667', ETH: '33,333' });
    expect(readShares(fill.split, german)).toEqual({ ok: true, value: { BTC: '66.667', ETH: '33.333' } });
  });

  it('carries no dates, starting amount, fee, pauses or skips, and leaves the plan as it was', () => {
    const before = structuredClone(plan);
    const fill: PlanFill = fillFromPlan(plan, english);
    expect(Object.keys(fill).sort()).toEqual(['amount', 'buyDay', 'line', 'split']);
    expect(plan).toEqual(before);
    expectTypeOf<keyof PlanFill>().toEqualTypeOf<'split' | 'buyDay' | 'amount' | 'line'>();
  });
});
