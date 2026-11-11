import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, money, month } from '../../test/builders';
import { addDays, compareInstants, fromEpochDay } from '../dates/calendar';
import type { PhaseKind } from '../plan/phase';
import { CountryRulesSchema } from '../schema/country';
import {
  acknowledgeRuleChange,
  nextBuyReminder,
  nextReviewOn,
  reviewAsked,
  reviewDue,
  ruleChangeNotice,
  underReview,
} from './reminders';

describe('nextBuyReminder (docs/DOMAIN.md §3.12)', () => {
  const plan = aPlan({ firstBuy: date('2026-01-01'), buyDay: 1, lastBuy: date('2026-12-01') });
  const logged = ['2026-01', '2026-02'].map((slot) => anEntry({ slot: month(slot), date: date(`${slot}-01`) }));

  it('is the next slot due today or later that still asks for a buy, never a late one', () => {
    // March is late on the 15th; the reminder is for April.
    expect(nextBuyReminder(plan, logged, date('2026-03-15'))).toEqual({ key: '2026-04', due: '2026-04-01' });
    expect(nextBuyReminder(plan, logged, date('2026-04-01'))).toEqual({ key: '2026-04', due: '2026-04-01' });
  });

  it('passes over skipped, paused and already logged months', () => {
    const quiet = {
      ...plan,
      skips: [{ id: id(), slot: month('2026-04'), note: 'travelling', createdAt: instant('2026-03-20T10:00:00Z') }],
      pauses: [{ id: id(), from: date('2026-05-01'), until: date('2026-06-30'), note: '' }],
    };
    expect(nextBuyReminder(quiet, logged, date('2026-03-15'))).toEqual({ key: '2026-07', due: '2026-07-01' });
    const early = anEntry({ slot: month('2026-04'), date: date('2026-03-30') });
    expect(nextBuyReminder(plan, [...logged, early], date('2026-03-31'))).toEqual({
      key: '2026-05',
      due: '2026-05-01',
    });
  });

  it('is none once the buying is over, or for a plan without monthly buys', () => {
    expect(nextBuyReminder(plan, logged, date('2026-12-02'))).toBeNull();
    const lumpOnly = aPlan({ monthlyAmount: money('0'), startingAmount: money('1000') });
    expect(nextBuyReminder(lumpOnly, [], date('2026-01-01'))).toBeNull();
  });
});

describe('reviewDue', () => {
  it('is due twelve months after the plan was created', () => {
    const dates = { createdOn: date('2026-01-31'), reviewedOn: null };
    expect(nextReviewOn(dates)).toBe('2027-01-31');
    expect(reviewDue(dates, date('2027-01-30'))).toBe(false);
    expect(reviewDue(dates, date('2027-01-31'))).toBe(true);
  });

  it('is due again twelve months after each review', () => {
    const dates = { createdOn: date('2026-01-31'), reviewedOn: date('2027-02-10') };
    expect(nextReviewOn(dates)).toBe('2028-02-10');
    expect(reviewDue(dates, date('2027-06-01'))).toBe(false);
    expect(reviewDue(dates, date('2028-02-10'))).toBe(true);
  });

  it('clamps 29 February to the 28th and ignores a review from before the plan existed', () => {
    expect(nextReviewOn({ createdOn: date('2028-02-29'), reviewedOn: null })).toBe('2029-02-28');
    expect(nextReviewOn({ createdOn: date('2026-06-01'), reviewedOn: date('2025-12-01') })).toBe('2027-06-01');
  });
});

describe('reviewAsked (docs/DOMAIN.md §3.12)', () => {
  // Created on 5 Apr 2026: due from 5 Apr 2027.
  const dates = { createdOn: date('2026-04-05'), reviewedOn: null };
  const due = date('2027-04-05');
  const episode = { start: date('2027-03-30'), last: date('2027-04-02') };
  const at = (phase: PhaseKind, held = true, redDay: typeof episode | null = null) => ({ phase, held, redDay });
  const phases: PhaseKind[] = ['before', 'buy', 'hold', 'sell', 'exit'];

  it('not due gives false, in every phase', () => {
    for (const phase of [...phases, 'done' as const]) expect(reviewAsked(dates, date('2027-04-04'), at(phase))).toBe(false);
  });

  it('due gives true in before, buy, hold, sell and exit, with units held or none', () => {
    for (const phase of phases) {
      expect(reviewAsked(dates, due, at(phase))).toBe(true);
      expect(reviewAsked(dates, due, at(phase, false))).toBe(true);
    }
  });

  it('a red-day episode under way gives false, whether its banner shows on this visit or showed before', () => {
    for (const phase of [...phases, 'done' as const]) expect(reviewAsked(dates, due, at(phase, true, episode))).toBe(false);
  });

  it('done with units held gives true; done with none gives false', () => {
    expect(reviewAsked(dates, due, at('done', true))).toBe(true);
    expect(reviewAsked(dates, due, at('done', false))).toBe(false);
  });
});

describe('underReview (docs/JURISDICTIONS.md §1)', () => {
  const germany = { nextReviewDue: date('2027-01-01') };

  it('a card is not under review twelve months after nextReviewDue', () => {
    expect(underReview(germany, date('2028-01-01'))).toBe(false);
  });

  it('it is the day after', () => {
    expect(underReview(germany, date('2028-01-02'))).toBe(true);
  });

  it('a clamped month end stays in step', () => {
    const leap = { nextReviewDue: date('2028-02-29') };
    expect(underReview(leap, date('2029-02-28'))).toBe(false);
    expect(underReview(leap, date('2029-03-01'))).toBe(true);
  });

  it('once under review, every later day is', () => {
    // 2000-01-01 to 2099-12-31, past the clamped 29 February of every leap year in the range.
    const anyDate = fc.integer({ min: 10_957, max: 47_482 }).map(fromEpochDay);
    fc.assert(
      fc.property(anyDate, anyDate, fc.integer({ min: 1, max: 3000 }), (nextReviewDue, today, later) => {
        fc.pre(underReview({ nextReviewDue }, today));
        expect(underReview({ nextReviewDue }, addDays(today, later))).toBe(true);
      }),
    );
  });
});

describe('ruleChangeNotice', () => {
  const portugal = (version: number, changeNotice: string | null) =>
    CountryRulesSchema.parse({
      code: 'PT',
      name: 'Portugal',
      currency: 'EUR',
      locales: ['pt-PT'],
      numberFormatLocale: 'pt-PT',
      dateFormatLocale: 'pt-PT',
      timezones: ['Europe/Lisbon'],
      taxYear: { start: '01-01', end: '12-31' },
      computationModel: { kind: 'per-lot' },
      holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
      holdingRuleOverrides: [],
      holdingRuleConditions: [],
      lotRule: 'fifo',
      lotScope: 'per-venue',
      status: {
        version,
        changedOn: '2027-01-01',
        changeNotice,
        lastReviewed: '2027-01-01',
        nextReviewDue: '2028-01-01',
      },
    });
  const plan = aPlan({ country: 'PT', countryRuleVersion: 1 });

  it('gives the dated notice while the profile is newer than the version the plan last saw', () => {
    const notice = 'Portugal updated its rule for 2027. Review your plan.';
    expect(ruleChangeNotice(plan, portugal(2, notice))).toEqual({
      country: 'PT',
      version: 2,
      changedOn: '2027-01-01',
      changeNotice: notice,
    });
    expect(ruleChangeNotice(plan, portugal(2, null))?.changeNotice).toBeNull();
  });

  it('is none once the plan has seen the version, which is how a dismissal is stored', () => {
    expect(ruleChangeNotice(plan, portugal(1, null))).toBeNull();
    expect(ruleChangeNotice({ ...plan, countryRuleVersion: 2 }, portugal(2, 'Changed.'))).toBeNull();
  });

  it('refuses the profile of another country', () => {
    expect(() => ruleChangeNotice({ ...plan, country: 'DE' }, portugal(2, null))).toThrow(RangeError);
  });
});

describe('acknowledgeRuleChange (docs/DOMAIN.md §3.12)', () => {
  const stored = aPlan({ countryRuleVersion: 1, updatedAt: instant('2026-10-20T12:00:00Z') });

  it('acknowledgeRuleChange stores the version in a write later than the stored plan’s', () => {
    // The clock is behind the stored plan's stamp: the write still comes after it.
    const seen = acknowledgeRuleChange(stored, 2, instant('2026-10-20T09:00:00Z'));
    expect(seen.countryRuleVersion).toBe(2);
    expect(compareInstants(seen.updatedAt, stored.updatedAt)).toBeGreaterThan(0);
    expect({ ...seen, countryRuleVersion: 1, updatedAt: stored.updatedAt }).toEqual(stored);
    expect(acknowledgeRuleChange(stored, 2, instant('2026-10-21T09:00:00Z')).updatedAt).toBe('2026-10-21T09:00:00Z');
  });

  it('it never lowers countryRuleVersion', () => {
    fc.assert(
      fc.property(fc.nat(1000), fc.nat(1000), (held, version) => {
        const seen = acknowledgeRuleChange({ ...stored, countryRuleVersion: held }, version, stored.updatedAt);
        expect(seen.countryRuleVersion).toBe(Math.max(held, version));
      }),
    );
  });
});
