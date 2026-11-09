import { readFileSync } from 'node:fs';
import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CountryProfileSchema } from '../schema/jurisdiction.ts';
import {
  COUNTRY_CODES,
  countryChoices,
  countryRules,
  GENERIC_COUNTRY,
  holdingRuleSource,
  loadProfile,
  loadProfiles,
  ruleSource,
  suggestionProfiles,
} from './countries.ts';

const profiles = await loadProfiles();
const profile = (code: string) => {
  const found = profiles.find((candidate) => candidate.code === code);
  if (found === undefined) throw new Error(`no profile ${code}`);
  return found;
};
const fileOf = (code: string) =>
  JSON.parse(readFileSync(new URL(`../../jurisdictions/${code.toLowerCase()}.json`, import.meta.url), 'utf8'));

describe('loadProfile and loadProfiles', () => {
  it('load each profile as its file holds it, valid against the schema', async () => {
    expect(profiles.map((loaded) => loaded.code)).toEqual(['DE', 'ES', 'FR', 'GB', 'IE', 'IT', 'NL', 'PT', 'US', 'XX']);
    for (const code of COUNTRY_CODES) {
      const loaded = await loadProfile(code);
      expect(loaded).toEqual(fileOf(code));
      expect(CountryProfileSchema.parse(loaded)).toEqual(loaded);
    }
  });

  it('answer null for a country without a profile', async () => {
    expect(await loadProfile('ZZ')).toBeNull();
    expect(await loadProfile('pt')).toBeNull();
    expect(await loadProfile('toString')).toBeNull();
  });

  it('loadedProfile answers at once after a load and null before', async () => {
    // A fresh module: the file's own loadProfiles() above has filled this one.
    vi.resetModules();
    const fresh = await import('./countries.ts');
    expect(fresh.loadedProfile('PT')).toBeNull();
    const portugal = await fresh.loadProfile('PT');
    expect(fresh.loadedProfile('PT')).toBe(portugal);
    expect(fresh.loadedProfile('DE')).toBeNull();
    await fresh.loadProfiles();
    expect(fresh.loadedProfile('DE')?.code).toBe('DE');
    expect(fresh.loadedProfile('ZZ')).toBeNull();
  });
});

describe('holdingRuleSource (docs/JURISDICTIONS.md §2)', () => {
  it('holdingRuleSource follows ruleSources, wherever the source stands', () => {
    const portugal = profile('PT');
    const law = portugal.sources.find((source) => source.key === portugal.ruleSources.holdingRule);
    expect(law).toBeDefined();
    expect(holdingRuleSource(portugal)).toBe(law?.url);
    expect(holdingRuleSource({ ...portugal, sources: [...portugal.sources].reverse() })).toBe(law?.url);
    const unknown = { ...portugal.ruleSources, holdingRule: 'no-such-source' };
    expect(holdingRuleSource({ ...portugal, ruleSources: unknown })).toBeNull();
  });
});

describe('ruleSource (docs/JURISDICTIONS.md §2)', () => {
  const RULES = ['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'] as const;

  it('gives each rule the URL of the source its key names, wherever the source stands', () => {
    for (const code of COUNTRY_CODES) {
      const loaded = profile(code);
      for (const rule of RULES) {
        const url = loaded.sources.find((source) => source.key === loaded.ruleSources[rule])?.url;
        expect(url).toMatch(/^https:\/\//);
        expect(ruleSource(loaded, rule)).toBe(url);
        expect(ruleSource({ ...loaded, sources: [...loaded.sources].reverse() }, rule)).toBe(url);
      }
    }
  });

  it('answers null for a key no source holds, and holdingRuleSource is the holding rule’s', () => {
    const portugal = profile('PT');
    for (const rule of RULES) {
      const ruleSources = { ...portugal.ruleSources, [rule]: 'no-such-source' };
      expect(ruleSource({ ...portugal, ruleSources }, rule)).toBeNull();
    }
    expect(ruleSource(portugal, 'lotRule')).not.toBe(ruleSource(portugal, 'holdingRule'));
    expect(holdingRuleSource(portugal)).toBe(ruleSource(portugal, 'holdingRule'));
  });
});

describe('countryRules (docs/DOMAIN.md §4)', () => {
  it('gives the core what it reads, which the core’s own schema accepts', () => {
    for (const loaded of profiles) {
      const rules = countryRules(loaded);
      expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    }
  });

  it('carries the currency, the holding rule, the lot rule and its scope, and the rule version', () => {
    expect(countryRules(profile('PT'))).toMatchObject({
      currency: 'EUR',
      englishConfidence: 'low',
      holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
      holdingRuleOverrides: [],
      lotRule: 'fifo',
      lotScope: 'per-venue',
      status: {
        version: 2,
        changedOn: '2026-11-05',
        changeNotice:
          'Portugal lowered six IRS bracket rates for 2026 income. The 28% rate and the 365-day rule are unchanged.',
        nextReviewDue: '2027-11-02',
      },
    });
    const germany = countryRules(profile('DE'));
    expect(germany).toMatchObject({
      holdingRule: { kind: 'years', years: 1, effect: 'exempt' },
      lotRule: 'fifo',
      lotScope: 'per-venue',
      status: { version: 1, nextReviewDue: '2027-01-01' },
    });
    expect('englishConfidence' in germany).toBe(false);
    expect(countryRules(profile('XX'))).toMatchObject({
      currency: 'EUR',
      holdingRule: { kind: 'none' },
      lotRule: 'unspecified',
      lotScope: 'global',
      holdingRuleConditions: [],
    });
  });

  it('keeps an enacted override by acquisition date (what Germany’s draft would add once it is law)', () => {
    const enacted = {
      ...profile('DE'),
      holdingRuleOverrides: [
        {
          acquiredFrom: '2027-01-01',
          rule: { kind: 'none' as const },
          note: 'No holding period for coins bought from 2027.',
        },
      ],
    };
    const rules = CountryRulesSchema.parse(countryRules(enacted));
    expect(holdingStatus(date('2027-01-01'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
    expect(holdingStatus(date('2026-12-31'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({
      kind: 'dated',
      from: '2028-01-01',
      effect: 'exempt',
    });
  });
});

describe('the holding rule applied per profile (docs/JURISDICTIONS.md §7.6, §7.7)', () => {
  const statusIn = (code: string, bought: string) => {
    const rules = countryRules(profile(code));
    return holdingStatus(date(bought), rules.holdingRule, rules.holdingRuleOverrides);
  };

  it('Portugal: 365 days, so a unit bought on 2026-03-01 is tax-free from 2027-03-01', () => {
    expect(statusIn('PT', '2026-03-01')).toEqual({ kind: 'dated', from: '2027-03-01', effect: 'exempt' });
  });

  it('Germany: more than one year, so a unit bought on 2026-03-15 is tax-free from 2027-03-16', () => {
    expect(statusIn('DE', '2026-03-15')).toEqual({ kind: 'dated', from: '2027-03-16', effect: 'exempt' });
  });

  it('the generic profile: no rule, so nothing is labelled "tax-free from"', () => {
    expect(statusIn('XX', '2026-03-15')).toEqual({ kind: 'none' });
  });
});

describe('suggestCountry with the profiles of M1 (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['pt-PT'], 'Europe/Lisbon', 'PT high'],
    [['pt-PT'], 'Atlantic/Azores', 'PT high'],
    [['en-GB'], 'Europe/Lisbon', 'PT low'],
    [['pt-BR'], 'Europe/Lisbon', 'PT medium'],
    [['de-DE'], 'Europe/Berlin', 'DE high'],
    [['en-US'], 'Europe/Berlin', 'DE medium'],
    [['de-AT'], 'Europe/Berlin', 'DE medium'],
    [['es-ES'], 'Europe/Madrid', 'ES high'],
    [['ca-ES'], 'Europe/Madrid', 'ES high'],
    [['es-ES'], 'Atlantic/Canary', 'ES high'],
    [['es-MX'], 'Europe/Madrid', 'ES medium'],
    [['de-DE'], 'Europe/Madrid', 'ES low*'],
    [['es-MX'], 'America/Mexico_City', null],
    [['es-ES'], 'Europe/Andorra', null],
    [['fr-FR'], 'Europe/Paris', 'FR high'],
    [['en-US'], 'Europe/Paris', 'FR medium'],
    [['de-DE'], 'Europe/Paris', 'FR low*'],
    [['nl-NL'], 'Europe/Amsterdam', 'NL high'],
    [['en-GB'], 'Europe/Amsterdam', 'NL medium'],
    [['nl-BE'], 'Europe/Amsterdam', 'NL medium'],
    [['nl-BE'], 'Europe/Brussels', null],
    [['nl'], null, 'NL low'],
    [['pt-BR'], 'America/Sao_Paulo', null],
    [['de-AT'], 'Europe/Vienna', null],
    [['pt-PT'], 'UTC', 'PT low'],
    [['de'], null, 'DE low'],
    [['fr'], null, 'FR low'],
    [['en'], 'UTC', null],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });

  it('never suggests the generic profile, which is why the suggestion does not read it', () => {
    expect(suggestionProfiles(profiles).map((read) => read.code)).toEqual([
      'DE',
      'ES',
      'FR',
      'GB',
      'IE',
      'IT',
      'NL',
      'PT',
      'US',
    ]);
    expect(suggest(['en-XX'], null)).toBeNull();
    expect(suggest(['en'], 'UTC')).toBeNull();
    const withGeneric = profiles.map(countryRules);
    expect(suggestCountry({ languages: ['en-XX'], timeZone: null }, withGeneric)?.country).toBe(GENERIC_COUNTRY);
  });
});

describe('countryChoices (the picker, docs/JURISDICTIONS.md §3)', () => {
  const codes = (suggestion: { country: string } | null) => countryChoices(profiles, suggestion).map((c) => c.code);

  it('puts the generic profile first when nothing is suggested, then the countries by name', () => {
    expect(countryChoices(profiles, null)).toEqual([
      { code: 'XX', name: 'Other country' },
      { code: 'FR', name: 'France' },
      { code: 'DE', name: 'Germany' },
      { code: 'IE', name: 'Ireland' },
      { code: 'IT', name: 'Italy' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'PT', name: 'Portugal' },
      { code: 'ES', name: 'Spain' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'US', name: 'United States' },
    ]);
    const nothing = suggestCountry(
      { languages: ['pt-BR'], timeZone: 'America/Sao_Paulo' },
      suggestionProfiles(profiles),
    );
    expect(codes(nothing)).toEqual(['XX', 'FR', 'DE', 'IE', 'IT', 'NL', 'PT', 'ES', 'GB', 'US']);
  });

  it('puts a suggested country first and the generic profile last', () => {
    expect(codes({ country: 'PT' })).toEqual(['PT', 'FR', 'DE', 'IE', 'IT', 'NL', 'ES', 'GB', 'US', 'XX']);
    expect(codes({ country: 'DE' })).toEqual(['DE', 'FR', 'IE', 'IT', 'NL', 'PT', 'ES', 'GB', 'US', 'XX']);
    expect(codes({ country: 'ZZ' })).toEqual(['FR', 'DE', 'IE', 'IT', 'NL', 'PT', 'ES', 'GB', 'US', 'XX']);
  });
});

describe('the generic profile (docs/JURISDICTIONS.md §2)', () => {
  it('formats in the browser’s locale: "und", which Intl resolves to the runtime’s default', () => {
    const generic = profile('XX');
    expect([generic.locales, generic.numberFormatLocale, generic.dateFormatLocale]).toEqual([['und'], 'und', 'und']);
    expect(new Intl.NumberFormat(generic.numberFormatLocale).resolvedOptions().locale).toBe(
      new Intl.NumberFormat().resolvedOptions().locale,
    );
    expect(new Intl.DateTimeFormat(generic.dateFormatLocale).resolvedOptions().locale).toBe(
      new Intl.DateTimeFormat().resolvedOptions().locale,
    );
  });

  it('lists only UTC, which the suggestion treats as no timezone, and states the card text of §2', () => {
    const generic = profile('XX');
    expect(generic.timezones).toEqual(['UTC']);
    expect(generic.card.summary60).toBe(
      'Proof of Calm has no reviewed rule set for your country. Treat every sale as a possibly taxable event and check with a local accountant. You can still use the plan, the log and the portfolio.',
    );
    expect(generic.status).toMatchObject({ confidence: 'high', reviewedBy: 'owner' });
  });
});
