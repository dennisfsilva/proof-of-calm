import { addDays, type CalendarDate, type Plan, PlanSchema } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { earlyToAccept, lastBuyMax, MAX_PLAN_YEARS, type ScheduleValue, schedule } from './schedule';

// The amount-and-dates editor's value: the two amounts as typed, read with the formatting locale
// (ADR-0034), and the dates as the date input gives them; the core's invariants check the rest
// (docs/DOMAIN.md §2.1).

const plan = fixtureSnapshot().plan as Plan;
const english = createNumberInput('en-GB');
const portuguese = createNumberInput('pt-PT');
const day = (text: string) => text as CalendarDate;
const value: ScheduleValue = {
  monthlyAmount: '100',
  startingAmount: '1,000.00',
  firstBuy: day('2026-04-05'),
  buyDay: 5,
  lastBuy: day('2027-03-05'),
  acceptEarly: false,
};
// The length checks run without the fixture's sell window, which a last buy years later opens too early.
const windowless: Plan = { ...plan, sellWindow: null };
const issuesOf = (changed: Partial<ScheduleValue>, numberInput = english, of = windowless) => {
  const result = schedule(of, { ...value, ...changed }, numberInput);
  return result.ok ? [] : result.error;
};

describe('schedule', () => {
  it('reads the amounts and keeps the dates and the buy day, ready to merge into the plan', () => {
    const result = schedule(plan, { ...value, buyDay: 12 }, english);
    expect(result).toEqual({
      ok: true,
      value: {
        monthlyAmount: '100',
        startingAmount: '1000',
        firstBuy: '2026-04-05',
        buyDay: 12,
        lastBuy: '2027-03-05',
      },
    });
    if (result.ok) expect(PlanSchema.safeParse({ ...plan, ...result.value }).success).toBe(true);
  });

  it('reads "1,500" as 1.5 in pt-PT and as 1500 in en-GB', () => {
    const read = (numberInput: typeof english) => {
      const result = schedule(plan, { ...value, monthlyAmount: '1,500', startingAmount: '' }, numberInput);
      return result.ok ? result.value.monthlyAmount : null;
    };
    expect(read(portuguese)).toBe('1.5');
    expect(read(english)).toBe('1500');
  });

  it('reads an empty starting amount as none, and both empty as no amount, on the monthly amount', () => {
    expect(issuesOf({ startingAmount: '' })).toEqual([]);
    expect(issuesOf({ monthlyAmount: ' ', startingAmount: '' })).toEqual([
      { code: 'no-amount', path: ['monthlyAmount'] },
    ]);
  });

  it('gives the reading issue of each amount that cannot be read, on its path', () => {
    expect(issuesOf({ monthlyAmount: 'ten', startingAmount: '-5' })).toEqual([
      { code: 'number-invalid', example: '1,234.56', path: ['monthlyAmount'] },
      { code: 'number-negative', path: ['startingAmount'] },
    ]);
  });

  it('refuses an amount with more decimals than the pay currency has', () => {
    expect(issuesOf({ startingAmount: '10.005' })).toEqual([{ code: 'amount-precision', path: ['startingAmount'] }]);
  });

  it('asks for each date left empty, with the amounts that cannot be read, before checking the plan', () => {
    expect(issuesOf({ monthlyAmount: 'x', firstBuy: '', lastBuy: '' })).toEqual([
      { code: 'number-invalid', example: '1,234.56', path: ['monthlyAmount'] },
      { code: 'date-required', path: ['firstBuy'] },
      { code: 'date-required', path: ['lastBuy'] },
    ]);
  });

  it('refuses a last buy before the first buy, on the last buy; the same day is a plan of one buy', () => {
    expect(issuesOf({ lastBuy: day('2026-04-04') })).toEqual([
      { code: 'last-buy-before-first-buy', path: ['lastBuy'] },
    ]);
    expect(issuesOf({ lastBuy: day('2026-04-05') })).toEqual([]);
  });

  it('refuses a plan of more than 240 buys or 20 years on the last buy, naming the half that refused it', () => {
    const tooMany = [{ code: 'plan-too-long', path: ['lastBuy'], limit: 'buys' }];
    const tooLong = [{ code: 'plan-too-long', path: ['lastBuy'], limit: 'years' }];
    // On buy day 5 the 241st buy falls on the 20th anniversary of the first.
    expect(issuesOf({ lastBuy: day('2046-04-05') })).toEqual(tooMany);
    expect(issuesOf({ lastBuy: day('2046-04-04') })).toEqual([]);
    // On buy day 12 the 241st buy falls after it, so 20 years is the bound.
    expect(MAX_PLAN_YEARS).toBe(20);
    expect(issuesOf({ buyDay: 12, lastBuy: day('2046-04-06') })).toEqual(tooLong);
    expect(issuesOf({ buyDay: 12, lastBuy: day('2046-04-05') })).toEqual([]);
    // A plan with no monthly amount has no buys: only the 20 years refuse it.
    expect(issuesOf({ monthlyAmount: '0', lastBuy: day('2046-04-06') })).toEqual(tooLong);
    expect(issuesOf({ monthlyAmount: '0', lastBuy: day('2046-04-05') })).toEqual([]);
  });

  it.each([
    [5, '2046-04-04'],
    [1, '2046-03-31'],
    [12, '2046-04-05'],
    [28, '2046-04-05'],
  ])('bounds the last buy at the last date the plan accepts, on buy day %i: %s', (buyDay, max) => {
    expect(lastBuyMax(day('2026-04-05'), buyDay)).toBe(max);
    expect(issuesOf({ buyDay, lastBuy: day(max) })).toEqual([]);
    const next = addDays(day(max), 1);
    expect(issuesOf({ buyDay, lastBuy: next })).toEqual([
      { code: 'plan-too-long', path: ['lastBuy'], limit: buyDay < 12 ? 'buys' : 'years' },
    ]);
  });

  it('refuses a last buy that opens the sell window before the holding rule passes, on the acceptance', () => {
    // The fixture's sell window opens on 2029-09-01 and its holding rule is 365 days.
    expect(issuesOf({ lastBuy: day('2030-01-05') }, english, plan)).toEqual([
      { code: 'sell-window-before-eligibility', path: ['acceptEarly'] },
    ]);
    // 365 days after 2028-09-01 is the day the window opens: the last day a last buy passes the rule by then.
    expect(issuesOf({ lastBuy: day('2028-09-01') }, english, plan)).toEqual([]);
    expect(issuesOf({ lastBuy: day('2028-09-02') }, english, plan)).toHaveLength(1);
  });

  it('gives the window only with an acceptance given here, which a stored one holds for its own last buy only', () => {
    const window = plan.sellWindow as NonNullable<Plan['sellWindow']>;
    const accepted = schedule(plan, { ...value, lastBuy: day('2030-01-05'), acceptEarly: true }, english);
    expect(accepted.ok && accepted.value.sellWindow).toEqual({ ...window, acceptedEarlyOpen: true });
    const inTime = schedule(plan, { ...value, acceptEarly: true }, english);
    expect(inTime.ok && 'sellWindow' in inTime.value).toBe(false);
    // A window accepted for this last buy asks nothing and sends nothing; another last buy asks again.
    const stored: Plan = { ...plan, lastBuy: day('2030-01-05'), sellWindow: { ...window, acceptedEarlyOpen: true } };
    expect(earlyToAccept(stored, stored.lastBuy)).toBeNull();
    const kept = schedule(stored, { ...value, lastBuy: stored.lastBuy, monthlyAmount: '250' }, english);
    expect(kept.ok && 'sellWindow' in kept.value).toBe(false);
    expect(earlyToAccept(stored, day('2030-02-05'))).toEqual({
      eligibleOn: '2031-02-05',
      effect: 'exempt',
      opensOn: '2029-09-01',
    });
    expect(issuesOf({ lastBuy: day('2030-02-05') }, english, stored)).toEqual([
      { code: 'sell-window-before-eligibility', path: ['acceptEarly'] },
    ]);
  });
});
