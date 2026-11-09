import { describe, expect, it } from 'vitest';
import { changeCountry } from '../../src/actions/plan';
import { eligibleFrom } from '../../src/holding/eligible-from';
import type { Plan } from '../../src/schema/plan';
import { instant } from '../builders';
import { BUYS, CASES, FIXTURE_ENTRIES, FIXTURE_RULES, type FixtureCountry, fixturePlan } from './fixture';

// The hand-derived fixture of the country change (docs/DOMAIN.md §6 "Change country", §7): what each change
// lists, what the new rule breaks and the day each purchase passes the rule before and after; the entries
// are never touched.

const now = instant('2026-10-22T09:00:00+01:00');
const passes = (plan: Plan) => FIXTURE_ENTRIES.map((entry) => eligibleFrom(entry.date, plan.holdingRule));
const expected = (country: FixtureCountry) => BUYS.map((buy) => (country === 'XX' ? buy.date : buy[country]));

describe.each(CASES)('changeCountry $from → $to', ({ from, to, issues }) => {
  const before = fixturePlan(from);
  const entries = structuredClone(FIXTURE_ENTRIES);
  const change = changeCountry(before, FIXTURE_RULES[to], now, 'country');

  it('lists the country and the holding rule, which the person confirms; the currency stays EUR', () => {
    expect(change.changes).toEqual([
      { field: 'country', from, to },
      { field: 'holdingRule', from: FIXTURE_RULES[from].holdingRule, to: FIXTURE_RULES[to].holdingRule },
    ]);
    expect(change.plan).toMatchObject({ country: to, payCurrency: 'EUR', displayCurrency: 'EUR' });
  });

  it('reports the window the new rule makes early and drops an acceptance given under the old rule', () => {
    expect(change.issues).toEqual(issues);
    const { opens, closes, exitBy } = before.sellWindow ?? { opens: '', closes: '', exitBy: '' };
    expect(change.plan.sellWindow).toEqual({ opens, closes, exitBy });
  });

  it('moves each purchase’s eligibility day to the new rule, 29 February included', () => {
    expect(passes(before)).toEqual(expected(from));
    expect(passes(change.plan)).toEqual(expected(to));
  });

  it('leaves every entry and every amount as logged', () => {
    expect(FIXTURE_ENTRIES).toEqual(entries);
    expect(change.plan.monthlyAmount).toBe(before.monthlyAmount);
    expect(change.plan.startingAmount).toBe(before.startingAmount);
  });
});
