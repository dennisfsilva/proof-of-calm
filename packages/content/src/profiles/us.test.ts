import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const us = profiles.find((candidate) => candidate.code === 'US');
if (us === undefined) throw new Error('no US profile');
const rules = countryRules(us);

describe('the United States profile (docs/JURISDICTIONS.md §7.5)', () => {
  it('parses to the rules the core reads: lower long-term rate after one year, specific lots per venue', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(rules).toMatchObject({
      currency: 'USD',
      holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' },
      lotRule: 'specific',
      lotScope: 'per-venue',
      computationModel: { kind: 'per-lot' },
    });
    expect(us.timezones).toEqual([
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ]);
  });

  it('the generated rules file answers the same rules as the profile (ADR-0049)', async () => {
    expect(await loadRules('US')).toEqual(rules);
  });

  // The state sentence first: the first condition is the one shown in full beside the date, and the long-term
  // rate is federal only (docs/JURISDICTIONS.md §1, never a benefit the country does not give).
  // Each condition is checked by its topic, never word for word: a content review that rewords one (the Tax
  // Foundation year, say) may touch only the content data (docs/CONTENT-OPS.md §1), so a pinned text would fail it.
  const conditionTopics: readonly (readonly RegExp[])[] = [[/\bstates?\b/i], [/\bswap\b/i], [/\bgift/i, /\binherit/i]];
  const conditionsInOrder = (conditions: readonly string[]): boolean =>
    conditions.length === conditionTopics.length &&
    conditionTopics.every((topics, index) => topics.every((topic) => topic.test(conditions[index] ?? '')));

  it('lists three conditions beside the date: the state sentence first, then the swap, then gifts and inheritance', () => {
    expect(conditionsInOrder(us.holdingRuleConditions)).toBe(true);
  });

  it('keeps passing when a review rewords a condition, and fails when two change places or one goes', () => {
    const [states = '', swap = '', gifts = ''] = us.holdingRuleConditions;
    const reviewed = [
      states.replace('Tax Foundation, 2026', 'Tax Foundation, 2027'),
      swap,
      'Inherited units are long-term at once, and gifted units keep the holding period of the giver (IRS FAQ Q33).',
    ];
    expect(reviewed[0]).toContain('Tax Foundation, 2027');
    expect(reviewed).not.toEqual(us.holdingRuleConditions);
    expect(conditionsInOrder(reviewed)).toBe(true);
    expect(conditionsInOrder([swap, states, gifts])).toBe(false);
    expect(conditionsInOrder([states, swap])).toBe(false);
  });

  it('a unit bought on 2026-03-15 takes the long-term rate from 2027-03-16, the day after the anniversary', () => {
    const statusOn = (bought: string) => holdingStatus(date(bought), rules.holdingRule, rules.holdingRuleOverrides);
    expect(statusOn('2026-03-15')).toEqual({ kind: 'dated', from: '2027-03-16', effect: 'lower-rate' });
  });

  it('every rule source resolves to a law or an authority', () => {
    for (const field of Object.keys(us.ruleSources) as (keyof typeof us.ruleSources)[]) {
      const key = us.ruleSources[field];
      const source = us.sources.find((candidate) => candidate.key === key);
      expect(ruleSource(us, field), field).toBe(source?.url ?? null);
      expect(['law', 'authority'], `${field}: ${key}`).toContain(source?.kind);
    }
  });

  describe('suggestCountry with the profiles so far (docs/JURISDICTIONS.md §3)', () => {
    const suggest = (languages: string[], timeZone: string | null) => {
      const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
      return suggestion === null
        ? null
        : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
    };

    it.each([
      [['en-US'], 'America/New_York', 'US high'],
      [['en'], 'America/New_York', 'US medium'],
      [['es-US'], 'America/Chicago', 'US medium'],
      // Toronto is a zone of no profile: nothing is suggested.
      [['en-US'], 'America/Toronto', null],
      [['en-US'], 'Europe/Berlin', 'DE medium'],
      [['en-US'], null, 'US low'],
      [['pt-BR'], 'America/Sao_Paulo', null],
    ])('%j in %s suggests %s', (languages, timeZone, expected) => {
      expect(suggest(languages, timeZone)).toBe(expected);
    });
  });
});
