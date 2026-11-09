import { countryRules, loadProfile, loadProfiles } from '@proofofcalm/content';
import { type CalendarDate, type CountryRules, changeCountry, type Plan } from '@proofofcalm/core';
import { instant } from '@proofofcalm/core/testing';
import { FIXTURE_RULES, fixturePlan } from '@proofofcalm/core/testing/country-change';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { earlyOpenOf, holdingCountryOf, sellWindowValueOf } from '../../plan';
import { countryOptions, countrySummary, ruleWordsOf } from './country';

// The core's country-change fixture holds the three profiles as the core sees them; they must stay the
// profiles' own, so a profile that changes fails here, not silently in the fixture.

const now = instant('2026-10-22T09:00:00+01:00');
const TODAY = '2026-10-22' as CalendarDate;
const format = createFormatters('en-GB', 'en-GB');

describe('the country-change fixture', () => {
  it.each(['PT', 'DE', 'XX'] as const)('holds the rules of %s as countryRules maps its profile', async (code) => {
    const profile = await loadProfile(code);
    expect(profile === null ? null : countryRules(profile)).toEqual(FIXTURE_RULES[code]);
  });
});

describe('the holding-rule overrides (docs/ROADMAP.md M2)', () => {
  it('holds none in any profile while the early-window check does not apply them', async () => {
    const overrides = (await loadProfiles()).map((profile) => [profile.code, profile.holdingRuleOverrides]);
    expect(
      overrides,
      'docs/ROADMAP.md M2, "Carried from M1": apply holding-rule overrides in the early-window check before any profile holds holdingRuleOverrides',
    ).toEqual(overrides.map(([code]) => [code, []]));
  });
});

describe('countrySummary', () => {
  it('lists the country and both holding rules in words', () => {
    expect(
      countrySummary(changeCountry(fixturePlan('PT'), FIXTURE_RULES.DE, now, 'country'), FIXTURE_RULES.PT, format),
    ).toEqual([
      { field: 'country', from: 'PT', to: 'DE' },
      {
        field: 'holdingRule',
        from: { key: 'days', values: { count: 365, figure: '365', effect: 'exempt' } },
        to: { key: 'years', values: { count: 1, figure: '1', effect: 'exempt' } },
      },
      { field: 'lastBuyEligible', from: '2025-10-29', to: '2025-10-30', effect: 'exempt' },
    ]);
    const generic = countrySummary(
      changeCountry(fixturePlan('DE'), FIXTURE_RULES.XX, now, 'country'),
      FIXTURE_RULES.DE,
      format,
    );
    expect(generic.at(-1)).toEqual({
      field: 'holdingRule',
      from: { key: 'years', values: { count: 1, figure: '1', effect: 'exempt' } },
      to: { key: 'none', values: {} },
    });
  });

  it('lists a currency the country moves, and nothing when nothing moves', () => {
    const us = { ...FIXTURE_RULES.DE, code: 'US', currency: 'USD' } as const;
    expect(countrySummary(changeCountry(fixturePlan('DE'), us, now, 'country'), FIXTURE_RULES.DE, format)).toEqual([
      { field: 'country', from: 'DE', to: 'US' },
      { field: 'payCurrency', from: 'EUR', to: 'USD' },
      { field: 'displayCurrency', from: 'EUR', to: 'USD' },
    ]);
    expect(
      countrySummary(changeCountry(fixturePlan('PT'), FIXTURE_RULES.PT, now, 'country'), FIXTURE_RULES.PT, format),
    ).toEqual([]);
  });

  // The last buy's holding date moves only between two countries' rules with the same effect: the person's own
  // rule, the generic profile and a rule with no period say nothing of a country's date.
  const lastBuyRows = (plan: Plan, to: CountryRules, opened: CountryRules | null) =>
    countrySummary(changeCountry(plan, to, now, 'country'), opened, format).filter(
      (row) => row.field === 'lastBuyEligible',
    );

  it("lists no last-buy date to or from the generic profile, or from the person's own rule", () => {
    expect(lastBuyRows(fixturePlan('DE'), FIXTURE_RULES.XX, FIXTURE_RULES.DE)).toEqual([]);
    expect(lastBuyRows(fixturePlan('XX'), FIXTURE_RULES.DE, FIXTURE_RULES.XX)).toEqual([]);
    const own: Plan = { ...fixturePlan('PT'), holdingRule: { kind: 'days', days: 730, effect: 'exempt' } };
    expect(lastBuyRows(own, FIXTURE_RULES.DE, FIXTURE_RULES.PT)).toEqual([]);
    expect(lastBuyRows(fixturePlan('PT'), FIXTURE_RULES.DE, null)).toEqual([]);
  });

  it('lists no last-buy date when the effects differ or a rule has no period', () => {
    const lower = { ...FIXTURE_RULES.DE, holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' } } as const;
    expect(lastBuyRows(fixturePlan('PT'), lower, FIXTURE_RULES.PT)).toEqual([]);
    const none = { ...FIXTURE_RULES.DE, holdingRule: { kind: 'none' } } as const;
    expect(lastBuyRows(fixturePlan('PT'), none, FIXTURE_RULES.PT)).toEqual([]);
  });
});

describe('earlyOpenOf', () => {
  it('gives no early opening under a rule with no period', () => {
    const value = sellWindowValueOf(fixturePlan('DE').sellWindow);
    expect(earlyOpenOf(fixturePlan('DE'), value)).not.toBeNull();
    const plan = { lastBuy: fixturePlan('DE').lastBuy, holdingRule: { kind: 'none' } } as const;
    expect(earlyOpenOf(plan, value)).toBeNull();
  });
});

describe('countryOptions', () => {
  it('orders the loaded profiles by name with the generic one last, leaving out one that did not load', () => {
    const options = countryOptions([FIXTURE_RULES.XX, FIXTURE_RULES.PT, null, FIXTURE_RULES.DE]);
    expect(options.map((rules) => rules.code)).toEqual(['DE', 'PT', 'XX']);
  });
});

describe('ruleWordsOf', () => {
  const days = { key: 'days', values: { count: 365, figure: '365', effect: 'exempt' } } as const;

  it("gives a country's rule in words once its source is known, and the person's own rule always", async () => {
    expect(
      ruleWordsOf(holdingCountryOf(FIXTURE_RULES.PT, '16 Oct 2026', await loadProfile('PT'), TODAY), days),
    ).toEqual(days);
    expect(ruleWordsOf(null, days)).toEqual(days);
  });

  it("lists the rule's name without its words while the profile did not load, as Hold & sell does", () => {
    expect(ruleWordsOf(holdingCountryOf(FIXTURE_RULES.PT, '16 Oct 2026', null, TODAY), days)).toBeNull();
    expect(
      ruleWordsOf(holdingCountryOf(FIXTURE_RULES.XX, '17 Oct 2026', null, TODAY), { key: 'none', values: {} }),
    ).toBeNull();
  });

  it("gives the general profile's own text in place of its rule", async () => {
    const xx = holdingCountryOf(FIXTURE_RULES.XX, '17 Oct 2026', await loadProfile('XX'), TODAY);
    expect(ruleWordsOf(xx, { key: 'none', values: {} })).toEqual({ text: xx.unreviewed?.text });
  });
});
