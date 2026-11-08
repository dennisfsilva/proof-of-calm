import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('FR');
if (profile === null) throw new Error('no profile FR');
const rules = CountryRulesSchema.parse(countryRules(profile));

describe("France's profile (docs/JURISDICTIONS.md §7.10)", () => {
  it('loads with the head fields of the design note', () => {
    expect([profile.code, profile.name, profile.currency, profile.locales]).toEqual(['FR', 'France', 'EUR', ['fr-FR']]);
    expect([profile.numberFormatLocale, profile.dateFormatLocale]).toEqual(['fr-FR', 'fr-FR']);
    expect(profile.timezones).toContain('Europe/Paris');
    expect(profile.taxYear).toEqual({ start: '01-01', end: '12-31' });
  });

  it('has no holding rule, no lot rule, and a portfolio-wide computation', () => {
    expect(rules.holdingRule).toEqual({ kind: 'none' });
    expect(rules.holdingRuleOverrides).toEqual([]);
    expect(rules.lotRule).toBe('unspecified');
    expect(rules.lotScope).toBe('global');
    expect(rules.computationModel).toEqual({ kind: 'portfolio-wide' });
    expect(rules.status.version).toBe(1);
  });

  it('answers "none" for the holding status of any purchase', () => {
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it('boots the shell on the generated rules file, which equals the rules mapped from the profile (ADR-0049)', async () => {
    expect(await loadRules('FR')).toEqual(rules);
  });

  it('backs every rule with a law or an authority', () => {
    for (const rule of Object.keys(profile.ruleSources) as (keyof typeof profile.ruleSources)[]) {
      const source = profile.sources.find((candidate) => candidate.key === profile.ruleSources[rule]);
      expect(ruleSource(profile, rule), rule).toBe(source?.url ?? null);
      expect(['law', 'authority'], rule).toContain(source?.kind);
    }
  });

  // The PR body's read table maps each card line to one of these keys; a source no line cites leaves the file.
  it('lists only the sources a card line or a pending change cites', () => {
    expect(profile.sources.map((source) => source.key).sort()).toEqual([
      'fr-bofip-pvbmc-30-10',
      'fr-bofip-pvbmc-30-20',
      'fr-bofip-pvbmc-30-30',
      'fr-cgi-art-150-vh-bis',
      'fr-dgfip-formulaire-2086',
      'fr-impots-faq-actifs-numeriques',
      'fr-lfss-2026-art-12',
      'fr-loi-2026-534',
    ]);
  });

  it('links the version of art. 150 VH bis in force (since 1 July 2026), not the 2019 text', () => {
    const article = profile.sources.find((source) => source.key === 'fr-cgi-art-150-vh-bis');
    expect(article?.url).toBe('https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050366751');
  });

  it('names in the reporting lines no fine, article or yearly term the reporting source (the FAQ) does not hold', () => {
    expect(profile.ruleSources.reporting).toBe('fr-impots-faq-actifs-numeriques');
    for (const line of profile.card.reporting) expect(line).not.toMatch(/art\. 1736|EUR \d|each year/);
  });

  // The FAQ holds 31,4 % = 12,8 % + 18,6 % and the 3CN option; the law behind validFrom and the earlier
  // rates live in docs/JURISDICTIONS.md §7.10, since the card links only the rates source.
  it('names in the rates note no law and no percentage the rates source (the FAQ) does not hold', () => {
    expect(profile.ruleSources.rates).toBe('fr-impots-faq-actifs-numeriques');
    const [rate] = profile.card.rates;
    const note = rate?.note ?? '';
    expect([rate?.value, rate?.validFrom]).toEqual(['31.4 %', '2025-01-01']);
    expect(note).not.toMatch(/loi|n°|art\./i);
    for (const percentage of note.match(/\d+(?:\.\d+)? %/g) ?? []) {
      expect(['12.8 %', '18.6 %', '31.4 %']).toContain(percentage);
    }
    expect(note).toMatch(/3CN/);
  });

  it("states the EUR 305 condition on the household's sale prices (BOFiP 30-10 §90)", () => {
    expect(profile.card.allowances[0]).toMatch(/household's sale prices/);
    expect(profile.card.summary60).toMatch(/your household's sales/);
    expect(profile.card.summary60.split(/\s+/).length).toBeLessThanOrEqual(60);
  });
});

describe('suggestCountry with France (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['fr-FR'], 'Europe/Paris', 'FR high'],
    [['fr-FR'], 'Indian/Reunion', 'FR high'],
    [['fr-CH'], 'Europe/Paris', 'FR medium'],
    [['en-US'], 'Europe/Paris', 'FR medium'],
    // Belgium has no profile: a region the profiles do not know is no evidence of another country.
    [['fr-BE'], 'Europe/Paris', 'FR medium'],
    [['de-DE'], 'Europe/Paris', 'FR low*'],
    [['fr-CH'], 'Europe/Zurich', null],
    [['fr-FR'], 'Europe/Monaco', null],
    [['fr'], null, 'FR low'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
