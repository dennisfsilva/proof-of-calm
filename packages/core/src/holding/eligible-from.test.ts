import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { date } from '../../test/builders';
import { daysBetween, epochDay, fromEpochDay } from '../dates/calendar';
import type { HoldingRule, HoldingRuleOverride } from '../schema/holding-rule';
import { eligibleFrom, holdingStatus, ruleFor, sameHoldingRule } from './eligible-from';

const PORTUGAL: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
const GERMANY: HoldingRule = { kind: 'years', years: 1, effect: 'exempt' };
const US: HoldingRule = { kind: 'years', years: 1, effect: 'lower-rate' };
const NONE: HoldingRule = { kind: 'none' };

describe('sameHoldingRule', () => {
  it('compares the kind, the period and the effect, never the order of the fields', () => {
    expect(sameHoldingRule(GERMANY, { effect: 'exempt', years: 1, kind: 'years' })).toBe(true);
    expect(sameHoldingRule(PORTUGAL, { kind: 'days', days: 365, effect: 'exempt' })).toBe(true);
    expect(sameHoldingRule(NONE, { kind: 'none' })).toBe(true);
    expect(sameHoldingRule(GERMANY, US)).toBe(false);
    expect(sameHoldingRule(PORTUGAL, { kind: 'years', years: 365, effect: 'exempt' })).toBe(false);
    expect(sameHoldingRule(NONE, PORTUGAL)).toBe(false);
  });
});

describe('eligibleFrom (docs/DOMAIN.md §3.7, docs/JURISDICTIONS.md §7)', () => {
  it('counts 365 calendar days in Portugal', () => {
    expect(eligibleFrom(date('2026-03-01'), PORTUGAL)).toBe('2027-03-01');
    // Across a leap year, 365 days land on 29 February.
    expect(eligibleFrom(date('2027-03-01'), PORTUGAL)).toBe('2028-02-29');
  });

  it('starts the day after the anniversary in Germany and the US', () => {
    expect(eligibleFrom(date('2026-03-15'), GERMANY)).toBe('2027-03-16');
    expect(eligibleFrom(date('2026-03-15'), US)).toBe('2027-03-16');
    // The anniversary of 29 February is 28 February in a common year.
    expect(eligibleFrom(date('2024-02-29'), GERMANY)).toBe('2025-03-01');
    expect(eligibleFrom(date('2028-02-29'), { kind: 'years', years: 4, effect: 'exempt' })).toBe('2032-03-01');
  });

  it('is the purchase date where no rule exists', () => {
    expect(eligibleFrom(date('2026-03-15'), NONE)).toBe('2026-03-15');
  });

  it('treats an unknown rule as a programmer error', () => {
    expect(() => eligibleFrom(date('2026-03-15'), { kind: 'months' } as unknown as HoldingRule)).toThrow(
      'Unhandled case',
    );
  });

  it('never precedes the purchase and grows with it', () => {
    const dates = fc
      .integer({ min: epochDay(date('2000-01-01')), max: epochDay(date('2090-01-01')) })
      .map(fromEpochDay);
    const rules = fc.constantFrom(PORTUGAL, GERMANY, US, NONE, { kind: 'years', years: 10, effect: 'exempt' } as const);
    fc.assert(
      fc.property(dates, dates, rules, (a, b, rule) => {
        expect(daysBetween(a, eligibleFrom(a, rule))).toBeGreaterThanOrEqual(0);
        if (a <= b) expect(eligibleFrom(a, rule) <= eligibleFrom(b, rule)).toBe(true);
      }),
    );
  });
});

describe('ruleFor and holdingStatus', () => {
  const overrides: HoldingRuleOverride[] = [
    { acquiredFrom: date('2027-01-01'), rule: NONE, note: 'Draft reform, if enacted' },
    { acquiredFrom: date('2030-01-01'), rule: { kind: 'years', years: 2, effect: 'exempt' }, note: 'later' },
    { acquiredFrom: date('2030-01-01'), rule: { kind: 'years', years: 3, effect: 'exempt' }, note: 'same day, later' },
  ];

  it('uses the plan rule for purchases before the first override', () => {
    expect(ruleFor(date('2026-12-31'), GERMANY, overrides)).toBe(GERMANY);
    expect(ruleFor(date('2026-12-31'), GERMANY)).toBe(GERMANY);
  });

  it('uses the latest override in force on the purchase date, the later one on a tie', () => {
    expect(ruleFor(date('2027-01-01'), GERMANY, overrides)).toBe(NONE);
    expect(ruleFor(date('2031-05-05'), GERMANY, overrides)).toEqual({ kind: 'years', years: 3, effect: 'exempt' });
  });

  it('gives the UI a date and an effect, or nothing', () => {
    expect(holdingStatus(date('2026-03-15'), GERMANY, overrides)).toEqual({
      kind: 'dated',
      from: '2027-03-16',
      effect: 'exempt',
    });
    expect(holdingStatus(date('2026-03-15'), US)).toEqual({ kind: 'dated', from: '2027-03-16', effect: 'lower-rate' });
    expect(holdingStatus(date('2027-06-01'), GERMANY, overrides)).toEqual({ kind: 'none' });
    expect(holdingStatus(date('2026-03-15'), NONE)).toEqual({ kind: 'none' });
  });
});
