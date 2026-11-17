import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_LANGUAGES } from '../i18n/overlay.ts';
import { CountryProfileSchema } from '../schema/jurisdiction.ts';
import {
  COUNTRY_CODES,
  countryChoices,
  countryRules,
  GENERIC_COUNTRY,
  holdingRuleSource,
  loadProfile,
  loadProfiles,
  PROFILE_OVERLAYS,
  ruleSource,
  suggestionProfiles,
} from './countries.ts';
import { contentLanguageOf } from './language.ts';

const profiles = await loadProfiles();
const profile = (code: string) => {
  const found = profiles.find((candidate) => candidate.code === code);
  if (found === undefined) throw new Error(`no profile ${code}`);
  return found;
};
const fileOf = (code: string) =>
  JSON.parse(readFileSync(new URL(`../../jurisdictions/${code.toLowerCase()}.json`, import.meta.url), 'utf8'));

// A literal profile for the code that reads one: a content review may change every value of a live
// profile but its identity fields (docs/ENGINEERING.md §2, Tests and content reviews).
const LAW = 'https://example.org/law/holding';
const CIRCULAR = 'https://example.org/circular/lots';
const FIXTURE = CountryProfileSchema.parse({
  schemaVersion: 1,
  code: 'PT',
  name: 'Fixtureland',
  currency: 'EUR',
  locales: ['pt-PT'],
  numberFormatLocale: 'pt-PT',
  dateFormatLocale: 'pt-PT',
  timezones: ['Europe/Lisbon', 'Atlantic/Azores'],
  englishConfidence: 'low',
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Gains go in the annual return.',
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
  holdingRuleOverrides: [],
  holdingRuleConditions: ['The counterparty is in the EU or the EEA.'],
  lotRule: 'fifo',
  lotScope: 'per-venue',
  lotRuleNote: 'Lots are matched per platform.',
  card: {
    classification: 'Crypto held privately is a capital asset.',
    taxableEvents: [{ event: 'sale-to-fiat', taxable: 'depends', note: 'Tax-free after 365 days of holding.' }],
    rates: [{ label: 'Flat rate on gains', value: '28%', validFrom: '2023-01-01', validTo: null }],
    allowances: [],
    holdingRuleText: 'A purchase held for 365 days or more can be sold without tax on the gain.',
    lotRuleText: 'First in, first out, per platform.',
    losses: 'Losses offset gains of the same kind.',
    reporting: ['Annex\u00a0G of the return.'],
    caveats: ['A professional should confirm how a swap counts.'],
    summary60: 'Purchases held for 365 days or more are tax-free when sold.',
  },
  pendingChanges: [],
  sources: [
    {
      key: 'law',
      title: 'The law',
      url: LAW,
      publisher: 'Parliament',
      kind: 'law',
      published: null,
      accessed: '2026-10-16',
    },
    {
      key: 'circular',
      title: 'The circular',
      url: CIRCULAR,
      publisher: 'Tax authority',
      kind: 'authority',
      published: '2025-01-02',
      accessed: '2026-10-16',
    },
  ],
  ruleSources: { holdingRule: 'law', lotRule: 'circular', rates: 'law', losses: 'law', reporting: 'law' },
  status: {
    confidence: 'high',
    version: 3,
    changedOn: '2026-05-04',
    changeNotice: 'The rate changed on 4 May 2026.',
    lastReviewed: '2026-10-16',
    nextReviewDue: '2027-10-16',
    reviewedBy: 'owner',
  },
});
const FIXTURE_RULES = {
  code: 'PT',
  name: 'Fixtureland',
  currency: 'EUR',
  locales: ['pt-PT'],
  numberFormatLocale: 'pt-PT',
  dateFormatLocale: 'pt-PT',
  timezones: ['Europe/Lisbon', 'Atlantic/Azores'],
  englishConfidence: 'low',
  taxYear: { start: '01-01', end: '12-31' },
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
  holdingRuleOverrides: [],
  holdingRuleConditions: ['The counterparty is in the EU or the EEA.'],
  lotRule: 'fifo',
  lotScope: 'per-venue',
  status: {
    version: 3,
    changedOn: '2026-05-04',
    changeNotice: 'The rate changed on 4 May 2026.',
    lastReviewed: '2026-10-16',
    nextReviewDue: '2027-10-16',
  },
};

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

describe('loadProfile and loadProfiles in a content language (ADR-0057)', () => {
  const I18N = fileURLToPath(new URL('../../i18n/', import.meta.url));
  const overlayCodes = (language: string) => {
    const folder = join(I18N, language, 'jurisdictions');
    return existsSync(folder)
      ? readdirSync(folder)
          .filter((name) => name.endsWith('.json'))
          .map((name) => name.slice(0, -'.json'.length).toUpperCase())
          .sort()
      : [];
  };
  it('holds PROFILE_OVERLAYS to the files under i18n/<language>/jurisdictions, one record per overlay language', () => {
    expect(Object.keys(PROFILE_OVERLAYS).sort()).toEqual(CONTENT_LANGUAGES.filter((code) => code !== 'en').sort());
    for (const [language, overlays] of Object.entries(PROFILE_OVERLAYS)) {
      expect(Object.keys(overlays).sort(), language).toEqual(overlayCodes(language));
    }
  });

  it('answers the English profile itself in English and in a language without a translation of the file', async () => {
    const english = await loadProfile('PT');
    expect(await loadProfile('PT', 'en')).toBe(english);
    expect(await loadProfile('PT', 'de')).toBe(english);
    expect(await loadProfiles('de')).toEqual(profiles);
    expect(await loadProfile('ZZ', 'pt-PT')).toBeNull();
  });

  it('lays a translation over the English file, which loadedProfile then answers in that language alone', async () => {
    vi.resetModules();
    const fresh = await import('./countries.ts');
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = async () => ({ default: { name: 'Portugal (pt)', code: 'ES' } });
    const translated = await fresh.loadProfile('PT', 'pt-PT');
    expect(translated?.name).toBe('Portugal (pt)');
    expect(translated?.code).toBe('PT');
    expect(fresh.loadedProfile('PT', 'pt-PT')).toBe(translated);
    expect(fresh.loadedProfile('PT')?.name).toBe(fileOf('PT').name);
    expect((await fresh.loadProfiles('pt-PT')).find(({ code }) => code === 'PT')).toBe(translated);
  });

  it("answers the English profile when a translation's chunk fails to load (offline before it was fetched)", async () => {
    vi.resetModules();
    const fresh = await import('./countries.ts');
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    const english = await fresh.loadProfile('PT');
    expect(await fresh.loadProfile('PT', 'pt-PT')).toBe(english);
    expect(fresh.loadedProfile('PT', 'pt-PT')).toBeNull();
    expect((await fresh.loadProfiles('pt-PT')).find(({ code }) => code === 'PT')).toBe(english);
    // Online again: the next load takes the translation.
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = async () => ({ default: { name: 'Portugal (pt)' } });
    expect((await fresh.loadProfile('PT', 'pt-PT'))?.name).toBe('Portugal (pt)');
  });

  it('answers the English profile when the import resolves without the file, as the preload wrapper does', async () => {
    // In the web host a failed import rejects (apps/web/src/chunk-reload.ts leaves `vite:preloadError`'s default).
    // Vite's wrapper resolves it to undefined only under a listener that prevents it, so this guard stays as defence.
    vi.resetModules();
    const fresh = await import('./countries.ts');
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = () => Promise.resolve(undefined as unknown as { default: unknown });
    const english = await fresh.loadProfile('PT');
    expect(await fresh.loadProfile('PT', 'pt-PT')).toBe(english);
    expect(fresh.loadedProfile('PT', 'pt-PT')).toBeNull();
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = async () => ({ default: { name: 'Portugal (pt)' } });
    expect((await fresh.loadProfile('PT', 'pt-PT'))?.name).toBe('Portugal (pt)');
  });
});

describe('contentLanguageOf over the profiles (ADR-0057, Corrections of 2026-11-16)', () => {
  const loaded = async (code: string, language: 'en' | 'pt-PT') => {
    const found = await loadProfile(code, language);
    if (found === null) throw new Error(`no profile ${code}`);
    return found;
  };

  it('gives the language of the text each load returned: a translation its own, English otherwise', async () => {
    expect(contentLanguageOf(await loaded('PT', 'pt-PT'))).toBe('pt-PT');
    expect(contentLanguageOf(await loaded('DE', 'pt-PT'))).toBe('en');
    expect(contentLanguageOf(await loaded('PT', 'en'))).toBe('en');
    const all = await loadProfiles('pt-PT');
    const translated = new Set(Object.keys(PROFILE_OVERLAYS['pt-PT']));
    for (const each of all) expect(contentLanguageOf(each)).toBe(translated.has(each.code) ? 'pt-PT' : 'en');
  });

  it.each([
    ['GB', 'Reino Unido'],
    ['IE', 'Irlanda'],
    ['US', 'Estados Unidos'],
    ['FR', 'França'],
    ['IT', 'Itália'],
    ['NL', 'Países Baixos'],
  ])("gives %s's pt-PT name, marked pt-PT", async (code, name) => {
    const profile = await loaded(code, 'pt-PT');
    expect(profile.name).toBe(name);
    expect(contentLanguageOf(profile)).toBe('pt-PT');
  });

  it('lists none of those six English names in pt-PT', async () => {
    const names = (await loadProfiles('pt-PT')).map(({ name }) => name);
    for (const code of ['GB', 'IE', 'US', 'FR', 'IT', 'NL'])
      expect(names).not.toContain((await loaded(code, 'en')).name);
  });

  it.each([
    ['FR', 'EUR 305'],
    ['IT', 'Quadro RW'],
    ['NL', 'EUR 59 357'],
  ])("keeps %s's summary figure or form name joined as English writes it, in pt-PT", async (code, literal) => {
    const { summary60 } = (await loaded(code, 'pt-PT')).card;
    expect(summary60).toContain(literal);
    expect(summary60).not.toBe((await loaded(code, 'en')).card.summary60);
  });

  it("gives English for the fallback when the translation's chunk fails to load", async () => {
    vi.resetModules();
    const fresh = await import('./countries.ts');
    const { contentLanguageOf: languageOf } = await import('./language.ts');
    fresh.PROFILE_OVERLAYS['pt-PT'].PT = () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    const fallback = await fresh.loadProfile('PT', 'pt-PT');
    expect(fallback === null ? null : languageOf(fallback)).toBe('en');
  });

  it('gives nothing for an object no loader returned, so a copy keeps the page language', async () => {
    const portugal = await loaded('PT', 'pt-PT');
    expect(contentLanguageOf({ ...portugal })).toBeUndefined();
    expect(contentLanguageOf(fileOf('PT'))).toBeUndefined();
    expect(contentLanguageOf({ code: 'PT', name: 'Portugal' })).toBeUndefined();
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
    expect(holdingRuleSource(portugal)).toBe(ruleSource(portugal, 'holdingRule'));
    expect([ruleSource(FIXTURE, 'holdingRule'), ruleSource(FIXTURE, 'lotRule')]).toEqual([LAW, CIRCULAR]);
    expect(holdingRuleSource(FIXTURE)).toBe(LAW);
  });
});

describe('countryRules (docs/DOMAIN.md §4)', () => {
  it('gives the core what it reads, which the core’s own schema accepts', () => {
    for (const loaded of profiles) {
      const rules = countryRules(loaded);
      expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    }
  });

  it('carries what the core reads of a profile, and englishConfidence only where the profile states it', () => {
    expect(countryRules(FIXTURE)).toEqual(FIXTURE_RULES);
    const { englishConfidence: _, ...unstated } = FIXTURE;
    const { englishConfidence: __, ...rulesUnstated } = FIXTURE_RULES;
    const rules = countryRules(unstated);
    expect(rules).toEqual(rulesUnstated);
    expect('englishConfidence' in rules).toBe(false);
  });

  it('the generic profile carries the rules of docs/JURISDICTIONS.md \u00a72', () => {
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
      ...FIXTURE,
      holdingRule: { kind: 'years' as const, years: 1, effect: 'exempt' as const },
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

describe('the holding rule applied to the generic profile (docs/JURISDICTIONS.md §2)', () => {
  const statusIn = (code: string, bought: string) => {
    const rules = countryRules(profile(code));
    return holdingStatus(date(bought), rules.holdingRule, rules.holdingRuleOverrides);
  };

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
  // Literal names in the live order, since a review may rename a country: the picker sorts what it is given.
  const NAMES = [
    ['DE', 'Germany'],
    ['ES', 'Spain'],
    ['FR', 'France'],
    ['GB', 'United Kingdom'],
    ['IE', 'Ireland'],
    ['IT', 'Italy'],
    ['NL', 'Netherlands'],
    ['PT', 'Portugal'],
    ['US', 'United States'],
    ['XX', 'Other country'],
  ] as const;
  const named = NAMES.map(([code, name]) => ({ ...FIXTURE, code, name }));
  const codes = (suggestion: { country: string } | null) => countryChoices(named, suggestion).map((c) => c.code);

  it('puts the generic profile first when nothing is suggested, then the countries by name', () => {
    expect(countryChoices(named, null)).toEqual([
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

  it('lists only UTC, which the suggestion treats as no timezone', () => {
    expect(profile('XX').timezones).toEqual(['UTC']);
  });
});
