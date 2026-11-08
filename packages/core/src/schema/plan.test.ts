import { describe, expect, it } from 'vitest';
import { aPlan, BTC, date, ETH, id, instant, money, month, split } from '../../test/builders';
import type { Ratio } from '../money/decimal';
import { type Plan, PlanSchema, planIssues } from './plan';

const codes = (plan: Plan) => planIssues(plan).map((issue) => issue.code);

describe('PlanSchema', () => {
  it('accepts a valid plan and returns it unchanged', () => {
    const plan = aPlan();
    expect(PlanSchema.parse(plan)).toEqual(plan);
  });

  it('reports invariants as custom issues carrying the code and the path', () => {
    const result = PlanSchema.safeParse(aPlan({ split: split({ BTC: '70', ETH: '20' }) }));
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'custom', message: 'split-sum', path: ['split'] }),
    ]);
  });

  it('rejects unknown fields and wrong shapes before the invariants', () => {
    expect(PlanSchema.safeParse({ ...aPlan(), extra: 1 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...aPlan(), buyDay: 29 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...aPlan(), schemaVersion: 1 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...aPlan(), monthlyAmount: 100 }).success).toBe(false);
  });
});

describe('planIssues (docs/DOMAIN.md §2.1)', () => {
  it('finds nothing in a valid plan', () => {
    expect(planIssues(aPlan())).toEqual([]);
  });

  it('wants unique coins and a split over them that sums to exactly 100', () => {
    expect(codes(aPlan({ coins: [BTC, BTC], split: split({ BTC: '100' }) }))).toEqual(['coins-not-unique']);
    expect(codes(aPlan({ split: split({ BTC: '70', XRP: '30' }) }))).toEqual(['split-unknown-coin']);
    expect(codes(aPlan({ split: split({ BTC: '110', ETH: '-10' }) }))).toEqual(['split-negative']);
    expect(codes(aPlan({ split: split({ BTC: '70.00001', ETH: '29.99999' }) }))).toEqual([
      'split-precision',
      'split-precision',
    ]);
    // The prototype accepted 99.995 as "within 0.01"; this does not.
    expect(codes(aPlan({ split: split({ BTC: '69.995', ETH: '30' }) }))).toEqual(['split-sum']);
    expect(codes(aPlan({ split: split({ BTC: '100', ETH: '0' }) }))).toEqual([]);
  });

  it('wants an amount, never negative, never finer than the currency', () => {
    expect(codes(aPlan({ monthlyAmount: money('0'), startingAmount: money('0') }))).toEqual(['no-amount']);
    expect(codes(aPlan({ monthlyAmount: money('0'), startingAmount: money('500') }))).toEqual([]);
    expect(codes(aPlan({ monthlyAmount: money('-5') }))).toEqual(['amount-negative', 'no-amount']);
    expect(codes(aPlan({ monthlyAmount: money('99.999') }))).toEqual(['amount-precision']);
  });

  it('wants the last buy between the first buy and twenty years later, and at most 240 slots', () => {
    expect(codes(aPlan({ lastBuy: date('2025-12-31') }))).toEqual(['last-buy-before-first-buy']);
    expect(codes(aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2046-01-02') }))).toEqual(['plan-too-long']);
    // Exactly twenty years from the first buy would be 241 slots.
    expect(codes(aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2046-01-01') }))).toEqual(['plan-too-long']);
    expect(codes(aPlan({ firstBuy: date('2026-01-01'), lastBuy: date('2045-12-31') }))).toEqual([]);
  });

  it('wants the sell window in order', () => {
    const window = { opens: date('2028-06-01'), closes: date('2028-05-01'), exitBy: date('2028-12-31') };
    expect(codes(aPlan({ sellWindow: window }))).toEqual(['sell-window-order']);
    expect(codes(aPlan({ sellWindow: { ...window, closes: date('2029-01-31') } }))).toEqual(['sell-window-order']);
  });

  it('warns when the window opens before the last purchase passes the rule, unless the user accepted it', () => {
    // Last buy 2026-12-01 with 365 days: eligible 2027-12-01.
    const early = { opens: date('2027-11-01'), closes: date('2028-02-01'), exitBy: date('2028-03-01') };
    expect(codes(aPlan({ sellWindow: early }))).toEqual(['sell-window-before-eligibility']);
    expect(codes(aPlan({ sellWindow: { ...early, acceptedEarlyOpen: true } }))).toEqual([]);
    expect(codes(aPlan({ sellWindow: { ...early, opens: date('2027-12-01') } }))).toEqual([]);
    expect(codes(aPlan({ sellWindow: early, holdingRule: { kind: 'none' } }))).toEqual([]);
  });

  it('wants the expected peak in order and the expectations not negative', () => {
    expect(codes(aPlan({ references: { peakFrom: date('2029-10-31'), peakTo: date('2029-09-01') } }))).toEqual([
      'peak-order',
    ]);
    expect(codes(aPlan({ references: { peakFrom: date('2029-09-01') } }))).toEqual([]);
    expect(codes(aPlan({ expectations: { bear: '-0.5' as Ratio, base: '2.3' as Ratio } }))).toEqual([
      'expectation-negative',
    ]);
  });

  it('wants pauses in order and apart, and one skip per slot', () => {
    const pause = (from: string, until: string | null) => ({
      id: id(),
      from: date(from),
      until: until === null ? null : date(until),
      note: '',
    });
    expect(codes(aPlan({ pauses: [pause('2026-05-01', '2026-04-01')] }))).toEqual(['pause-order']);
    expect(codes(aPlan({ pauses: [pause('2026-03-01', '2026-05-01'), pause('2026-05-01', null)] }))).toEqual([
      'pauses-overlap',
    ]);
    expect(codes(aPlan({ pauses: [pause('2026-07-01', null), pause('2026-03-01', '2026-05-01')] }))).toEqual([]);
    expect(codes(aPlan({ pauses: [pause('2026-03-01', '2026-03-10'), pause('2026-03-01', '2026-03-20')] }))).toEqual([
      'pauses-overlap',
    ]);
    expect(codes(aPlan({ pauses: [pause('2026-03-01', null), pause('2026-07-01', null)] }))).toEqual([
      'pauses-overlap',
    ]);
    const skip = (slot: string) => ({
      id: id(),
      slot: month(slot),
      note: '',
      createdAt: instant('2026-03-02T10:00:00Z'),
    });
    expect(codes(aPlan({ skips: [skip('2026-03'), skip('2026-03')] }))).toEqual(['skips-not-unique']);
    expect(codes(aPlan({ skips: [skip('2026-03'), skip('2026-04')] }))).toEqual([]);
  });

  it('reports several broken invariants at once, in a stable order', () => {
    const plan = aPlan({ coins: [BTC, ETH, ETH], monthlyAmount: money('0'), lastBuy: date('2025-01-01') });
    expect(codes(plan)).toEqual(['coins-not-unique', 'no-amount', 'last-buy-before-first-buy']);
  });
});
