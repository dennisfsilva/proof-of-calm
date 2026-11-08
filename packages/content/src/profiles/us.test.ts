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

  it('lists three conditions beside the date: the swap first, then gifts and inheritance, then the state sentence', () => {
    expect(us.holdingRuleConditions).toEqual([
      'A swap or a purchase paid in crypto starts a new holding period for the units received (IRS FAQ Q16 and Q29).',
      "Gifted units keep the giver's holding period when records show it; inherited units are long-term at once (IRS FAQ Q33; IRS Publication 544).",
      'Federal rate only. Most states tax the gain at their own rates (42 levy an income tax; Tax Foundation, 2026; medium confidence). Confirm your state.',
    ]);
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
