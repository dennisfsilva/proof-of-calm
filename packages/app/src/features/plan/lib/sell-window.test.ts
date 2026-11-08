import type { CalendarDate, Plan, SellWindow } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import {
  acceptedAsStored,
  earlyOpen,
  earlyOpenOf,
  ruleNameOf,
  type SellWindowValue,
  sameWindow,
  sellWindowOf,
  sellWindowValueOf,
} from './sell-window';

// The sell-window editor's value (docs/DOMAIN.md §2.1): no window, or its three dates in order; a window that
// opens before the last buy passes the holding rule saves only with the person's acceptance, recorded on the
// window, and only for the dates it was given for.

const plan = fixtureSnapshot().plan as Plan;
const day = (text: string) => text as CalendarDate;
// The fixture's last buy is 2027-03-05 under 365 days: it passes the rule on 2028-03-04 (2028 has 29 February).
const value: SellWindowValue = {
  mode: 'dates',
  opens: day('2029-09-01'),
  closes: day('2030-08-31'),
  exitBy: day('2030-12-31'),
  acceptEarly: false,
};
const issuesOf = (changed: Partial<SellWindowValue>) => {
  const result = sellWindowOf(plan, { ...value, ...changed });
  return result.ok ? [] : result.error;
};

describe('sellWindowOf', () => {
  it('gives the three dates as the window, and no window for none', () => {
    expect(sellWindowOf(plan, value)).toEqual({
      ok: true,
      value: { opens: '2029-09-01', closes: '2030-08-31', exitBy: '2030-12-31' },
    });
    expect(sellWindowOf(plan, { ...value, mode: 'none' })).toEqual({ ok: true, value: null });
  });

  it('asks for each date left empty, on its path', () => {
    expect(issuesOf({ opens: '', exitBy: '' })).toEqual([
      { code: 'date-required', path: ['sellWindow', 'opens'] },
      { code: 'date-required', path: ['sellWindow', 'exitBy'] },
    ]);
  });

  it('refuses dates out of order on the later date (sell-window-order); the same day is in order', () => {
    expect(issuesOf({ closes: day('2029-08-31') })).toEqual([
      { code: 'sell-window-order', path: ['sellWindow', 'closes'] },
    ]);
    expect(issuesOf({ exitBy: day('2030-08-30') })).toEqual([
      { code: 'sell-window-order', path: ['sellWindow', 'exitBy'] },
    ]);
    expect(issuesOf({ closes: day('2029-09-01'), exitBy: day('2029-09-01') })).toEqual([]);
  });

  it('refuses a window that opens before the last buy passes the rule, on the acceptance', () => {
    expect(issuesOf({ opens: day('2028-03-03') })).toEqual([
      { code: 'sell-window-before-eligibility', path: ['sellWindow', 'acceptEarly'] },
    ]);
    expect(issuesOf({ opens: day('2028-03-04') })).toEqual([]);
    // No holding rule: no window opens early.
    expect(sellWindowOf({ ...plan, holdingRule: { kind: 'none' } }, { ...value, opens: day('2027-03-05') }).ok).toBe(
      true,
    );
  });

  it('records an accepted early window with acceptedEarlyOpen, and drops an acceptance the dates no longer need', () => {
    expect(sellWindowOf(plan, { ...value, opens: day('2028-01-01'), acceptEarly: true })).toEqual({
      ok: true,
      value: { opens: '2028-01-01', closes: '2030-08-31', exitBy: '2030-12-31', acceptedEarlyOpen: true },
    });
    expect(sellWindowOf(plan, { ...value, acceptEarly: true })).toEqual({
      ok: true,
      value: { opens: '2029-09-01', closes: '2030-08-31', exitBy: '2030-12-31' },
    });
  });
});

describe('earlyOpen', () => {
  it("gives the day the last buy passes the rule and the window's opening, or null", () => {
    expect(earlyOpen({ ...plan, lastBuy: day('2030-01-05') }, plan.sellWindow)).toEqual({
      eligibleOn: '2031-01-05',
      effect: 'exempt',
      opensOn: '2029-09-01',
    });
    expect(earlyOpen(plan, plan.sellWindow)).toBeNull();
    expect(earlyOpen(plan, null)).toBeNull();
    expect(earlyOpen({ ...plan, lastBuy: day('2030-01-05'), holdingRule: { kind: 'none' } }, plan.sellWindow)).toBe(
      null,
    );
  });

  it("gives the editor's early opening only while it shows a window with an opening date", () => {
    const later = { ...plan, lastBuy: day('2030-01-05') };
    expect(earlyOpenOf(later, value)).toEqual({ eligibleOn: '2031-01-05', effect: 'exempt', opensOn: '2029-09-01' });
    expect(earlyOpenOf(later, { ...value, opens: '' })).toBeNull();
    expect(earlyOpenOf(later, { ...value, mode: 'none' })).toBeNull();
  });
});

describe('sellWindowValueOf', () => {
  it("gives the window's dates with the acceptance unticked, or none", () => {
    const window = { ...(plan.sellWindow as SellWindow), acceptedEarlyOpen: true as const };
    expect(sellWindowValueOf(window)).toEqual(value);
    expect(sellWindowValueOf(null)).toEqual({ mode: 'none', opens: '', closes: '', exitBy: '', acceptEarly: false });
  });

  it('holds a stored acceptance only for the dates and the rule it was given for', () => {
    const stored = { ...plan, sellWindow: { ...(plan.sellWindow as SellWindow), acceptedEarlyOpen: true as const } };
    expect(acceptedAsStored(stored, stored.holdingRule, value)).toBe(true);
    expect(acceptedAsStored(stored, stored.holdingRule, { ...value, closes: day('2030-09-30') })).toBe(false);
    expect(acceptedAsStored(stored, { kind: 'years', years: 2, effect: 'exempt' }, value)).toBe(false);
    expect(acceptedAsStored(plan, plan.holdingRule, value)).toBe(false);
  });

  it('names the rule as Hold & sell does: the country, the general profile, or the own', () => {
    const rule = plan.holdingRule;
    expect(ruleNameOf(rule, { code: plan.country, holdingRule: rule })).toBe('country');
    expect(ruleNameOf(rule, { code: 'XX' as Plan['country'], holdingRule: rule })).toBe('generic');
    expect(ruleNameOf(rule, { code: plan.country, holdingRule: { kind: 'none' } })).toBe('own');
    expect(ruleNameOf(rule, null)).toBe('own');
  });

  it('compares windows by their dates and acceptance', () => {
    const window = plan.sellWindow as SellWindow;
    expect(sameWindow(window, { ...window })).toBe(true);
    expect(sameWindow(window, { ...window, acceptedEarlyOpen: true })).toBe(false);
    expect(sameWindow(window, null)).toBe(false);
    expect(sameWindow(null, null)).toBe(true);
  });
});
