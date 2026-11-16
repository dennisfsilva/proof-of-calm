import { COUNTRY_CODES, countryRules, loadProfile, loadProfiles } from '@proofofcalm/content';
import { type CalendarDate, type CountryCode, type Entry, type Plan, taxYearEndingIn } from '@proofofcalm/core';
import { createTranslator } from 'use-intl/core';
import { describe, expect, it, vi } from 'vitest';
import { headerTexts } from '../../../../content/src/header-validate.ts';
import type { Snapshot } from '../../lib/ports';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../lib/services/testing';
import english from '../../messages/en/settings.json';
import portuguese from '../../messages/pt-PT/settings.json';
import { downloadTaxYear } from './tax-year';

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

const LANGUAGES = { en: english, 'pt-PT': portuguese } as const;
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

/** The header of the running year's file of `country`, worded in `language`. */
async function header(country: CountryCode, language: Language): Promise<string> {
  const snapshot = flagged(country);
  const platform = recordingPlatform();
  const services = createTestServices({ snapshot, platform, rules });
  await services.start();
  await vi.waitFor(() => expect(services.ui.getState().rules?.country).toBe(country));
  const loaded = services.ui.getState().rules?.rules;
  if (loaded === undefined || loaded === null) throw new Error(`no rules for ${country}`);
  const t = createTranslator({ locale: language, messages: { settings: LANGUAGES[language] }, namespace: FILE });
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
});
