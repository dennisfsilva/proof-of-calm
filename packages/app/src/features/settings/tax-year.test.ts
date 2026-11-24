import { COUNTRY_CODES, countryRules, loadProfile, loadProfiles } from '@proofofcalm/content';
import { type CalendarDate, type CountryCode, type Entry, type Plan, taxYearEndingIn } from '@proofofcalm/core';
import { createTranslator } from 'use-intl/core';
import { describe, expect, it, vi } from 'vitest';
import { headerTexts } from '../../../../content/src/header-validate.ts';
import type { Snapshot } from '../../lib/ports';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../lib/services/testing';
import germanCountries from '../../messages/de/countries.json';
import german from '../../messages/de/settings.json';
import englishCountries from '../../messages/en/countries.json';
import english from '../../messages/en/settings.json';
import portugueseCountries from '../../messages/pt-PT/countries.json';
import portuguese from '../../messages/pt-PT/settings.json';
import { downloadTaxYear, HEADER_LANGUAGES } from './tax-year';

// D10 (docs/DOMAIN.md §3.13): the tax-year file's header lines follow the UI language, and none holds a `;`, the
// list separator a spreadsheet in a comma-decimal locale splits a cell on. A line is a message of
// `settings.data.taxYear.file`, filled with the country's name, its sources, dates, counts and codes, or one of the
// English profile's texts (the lot note, the holding rule's conditions). packages/content refuses a `;` in every
// profile text `headerTexts` names (`header-semicolon`); the drift case below keeps that list the header's.

vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

await preloadLazyModules();

const LANGUAGES = { en: english, 'pt-PT': portuguese, de: german } as const;
const COUNTRIES = { en: englishCountries, 'pt-PT': portugueseCountries, de: germanCountries } as const;
type Language = keyof typeof LANGUAGES;
const LANGUAGE_TAGS = Object.keys(LANGUAGES) as Language[];

/** A header line as the file holds it, one `textCell`, back to its text. */
const uncell = (line: string) => (line.startsWith('"') ? line.slice(1, -1).replaceAll('""', '"') : line);
const FILE = 'settings.data.taxYear.file';

/** Every string of a message tree or a profile, each ICU branch inside its source text. */
const strings = (tree: unknown): string[] => {
  if (typeof tree === 'string') return [tree];
  return typeof tree === 'object' && tree !== null ? Object.values(tree).flatMap(strings) : [];
};

const rules = async (code: CountryCode) => {
  const profile = await loadProfile(code);
  return profile === null ? null : countryRules(profile);
};

/** The fixture in `country`, with a one-tap entry and a held entry with no cost, so the flagged lines are written. */
function flagged(country: string): Snapshot {
  const snapshot = fixtureSnapshot();
  const first = snapshot.entries[0] as Entry;
  return {
    ...snapshot,
    plan: { ...(snapshot.plan as Plan), country: country as Plan['country'] },
    entries: [
      ...snapshot.entries.map((each, index) => (index === 1 ? { ...each, source: 'one-tap' as const } : each)),
      {
        ...first,
        id: 'b0000000-0000-4000-8000-000000000002' as Entry['id'],
        kind: 'held',
        date: '2026-02-01' as CalendarDate,
        units: '0.01' as Entry['units'],
        amount: null,
      },
    ],
  };
}

/**
 * The header of the running year's file of `country` on a screen in `language`, its words in `words` (the screen's
 * own, or English's where a language's messages write no header).
 */
async function header(country: CountryCode, language: Language, words: Language = language): Promise<string> {
  const snapshot = flagged(country);
  const platform = recordingPlatform();
  const services = createTestServices({ snapshot, platform, rules, language });
  await services.start();
  await vi.waitFor(() => expect(services.ui.getState().rules?.country).toBe(country));
  const loaded = services.ui.getState().rules?.rules;
  if (loaded === undefined || loaded === null) throw new Error(`no rules for ${country}`);
  const t = {
    file: createTranslator({ locale: words, messages: { settings: LANGUAGES[words] }, namespace: FILE }),
    countries: createTranslator({
      locale: language,
      messages: { countries: COUNTRIES[language] },
      namespace: 'countries',
    }),
    language: words,
  };
  const endingIn = taxYearEndingIn(services.ui.getState().today, loaded.taxYear);
  const plan = { plan: snapshot.plan as Plan, entries: snapshot.entries };
  await downloadTaxYear(services, plan, endingIn, t);
  const content = platform.calls.downloads[0]?.content ?? '';
  return content.slice(0, content.indexOf('\n\n'));
}

describe('the tax-year header lines', () => {
  it.each(LANGUAGE_TAGS)('hold no ";" in any %s message or branch', (language) => {
    const file = LANGUAGES[language].data.taxYear.file;
    expect(strings(file).filter((text) => text.includes(';'))).toEqual([]);
  });

  it.each(COUNTRY_CODES)(
    "%s's English header copies no profile text but the ones packages/content checks for a ';'",
    async (code) => {
      const profile = (await loadProfiles('en')).find((each) => each.code === code);
      if (profile === undefined) throw new Error(`no ${code} profile`);
      const checked = headerTexts(profile).map(([, text]) => text);
      const lines = (await header(code, 'en')).split('\n').map(uncell);
      // A line the profile's prose fills, or a URL among the review line's words. Dates, codes and keys, which the
      // schema shapes, hold no space and cannot hold a `;`.
      const pieces = new Set([...lines, ...lines.flatMap((line) => line.split(/,? /))]);
      const copied = strings(profile).filter(
        (text) => (text.includes(' ') || text.startsWith('https://')) && pieces.has(text),
      );
      expect(copied.length).toBeGreaterThan(0);
      expect(copied.filter((text) => !checked.includes(text))).toEqual([]);
    },
  );

  it.each(COUNTRY_CODES.flatMap((code) => LANGUAGE_TAGS.map((language) => [code, language] as const)))(
    '%s\'s file in %s opens with header lines, none holding a ";"',
    async (code, language) => {
      const lines = (await header(code, language)).split('\n').map(uncell);
      expect(lines.length).toBeGreaterThan(5);
      expect(lines.filter((line) => line.includes(';'))).toEqual([]);
    },
  );

  // English names the country by its `for` form (docs/CONTENT-STYLE.md §3, the Tax-year file header row), as pt-PT
  // does, so "the Netherlands" and "the United States" keep their article; the title keeps the bare name as a label.
  it('the English lines name the country with its article: the review, holding and plan-rule lines', async () => {
    const dutch = (await header('NL', 'en')).split('\n').map(uncell);
    // The saved file opens with a byte order mark before the title.
    expect(dutch[0]).toMatch(/^﻿Proof of Calm tax-year file · Netherlands · /u);
    expect(dutch[3]).toMatch(/^Rules for the Netherlands reviewed on \d{4}-\d{2}-\d{2} · general information/u);
    const british = (await header('GB', 'en')).split('\n').map(uncell);
    expect(british[3]).toMatch(/^Rules for the United Kingdom reviewed on /u);
    const american = (await header('US', 'en')).split('\n').map(uncell);
    expect(american[3]).toMatch(/^Rules for the United States reviewed on /u);
    expect(american).toContain(
      'eligible_from: the first day past the holding rule for the United States (1 year). Computed from your dates, not tax advice.',
    );
    expect(american).toContain('Your plan uses its own holding rule. This file uses the rule for the United States.');
  });

  // German names the country by its `for` form too (`für die Niederlande`, `für das Vereinigte Königreich`), and
  // dates each review with `Stand:`, never `geprüft` (docs/CONTENT-STYLE.md §10).
  it('the German lines name the country by its for form: the review, holding and plan-rule lines', async () => {
    const dutch = (await header('NL', 'de')).split('\n').map(uncell);
    expect(dutch[0]).toMatch(/^﻿Datei für das Steuerjahr von Proof of Calm · Niederlande · /u);
    expect(dutch[3]).toMatch(
      /^Regeln für die Niederlande, Stand: \d{4}-\d{2}-\d{2} · allgemeine Informationen, keine Beratung/u,
    );
    const british = (await header('GB', 'de')).split('\n').map(uncell);
    expect(british[0]).toBe(
      '﻿Datei für das Steuerjahr von Proof of Calm · Vereinigtes Königreich · 2026-04-06 bis 2027-04-05',
    );
    expect(british[3]).toMatch(/^Regeln für das Vereinigte Königreich, Stand: /u);
    const portugal = (await header('PT', 'de')).split('\n').map(uncell);
    expect(portugal[3]).toMatch(/^Regeln für Portugal, Stand: /u);
    expect(portugal).toContainEqual(
      expect.stringMatching(/^eligible_from: der erste Tag nach der Haltefrist für Portugal \(365 Tage\)\. /u),
    );
    const germany = (await header('DE', 'de')).split('\n').map(uncell);
    expect(germany).toContain(
      'eligible_from: der erste Tag nach der Haltefrist für Deutschland (1 Jahr). past_holding_rule: ob dieser Tag bis zum Verkauf erreicht war, bei Einheiten im Bestand bis zum 2026-10-20. Aus Ihren Einträgen berechnet, keine Steuerberatung.',
    );
    expect(germany).toContain('Ihr Plan hat eine eigene Regel. Diese Datei verwendet die Haltefrist für Deutschland.');
    // France has no holding period (`kind: none`), so no line of its file names one.
    const french = (await header('FR', 'de')).split('\n').map(uncell);
    expect(french[3]).toMatch(/^Regeln für Frankreich, Stand: /u);
    expect(french.filter((line) => line.includes('Haltefrist'))).toEqual([]);
  });

  // The guard: a header's country forms come from the language of its words. A screen whose language writes no
  // header of its own gets English's words, and with them English's forms, never „für Deutschland“ in an English line.
  it('a header in English words on a German screen takes the English country forms', async () => {
    const lines = (await header('DE', 'de', 'en')).split('\n').map(uncell);
    expect(lines[0]).toMatch(/^﻿Proof of Calm tax-year file · Germany · /u);
    expect(lines[3]).toMatch(/^Rules for Germany reviewed on /u);
    expect(lines).toContain('Your plan uses its own holding rule. This file uses the rule for Germany.');
    expect(lines).toContainEqual(
      expect.stringMatching(/^eligible_from: the first day past the holding rule for Germany \(1 year\)\. /u),
    );
  });

  it('are written in the languages whose settings messages hold the whole file block', () => {
    const own = import.meta.glob<{ data?: { taxYear?: { file?: object } } }>('./messages/*.json', {
      eager: true,
      import: 'default',
    });
    const keys = Object.keys(english.data.taxYear.file).sort();
    const whole = Object.entries(own)
      .filter(
        ([, tree]) =>
          Object.keys(tree.data?.taxYear?.file ?? {})
            .sort()
            .join() === keys.join(),
      )
      .map(([path]) => /([^/]+)\.json$/u.exec(path)?.[1] ?? '');
    expect([...HEADER_LANGUAGES].sort()).toEqual(whole.sort());
  });

  it("PT's pt-PT file holds the pt-PT profile's lot note on line 6 and its conditions from line 8, none with a ';'", async () => {
    // The profile in pt-PT, its overlay over English (ADR-0057): a review may change the texts and their count.
    const portugal = await loadProfile('PT', 'pt-PT');
    if (portugal === null) throw new Error('no PT profile');
    const lines = (await header('PT', 'pt-PT')).split('\n').map(uncell);
    const translated = [lines[5], ...lines.slice(7, 7 + portugal.holdingRuleConditions.length)];
    expect(translated).toEqual([portugal.lotRuleNote, ...portugal.holdingRuleConditions]);
    expect(translated.filter((line) => line?.includes(';'))).toEqual([]);
  });
});
