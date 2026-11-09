// Ireland's profile (docs/JURISDICTIONS.md §7.3): what the core reads of it, the holding status of a buy, the
// source each rule links to, the split-rate year of 2026 and the suggestion rows of §3 that name IE.
import { CountryRulesSchema, holdingStatus, suggestCountry } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { countryRules, loadProfiles, ruleSource, suggestionProfiles } from '../loaders/countries.ts';
import { loadRules } from '../loaders/rules.ts';

const profiles = await loadProfiles();
const ireland = (() => {
  const found = profiles.find((profile) => profile.code === 'IE');
  if (found === undefined) throw new Error('no profile IE');
  return found;
})();
const rules = countryRules(ireland);

describe('Ireland (docs/JURISDICTIONS.md §7.3)', () => {
  it('gives the core what it reads, which the core’s own schema accepts', () => {
    expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    expect(rules).toMatchObject({
      code: 'IE',
      name: 'Ireland',
      currency: 'EUR',
      locales: ['en-IE', 'ga-IE'],
      numberFormatLocale: 'en-IE',
      dateFormatLocale: 'en-IE',
      timezones: ['Europe/Dublin'],
      taxYear: { start: '01-01', end: '12-31' },
      computationModel: { kind: 'per-lot' },
      holdingRule: { kind: 'none' },
      holdingRuleOverrides: [],
      holdingRuleConditions: [],
      lotRule: 'fifo',
      lotScope: 'global',
      status: { version: 1, changedOn: '2026-10-07', changeNotice: null },
    });
    expect('englishConfidence' in rules).toBe(false);
  });

  it('boots the shell on the generated rules file, equal to the profile’s rules (ADR-0049)', async () => {
    expect(await loadRules('IE')).toEqual(rules);
  });

  it('no holding rule, so a unit bought on 2026-03-15 is never labelled "tax-free from"', () => {
    expect(holdingStatus(date('2026-03-15'), rules.holdingRule, rules.holdingRuleOverrides)).toEqual({ kind: 'none' });
  });

  it('links every rule to a law or an authority', () => {
    for (const rule of ['holdingRule', 'lotRule', 'rates', 'losses', 'reporting'] as const) {
      const source = ireland.sources.find((candidate) => candidate.key === ireland.ruleSources[rule]);
      expect(source?.kind, rule).toMatch(/^(law|authority)$/);
      expect(ruleSource(ireland, rule)).toBe(source?.url);
    }
  });

  it('cites the Bill’s stage from the Dáil record of 20 October 2026 in the pending change alone (§2: sources back card lines)', () => {
    const record = 'https://data.oireachtas.ie/akn/ie/debateRecord/dail/2026-10-20/debate/mul@/main.xml';
    expect(ireland.pendingChanges[0]?.source.url).toBe(record);
    expect(ireland.sources.map((source) => source.url)).not.toContain(record);
  });

  it('states the three forms of the return as separate sentences, the date first', () => {
    const sentences = ireland.card.reporting[0]?.split('. ') ?? [];
    expect(sentences[0]).toBe('File by 31 October of the year after the disposal');
    expect(sentences.length).toBeGreaterThanOrEqual(3);
  });

  it('splits 2026 by disposal date: 33 % from 6 December 2012 to 6 October 2026, 31 % from 7 October 2026', () => {
    const rates = ireland.card.rates.map(({ value, validFrom, validTo }) => ({ value, validFrom, validTo }));
    expect(rates).toContainEqual({ value: '31%', validFrom: '2026-10-07', validTo: null });
    // Finance Act 2013 s. 43(2): 33 % "applies to disposals made on or after 6 December 2012"; Revenue's table prints 2021.
    expect(rates).toContainEqual({ value: '33%', validFrom: '2012-12-06', validTo: '2026-10-06' });
  });
});

describe('suggestCountry with Ireland among the profiles (docs/JURISDICTIONS.md §3)', () => {
  const suggest = (languages: string[], timeZone: string | null) => {
    const suggestion = suggestCountry({ languages, timeZone }, suggestionProfiles(profiles));
    return suggestion === null
      ? null
      : `${suggestion.country} ${suggestion.confidence}${suggestion.languageDiffers ? '*' : ''}`;
  };

  it.each([
    [['en-IE'], 'Europe/Dublin', 'IE high'],
    [['ga-IE'], 'Europe/Dublin', 'IE high'],
    [['en-GB'], 'Europe/Dublin', 'IE medium'],
    [['en'], 'Europe/Dublin', 'IE medium'],
    [['en-IE'], null, 'IE low'],
    // London is the United Kingdom's timezone and English one of its languages: the table's row reads "GB medium".
    [['en-IE'], 'Europe/London', 'GB medium'],
  ])('%j in %s suggests %s', (languages, timeZone, expected) => {
    expect(suggest(languages, timeZone)).toBe(expected);
  });
});
