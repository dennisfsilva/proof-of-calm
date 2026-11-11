// @vitest-environment node
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CountryRules, Plan, ReviewDates } from '@proofofcalm/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { reviewSummary } from './review';

// The review page's parts (docs/DOMAIN.md §3.12): the day it counts from, the next review day, the person's
// note, and the rules held: Portugal's (reviewed 5 Nov 2026, next due 2 Nov 2027, version 2) or the general
// profile's.

const day = (value: string) => value as CalendarDate;
const plan = (changes: Partial<Plan> = {}): Plan => ({ ...(fixtureSnapshot().plan as Plan), ...changes });
const created: ReviewDates = { createdOn: day('2026-04-05'), reviewedOn: null };
const TODAY = day('2027-04-05');

let portugal: CountryRules;
let generic: CountryRules;
beforeAll(async () => {
  const [pt, xx] = await Promise.all([loadProfile('PT'), loadProfile('XX')]);
  if (pt === null || xx === null) throw new Error('the profiles did not load');
  portugal = countryRules(pt);
  generic = countryRules(xx);
});

describe('reviewSummary', () => {
  it('quotes the note, trimmed, and leaves an empty one out', () => {
    expect(reviewSummary(plan({ why: '  For later.  ' }), portugal, created, TODAY).note).toBe('For later.');
    expect(reviewSummary(plan({ why: '   ' }), portugal, created, TODAY).note).toBeNull();
  });

  it('has no rules part while the rules load', () => {
    expect(reviewSummary(plan(), null, created, TODAY).rules).toBeNull();
  });

  it("names the plan's country and the day its rules were last reviewed", () => {
    expect(reviewSummary(plan(), portugal, created, TODAY).rules).toEqual({
      country: 'Portugal',
      checkedOn: '2026-11-05',
      generic: false,
      underReview: false,
      ruleChange: null,
    });
  });

  it('under the general profile of another country: no notice, never under review', () => {
    const rules = reviewSummary(plan({ countryRuleVersion: 0 }), generic, created, day('2040-01-01')).rules;
    expect(rules).toMatchObject({ generic: true, underReview: false, ruleChange: null });
  });

  it('passes a pending rule change through', () => {
    expect(reviewSummary(plan({ countryRuleVersion: 1 }), portugal, created, TODAY).rules?.ruleChange).toEqual({
      country: 'PT',
      version: 2,
      changedOn: '2026-11-05',
      changeNotice: portugal.status.changeNotice,
    });
  });

  it('is under review from the day after twelve months past the next review due', () => {
    expect(reviewSummary(plan(), portugal, created, day('2028-11-02')).rules?.underReview).toBe(false);
    expect(reviewSummary(plan(), portugal, created, day('2028-11-03')).rules?.underReview).toBe(true);
  });

  it('counts the next review from the later of the two days', () => {
    expect(reviewSummary(plan(), portugal, created, TODAY)).toMatchObject({
      since: { kind: 'created', on: '2026-04-05' },
      nextOn: '2027-04-05',
    });
    const reviewed = { createdOn: day('2026-04-05'), reviewedOn: day('2027-11-11') };
    expect(reviewSummary(plan(), portugal, reviewed, TODAY)).toMatchObject({
      since: { kind: 'reviewed', on: '2027-11-11' },
      nextOn: '2028-11-11',
    });
  });
});
