import { describe, expect, it } from 'vitest';
import { BTC, date, ETH, id, instant, money, PreviousBuildPlanSchema } from '../../test/builders';
import type { HoldingRule } from '../schema/holding-rule';
import type { CoinId } from '../schema/ids';
import type { Split } from '../schema/plan';
import type { Template } from '../schema/template';
import { writtenPlan } from '../schema/upgrade';
import { followsTemplate, planFromTemplate, type TemplateStart, templateDatesUsable } from './template';

const SOL = { id: 'SOL' as CoinId, name: 'Solana', geckoId: 'solana', decimals: 4 };
const LINK = { id: 'LINK' as CoinId, name: 'Chainlink', geckoId: 'chainlink', decimals: 4 };
const split = (shares: Record<string, string>) => shares as unknown as Split;
const template = (overrides: Partial<Template>): Template => ({
  id: 'two-coins',
  name: 'Two coins',
  oneLine: 'Bitcoin and Ether, held.',
  riskLabel: 'High risk',
  explanation: 'Two coins, without Solana and Chainlink.',
  coins: [BTC, ETH],
  split: split({ BTC: '70', ETH: '30' }),
  sellWindow: null,
  references: {},
  lastReviewed: date('2026-10-01'),
  ...overrides,
});
const cycle = template({
  id: 'cycle-plan',
  name: 'Cycle plan',
  coins: [BTC, ETH, SOL, LINK],
  split: split({ BTC: '40', ETH: '30', SOL: '15', LINK: '15' }),
  lastBuy: date('2028-06-01'),
  sellWindow: { opens: date('2029-06-01'), closes: date('2029-10-31'), exitBy: date('2029-12-31') },
  references: { peakFrom: date('2029-09-01'), peakTo: date('2029-10-31'), halving: date('2028-04-15') },
  validUntil: date('2028-06-01'),
});
const PORTUGAL: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
const GERMANY: HoldingRule = { kind: 'years', years: 1, effect: 'exempt' };
const now = instant('2026-10-17T09:00:00Z');
const start = (overrides: Partial<TemplateStart> = {}): TemplateStart => ({
  id: id(),
  country: 'PT',
  countryRuleVersion: 3,
  holdingRule: PORTUGAL,
  payCurrency: 'EUR',
  displayCurrency: 'EUR',
  monthlyAmount: money('250'),
  startingAmount: money('1000'),
  firstBuy: date('2026-11-01'),
  buyDay: 1,
  lastBuy: null,
  sellWindow: null,
  acceptEarlyOpen: false,
  why: 'I buy on the 1st and do not check the price on other days.',
  today: date('2026-10-17'),
  now,
  ...overrides,
});

describe('templateDatesUsable (the prototype’s recDatesOk)', () => {
  it('fills a dated template’s dates only before validUntil', () => {
    expect(templateDatesUsable(cycle, date('2028-05-31'))).toBe(true);
    expect(templateDatesUsable(cycle, date('2028-06-01'))).toBe(false);
    expect(templateDatesUsable(template({}), date('2040-01-01'))).toBe(true);
  });
});

describe('planFromTemplate (docs/DOMAIN.md §5)', () => {
  it('takes coins, split, dates and references from the template, the rest from the user', () => {
    const begin = start();
    const result = planFromTemplate(cycle, begin);
    expect(result).toEqual({
      ok: true,
      value: {
        id: begin.id,
        schemaVersion: 3,
        country: 'PT',
        countryRuleVersion: 3,
        payCurrency: 'EUR',
        displayCurrency: 'EUR',
        coins: [BTC, ETH, SOL, LINK],
        split: { BTC: '40', ETH: '30', SOL: '15', LINK: '15' },
        monthlyAmount: '250',
        startingAmount: '1000',
        firstBuy: '2026-11-01',
        buyDay: 1,
        lastBuy: '2028-06-01',
        holdingRule: PORTUGAL,
        sellWindow: { opens: '2029-06-01', closes: '2029-10-31', exitBy: '2029-12-31' },
        references: { peakFrom: '2029-09-01', peakTo: '2029-10-31', halving: '2028-04-15' },
        expectations: {},
        pauses: [],
        skips: [],
        endedBuyingOn: null,
        sellChecks: { part1: false, part2: false, part3: false },
        why: 'I buy on the 1st and do not check the price on other days.',
        templateId: 'cycle-plan',
        // Onboarding records the acknowledgement; the template records none (docs/DOMAIN.md §2.1).
        riskAcknowledgedAt: null,
        riskWordingVersion: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  it('a plan from a template writes no expectations', () => {
    // The core's schema is loose, so a key the template no longer holds would otherwise pass through.
    const stale = { ...cycle, expectations: { bear: '0.7', base: '2.3', bull: '3.5' } };
    const result = planFromTemplate(stale, start());
    expect(result.ok && result.value.expectations).toEqual({});
  });

  it('rollback: the previous build reads a plan from a template (docs/RELEASE.md)', () => {
    const result = planFromTemplate(cycle, start());
    if (!result.ok) throw new Error('the Cycle plan starts');
    const { payload } = writtenPlan(result.value);
    expect(PreviousBuildPlanSchema.parse(payload)).toStrictEqual(payload);
  });

  it('asks before a window that opens before the last purchase passes the country’s rule', () => {
    // Germany: bought 2028-06-01, past the rule on 2029-06-02; the window opens a day earlier.
    expect(planFromTemplate(cycle, start({ country: 'DE', holdingRule: GERMANY }))).toEqual({
      ok: false,
      error: { code: 'invalid-plan', issues: ['sell-window-before-eligibility'] },
    });
    const accepted = planFromTemplate(cycle, start({ country: 'DE', holdingRule: GERMANY, acceptEarlyOpen: true }));
    expect(accepted.ok && accepted.value.sellWindow).toEqual(expect.objectContaining({ acceptedEarlyOpen: true }));
  });

  it('asks for the user’s dates when the template has none or its dates have passed', () => {
    const late = start({ today: date('2028-06-01'), firstBuy: date('2028-07-01') });
    expect(planFromTemplate(cycle, late)).toEqual({ ok: false, error: { code: 'dates-needed' } });
    const own = { opens: date('2034-01-01'), closes: date('2034-06-30'), exitBy: date('2034-12-31') };
    const dated = planFromTemplate(cycle, { ...late, lastBuy: date('2032-06-01'), sellWindow: own });
    expect(dated.ok && [dated.value.lastBuy, dated.value.sellWindow]).toEqual(['2032-06-01', own]);
    const hold = template({ id: 'btc-only-hold', coins: [BTC], split: split({ BTC: '100' }) });
    expect(planFromTemplate(hold, start())).toEqual({ ok: false, error: { code: 'dates-needed' } });
    const kept = planFromTemplate(hold, start({ lastBuy: date('2036-10-01') }));
    expect(kept.ok && [kept.value.lastBuy, kept.value.sellWindow, kept.value.expectations]).toEqual([
      '2036-10-01',
      null,
      {},
    ]);
  });

  it('reports what else the user’s choices break', () => {
    const result = planFromTemplate(template({}), start({ lastBuy: date('2026-10-01') }));
    expect(result).toEqual({ ok: false, error: { code: 'invalid-plan', issues: ['last-buy-before-first-buy'] } });
  });
});

describe('followsTemplate (docs/DOMAIN.md §5: "your own plan")', () => {
  const fromCycle = planFromTemplate(cycle, start());
  const plan = fromCycle.ok ? fromCycle.value : null;
  if (plan === null) throw new Error('the cycle plan should start');

  it('holds while the coins, the split and a dated template’s dates are the template’s', () => {
    expect(followsTemplate(plan, cycle)).toBe(true);
    expect(followsTemplate({ ...plan, coins: [...plan.coins].reverse() }, cycle)).toBe(true);
  });

  it('ends with any change to them, or with another template', () => {
    expect(followsTemplate({ ...plan, split: split({ BTC: '50', ETH: '20', SOL: '15', LINK: '15' }) }, cycle)).toBe(
      false,
    );
    expect(followsTemplate({ ...plan, split: split({ BTC: '40', ETH: '30', SOL: '30' }) }, cycle)).toBe(false);
    expect(followsTemplate({ ...plan, coins: [BTC, ETH, SOL] }, cycle)).toBe(false);
    expect(followsTemplate({ ...plan, lastBuy: date('2028-05-01') }, cycle)).toBe(false);
    const window = { opens: date('2029-07-01'), closes: date('2029-10-31'), exitBy: date('2029-12-31') };
    expect(followsTemplate({ ...plan, sellWindow: window }, cycle)).toBe(false);
    expect(followsTemplate({ ...plan, sellWindow: null }, cycle)).toBe(false);
    expect(followsTemplate({ ...plan, templateId: 'accumulate' }, cycle)).toBe(false);
  });

  it('lets the user add a sell window to a template that has none', () => {
    const two = template({});
    const begun = planFromTemplate(two, start({ lastBuy: date('2030-01-01') }));
    if (!begun.ok) throw new Error('two coins should start');
    const window = { opens: date('2031-06-01'), closes: date('2031-08-31'), exitBy: date('2031-12-31') };
    expect(followsTemplate({ ...begun.value, sellWindow: window }, two)).toBe(true);
  });
});
