import { COUNTRY_CODES, countryRules, loadProfile, loadProfiles } from '@proofofcalm/content';
import { type CalendarDate, type CountryCode, type Entry, type Plan, taxYearEndingIn } from '@proofofcalm/core';
import { createTranslator } from 'use-intl/core';
import { describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../lib/ports';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../lib/services/testing';
import english from '../../messages/en/settings.json';
import portuguese from '../../messages/pt-PT/settings.json';
import { downloadTaxYear } from './tax-year';

// D10 (docs/DOMAIN.md §3.13): the tax-year file's header lines follow the UI language, and none holds a `;`, the
// list separator a spreadsheet in a comma-decimal locale splits a cell on. A line is a message of
// `settings.data.taxYear.file`, filled with the country's name, its sources, dates, counts and codes, or one of the
// English profile's texts (the lot note, the holding rule's conditions).

vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

await preloadLazyModules();

const LANGUAGES = { en: english, 'pt-PT': portuguese } as const;

/**
 * The English profile texts that hold a `;` on 2026-11-16: Germany's lot note, the US lot note and two of its
 * conditions, the general profile's lot note. Their wording is packages/content's, outside the app's words; listed so
 * that a new one fails here and a reworded one leaves the list.
 */
const PROFILE_SEMICOLONS = [
  'Federal rate only. Most states tax the gain at their own rates (42 levy an income tax; Tax Foundation, 2026; medium confidence). Confirm your state.',
  "Gifted units keep the giver's holding period when records show it; inherited units are long-term at once (IRS FAQ Q33; IRS Publication 544).",
  'Not reviewed for your country; the app matches sales to purchases first in, first out per coin.',
  'Per wallet: the BMF accepts first in, first out or individual identification, elected per wallet and per crypto-asset and applied consistently; average cost is the fallback (medium-high confidence).',
  'You choose which units you sold when your records identify them and what they cost, kept per account, wallet, or address; otherwise first in, first out (IRS FAQ Q39 to Q41).',
];

/** A header line as the file holds it, one `textCell`, back to its text. */
const uncell = (line: string) => (line.startsWith('"') ? line.slice(1, -1).replaceAll('""', '"') : line);
const FILE = 'settings.data.taxYear.file';

/** Every string of a message tree, each ICU branch inside its source text. */
const strings = (tree: unknown): string[] =>
  typeof tree === 'string' ? [tree] : Object.values(tree as Record<string, unknown>).flatMap(strings);

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
async function header(country: CountryCode, language: keyof typeof LANGUAGES): Promise<string> {
  const snapshot = flagged(country);
  const platform = recordingPlatform();
  const services = createTestServices({ snapshot, platform, rules });
  await services.start();
  await vi.waitFor(() => expect(services.ui.getState().rules?.country).toBe(country));
  const loaded = services.ui.getState().rules?.rules;
  if (loaded === undefined) throw new Error(`no rules for ${country}`);
  const t = createTranslator({ locale: language, messages: { settings: LANGUAGES[language] }, namespace: FILE });
  const endingIn = taxYearEndingIn(services.ui.getState().today, loaded.taxYear);
  const plan = { plan: snapshot.plan as Plan, entries: snapshot.entries };
  await downloadTaxYear(services, plan, endingIn, t);
  const content = platform.calls.downloads[0]?.content ?? '';
  return content.slice(0, content.indexOf('\n\n'));
}

describe('the tax-year header lines', () => {
  it.each(Object.keys(LANGUAGES))('hold no ";" in any %s message or branch', (language) => {
    const file = LANGUAGES[language as keyof typeof LANGUAGES].data.taxYear.file;
    expect(strings(file).filter((text) => text.includes(';'))).toEqual([]);
  });

  it("hold a \";\" in no country's English name, lot note, condition or source but the listed ones", async () => {
    const texts = (await loadProfiles('en')).flatMap((profile) => [
      profile.name,
      profile.lotRuleNote,
      ...profile.holdingRuleConditions,
      ...strings(profile.ruleSources),
    ]);
    expect(texts.length).toBeGreaterThan(COUNTRY_CODES.length * 2);
    expect(texts.filter((text) => text.includes(';')).sort()).toEqual(PROFILE_SEMICOLONS);
  });

  it.each(COUNTRY_CODES.flatMap((code) => Object.keys(LANGUAGES).map((language) => [code, language] as const)))(
    "%s's file in %s opens with header lines, a \";\" only in a listed profile text",
    async (code, language) => {
      const lines = (await header(code, language)).split('\n').map(uncell);
      expect(lines.length).toBeGreaterThan(5);
      expect(lines.filter((line) => line.includes(';') && !PROFILE_SEMICOLONS.includes(line))).toEqual([]);
    },
  );
});
