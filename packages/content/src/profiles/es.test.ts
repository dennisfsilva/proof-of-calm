import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfile, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const profile = await loadProfile('ES');
if (profile === null) throw new Error('no profile ES');
const rules = CountryRulesSchema.parse(countryRules(profile));

describe('Spain (docs/JURISDICTIONS.md §7.9)', () => {
  it('has no holding rule, FIFO across venues and a per-lot computation', () => {
    expect(rules).toMatchObject({
      currency: 'EUR',
      holdingRule: { kind: 'none' },
      lotRule: 'fifo',
      lotScope: 'global',
      computationModel: { kind: 'per-lot' },
      status: { version: 1 },
    });
    expect(profile.holdingRuleOverrides).toEqual([]);
    expect(profile.holdingRuleConditions).toEqual([]);
  });

  it('ships the same rules in its generated rules file (ADR-0049)', async () => {
    expect(await loadRules('ES')).toEqual(countryRules(profile));
  });

  it('labels nothing "tax-free from": a unit bought on 2026-03-15 is taxable whenever it is sold', () => {
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it('backs every rule with a law or an authority source', () => {
    const keys = Object.keys(profile.ruleSources) as (keyof typeof profile.ruleSources)[];
    expect(keys).toEqual(['holdingRule', 'lotRule', 'rates', 'losses', 'reporting']);
    for (const key of keys) {
      const url = ruleSource(profile, key);
      expect(url, key).not.toBeNull();
      const source = profile.sources.find((candidate) => candidate.url === url);
      expect(['law', 'authority'], key).toContain(source?.kind);
    }
  });

  it('records the date each AEAT and BOE page states, the Modelo 721 deadlines page included', () => {
    expect(profile.sources.map((source) => source.published)).not.toContain(null);
    expect(profile.sources.find((source) => source.key === 'es-aeat-721-plazos')?.published).toBe('2026-09-08');
  });

  // JURISDICTIONS §2 keeps pendingChanges for rule changes; the election of 29 November 2026 is a caveat.
  it('rests the own-wallet-transfer line on art. 33.1 LIRPF and holds no pending rule change', () => {
    const transfer = profile.card.taxableEvents.find((event) => event.event === 'own-wallet-transfer');
    expect(transfer?.note).toContain('(art. 33.1 LIRPF)');
    expect(transfer?.note).not.toContain('nothing to declare');
    expect(profile.pendingChanges).toEqual([]);
    expect(profile.card.caveats).toContain('What changes after the election of 29 November 2026.');
  });

  // Art. 36 LIRPF takes the ISD value "sin que puedan exceder del valor de mercado": the line carries the cap.
  it('caps the gift value at market value and keeps arts. 33.5.c and 6.4 within the note', () => {
    const gift = profile.card.taxableEvents.find((event) => event.event === 'gift-or-inheritance');
    expect(gift?.note).toContain('at most market value (art. 36 LIRPF)');
    expect(gift?.note).toContain('(art. 33.5.c)');
    expect(gift?.note).toContain('(IRPF, art. 6.4)');
  });

  // CONTENT-STYLE §1 rule 4 (a sentence keeps its verb) and §4 (numerals for everything in English prose).
  it('files the Renta return in a full sentence and counts the carry-forward years in numerals', () => {
    expect(profile.filingNote).toContain('for 2025 is filed from 8 April to 30 June 2026');
    expect(profile.card.losses).toContain('carries forward 4 years');
    expect(profile.card.summary60).toContain('carry forward 4 years');
    expect(`${profile.card.losses} ${profile.card.summary60}`).not.toContain('four years');
  });

  it('was reviewed by the owner on 5 November 2026 with a single savings-base rate row', () => {
    expect(profile.status).toMatchObject({ reviewedBy: 'owner', lastReviewed: '2026-11-05', confidence: 'high' });
    expect(profile.card.rates.map((rate) => rate.label)).toEqual(['Savings-base scale']);
    expect(profile.card.summary60.split(/\s+/)).toHaveLength(60);
  });
});

describe('suggestCountry with Spain among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['es-ES'], 'Europe/Madrid', 'ES high'],
    [['ca-ES'], 'Europe/Madrid', 'ES high'],
    [['es-ES'], 'Atlantic/Canary', 'ES high'],
    [['es-MX'], 'Europe/Madrid', 'ES medium'],
    [['de-DE'], 'Europe/Madrid', 'ES low*'],
    [['es-MX'], 'America/Mexico_City', null],
    [['es-ES'], 'Europe/Andorra', null],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
