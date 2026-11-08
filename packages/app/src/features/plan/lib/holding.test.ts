import { loadProfile } from '@proofofcalm/content';
import { type CalendarDate, type HoldingRule, HoldingRuleSchema, sameHoldingRule } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import { describe, expect, it } from 'vitest';
import { createFormatters, createNumberInput } from '../../../lib/format';
import {
  COUNT_BOUNDS,
  type HoldingValue,
  holdingCountryOf,
  holdingRuleOf,
  holdingRuleText,
  holdingValueOf,
} from './holding';

// The holding rule editor's value (docs/JURISDICTIONS.md §5): the country's rule, or the person's own,
// whose count is read with the formatting locale (ADR-0034) as a whole number within HoldingRuleSchema's
// bounds. An own rule equal to the country's stores the country's, so its acquisition-date overrides
// still apply (holdingContext compares the rules with sameHoldingRule).

const english = createNumberInput('en-GB');
const portugal: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
const own = (changed: Partial<HoldingValue>): HoldingValue => ({
  source: 'own',
  kind: 'days',
  count: '730',
  effect: 'exempt',
  ...changed,
});
const issuesOf = (value: HoldingValue, country: HoldingRule | null = portugal) => {
  const result = holdingRuleOf(value, country, english);
  return result.ok ? [] : result.error;
};

describe('holdingRuleOf', () => {
  it("gives back the profile's rule for the country's rule", () => {
    const result = holdingRuleOf(own({ source: 'country', count: '', kind: 'none' }), portugal, english);
    expect(result).toEqual({ ok: true, value: portugal });
    expect(result.ok && result.value).toBe(portugal);
    expect(result.ok && sameHoldingRule(result.value, portugal)).toBe(true);
  });

  it('reads an own rule of 730 days, exempt', () => {
    expect(holdingRuleOf(own({}), portugal, english)).toEqual({
      ok: true,
      value: { kind: 'days', days: 730, effect: 'exempt' },
    });
    expect(holdingRuleOf(own({ kind: 'years', count: '1', effect: 'lower-rate' }), null, english)).toEqual({
      ok: true,
      value: { kind: 'years', years: 1, effect: 'lower-rate' },
    });
    expect(holdingRuleOf(own({ kind: 'none', count: '' }), portugal, english)).toEqual({
      ok: true,
      value: { kind: 'none' },
    });
  });

  it("stores the country's rule when the own rule is the same", () => {
    const result = holdingRuleOf(own({ count: '365' }), portugal, english);
    expect(result.ok && result.value).toBe(portugal);
  });

  it('reads the count in the locale and refuses one that is not whole or out of bounds', () => {
    expect(holdingRuleOf(own({ count: '1,000' }), null, english)).toEqual({
      ok: true,
      value: { kind: 'days', days: 1000, effect: 'exempt' },
    });
    const path = ['holdingRule', 'count'];
    expect(issuesOf(own({ count: '1.5' }))).toEqual([{ code: 'count-whole', path }]);
    expect(issuesOf(own({ count: '0' }))).toEqual([{ code: 'count-range', path, min: '1', max: '36,500' }]);
    expect(issuesOf(own({ kind: 'years', count: '101' }))).toEqual([
      { code: 'count-range', path, min: '1', max: '100' },
    ]);
    expect(issuesOf(own({ count: '' }))).toEqual([{ code: 'number-empty', path }]);
    expect(issuesOf(own({ count: 'ten' }))).toEqual([{ code: 'number-invalid', example: '1,234.56', path }]);
  });

  it("refuses the country's rule when the country's rules are not loaded", () => {
    expect(issuesOf(own({ source: 'country' }), null)).toEqual([
      { code: 'country-unknown', path: ['holdingRule', 'source'] },
    ]);
  });

  it("keeps to HoldingRuleSchema's bounds", () => {
    for (const kind of ['days', 'years'] as const) {
      const [min, max] = COUNT_BOUNDS[kind];
      const rule = (count: number) => ({ kind, [kind]: count, effect: 'exempt' });
      expect(HoldingRuleSchema.safeParse(rule(min)).success).toBe(true);
      expect(HoldingRuleSchema.safeParse(rule(max)).success).toBe(true);
      expect(HoldingRuleSchema.safeParse(rule(min - 1)).success).toBe(false);
      expect(HoldingRuleSchema.safeParse(rule(max + 1)).success).toBe(false);
    }
  });
});

describe('holdingValueOf', () => {
  it("shows the plan's rule as the country's when they are the same, and round-trips", () => {
    const value = holdingValueOf({ effect: 'exempt', days: 365, kind: 'days' }, portugal, english);
    expect(value).toEqual({ source: 'country', kind: 'days', count: '365', effect: 'exempt' });
    expect(holdingRuleOf(value, portugal, english)).toEqual({ ok: true, value: portugal });
  });

  it('shows any other rule as the own rule, its count in the locale, and round-trips', () => {
    const rule: HoldingRule = { kind: 'days', days: 1000, effect: 'lower-rate' };
    const value = holdingValueOf(rule, portugal, english);
    expect(value).toEqual({ source: 'own', kind: 'days', count: '1,000', effect: 'lower-rate' });
    expect(holdingRuleOf(value, portugal, english)).toEqual({ ok: true, value: rule });
    expect(holdingValueOf({ kind: 'none' }, null, english)).toEqual({
      source: 'own',
      kind: 'none',
      count: '',
      effect: 'exempt',
    });
  });
});

describe('holdingRuleText', () => {
  const format = createFormatters('en-GB', 'en-GB');
  it('names the message and its values for each kind', () => {
    expect(holdingRuleText({ kind: 'none' }, format)).toEqual({ key: 'none', values: {} });
    expect(holdingRuleText(portugal, format)).toEqual({
      key: 'days',
      values: { count: 365, figure: '365', effect: 'exempt' },
    });
    expect(holdingRuleText({ kind: 'years', years: 1, effect: 'lower-rate' }, format)).toEqual({
      key: 'years',
      values: { count: 1, figure: '1', effect: 'lower-rate' },
    });
  });

  // A count in copy is the figure of the plan's number locale (docs/CONTENT-STYLE.md §4).
  it('groups the count as the number locale does', () => {
    const own = { kind: 'days', days: 1000, effect: 'exempt' } as const;
    expect(holdingRuleText(own, createFormatters('de-DE', 'en-GB')).values.figure).toBe('1.000');
  });
});

describe('holdingCountryOf', () => {
  const TODAY = '2026-10-20' as CalendarDate;

  it('names the country and links its rule to the law that sets it, its holdingRule source', async () => {
    const pt = await loadProfile('PT');
    expect(holdingCountryOf(FIXTURE_RULES.PT, '16 Oct 2026', pt, TODAY)).toEqual({
      code: 'PT',
      name: 'Portugal',
      rule: FIXTURE_RULES.PT.holdingRule,
      reviewed: '16 Oct 2026',
      conditions: FIXTURE_RULES.PT.holdingRuleConditions,
      source:
        'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx',
    });
  });

  it('the card links the holdingRule source, not the first', async () => {
    const de = await loadProfile('DE');
    if (de === null) throw new Error('the DE profile loads');
    const reordered = { ...de, sources: [...de.sources].reverse() };
    expect(holdingCountryOf(FIXTURE_RULES.DE, '16 Oct 2026', reordered, TODAY).source).toBe(
      'https://www.gesetze-im-internet.de/estg/__23.html',
    );
  });

  it('links no source while the profile is not loaded', () => {
    expect(holdingCountryOf(FIXTURE_RULES.DE, '16 Oct 2026', null, TODAY)).toMatchObject({
      name: 'Germany',
      source: null,
    });
  });

  it('gives the generic profile its own status and holding-rule text, and no source', async () => {
    const xx = await loadProfile('XX');
    expect(holdingCountryOf(FIXTURE_RULES.XX, '17 Oct 2026', xx, TODAY)).toMatchObject({
      name: 'Other country',
      source: null,
      unreviewed: {
        status: 'Not reviewed: Proof of Calm has no reviewed rule set for your country.',
        text: 'No holding exemption is applied: treat every sale as a possibly taxable event.',
      },
    });
    expect(holdingCountryOf(FIXTURE_RULES.XX, '17 Oct 2026', null, TODAY).unreviewed).toEqual({
      status: null,
      text: null,
    });
  });

  // The rule in words shows only with its source (docs/LEGAL.md §6 question 13), so no source, no words.
  it("under review drops the source and the rule's words", async () => {
    const de = await loadProfile('DE');
    const card = (today: string) => holdingCountryOf(FIXTURE_RULES.DE, '16 Oct 2026', de, today as CalendarDate);
    expect(card('2028-01-01')).toMatchObject({ source: 'https://www.gesetze-im-internet.de/estg/__23.html' });
    expect(card('2028-01-01').underReview).toBeUndefined();
    expect(card('2028-01-02')).toMatchObject({ name: 'Germany', source: null, underReview: true });
  });

  it('the generic profile is never under review', async () => {
    const xx = await loadProfile('XX');
    const long = holdingCountryOf(FIXTURE_RULES.XX, '17 Oct 2026', xx, '2099-01-01' as CalendarDate);
    expect(long.underReview).toBeUndefined();
    expect(long.unreviewed?.text).toBe(
      'No holding exemption is applied: treat every sale as a possibly taxable event.',
    );
  });
});
