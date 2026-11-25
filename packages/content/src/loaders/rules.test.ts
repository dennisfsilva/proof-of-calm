import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CountryRulesSchema } from '@proofofcalm/core';
import { afterAll, describe, expect, it } from 'vitest';
import { LOCALES_FILE, renderLocales, renderRules, writeRules } from '../../scripts/rules.ts';
import { CONTENT_LANGUAGES, type OverlayLanguage } from '../i18n/overlay.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { COUNTRY_CODES, countryRules, loadProfile, PROFILE_OVERLAYS } from './countries.ts';
import { contentLanguageOf } from './language.ts';
import { loadRules, RULES_LANGUAGES } from './rules.ts';

// The generated rules files (ADR-0049): what the shell boots on in place of the profile. Each is the script's
// render of `countryRules` over the profile file, so a stale one fails here and names the command.

const RULES = fileURLToPath(new URL('../../rules/', import.meta.url));
const PROFILES = fileURLToPath(new URL('../../jurisdictions/', import.meta.url));
const STALE = 'stale rules file: run `pnpm --filter @proofofcalm/content rules` and commit the result';
const fileName = (code: string) => `${code.toLowerCase()}.json`;
// The script writes rules/<language>/ for each content language with profiles under i18n/<language>/jurisdictions
// (ADR-0057), over every profile code: a code without that language's profile file gets English's text there.
const I18N = fileURLToPath(new URL('../../i18n/', import.meta.url));
const I18N_LANGUAGES = readdirSync(I18N)
  .filter((name): name is OverlayLanguage => (CONTENT_LANGUAGES as readonly string[]).includes(name) && name !== 'en')
  .filter((name) => existsSync(join(I18N, name, 'jurisdictions')))
  .sort();
const profileFile = (code: string) =>
  JSON.parse(readFileSync(join(PROFILES, fileName(code)), 'utf8')) as CountryProfile;

describe('loadRules', () => {
  it("answers each profile's rules as countryRules maps them, valid against the core's schema", async () => {
    for (const code of COUNTRY_CODES) {
      const rules = await loadRules(code);
      const profile = await loadProfile(code);
      expect(profile).not.toBeNull();
      expect(rules).toEqual(countryRules(profile as CountryProfile));
      expect(CountryRulesSchema.parse(rules)).toEqual(rules);
    }
  });

  it('answers null for a country without a profile', async () => {
    expect(await loadRules('ZZ')).toBeNull();
    expect(await loadRules('pt')).toBeNull();
    expect(await loadRules('toString')).toBeNull();
  });
});

describe('packages/content/rules', () => {
  it('holds one file per profile code, the locales file and a folder per translated language, and no other', () => {
    const entries = readdirSync(RULES, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    expect(files.sort()).toEqual([...COUNTRY_CODES.map(fileName), LOCALES_FILE].sort());
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(folders.sort()).toEqual(I18N_LANGUAGES);
  });

  it.each(COUNTRY_CODES)('%s reads as the script renders its profile', (code) => {
    const text = readFileSync(join(RULES, fileName(code)), 'utf8');
    expect(text, STALE).toBe(renderRules(countryRules(profileFile(code))));
  });
});

describe('packages/content/rules/<language> (ADR-0057)', () => {
  it('has a folder, and a loadRules record, for each language with profiles under i18n/', () => {
    expect(I18N_LANGUAGES).toEqual(expect.arrayContaining(['pt-PT', 'de']));
    expect([...RULES_LANGUAGES].sort()).toEqual(I18N_LANGUAGES);
  });

  const cases = I18N_LANGUAGES.flatMap((language) => COUNTRY_CODES.map((code) => [language, code] as const));
  it.each(cases)('%s/%s reads as the script renders its translated profile', async (language, code) => {
    expect(readdirSync(join(RULES, language)).sort(), STALE).toEqual(COUNTRY_CODES.map(fileName).sort());
    const text = readFileSync(join(RULES, language, fileName(code)), 'utf8');
    expect(text, STALE).toBe(renderRules(countryRules((await loadProfile(code, language)) as CountryProfile)));
    expect(await loadRules(code, language)).toEqual(JSON.parse(text));
  });

  // The overlay read here, at test time: the translated file is English's but for the texts the overlay holds.
  const overlayFile = (language: string, code: string) =>
    JSON.parse(readFileSync(join(I18N, language, 'jurisdictions', fileName(code)), 'utf8')) as {
      name?: string;
      holdingRuleConditions?: (string | null)[];
      status?: { changeNotice?: string | null };
    };
  it.each([
    ['pt-PT', 'PT'],
    ['pt-PT', 'XX'],
    ['de', 'DE'],
    ['de', 'ES'],
    ['de', 'FR'],
    ['de', 'GB'],
    ['de', 'IE'],
    ['de', 'PT'],
    ['de', 'US'],
  ])("%s/%s is English's outside the name, the conditions and the change notice", (language, code) => {
    const english = countryRules(profileFile(code));
    const overlay = overlayFile(language, code);
    const translated = JSON.parse(readFileSync(join(RULES, language, fileName(code)), 'utf8'));
    const conditions = english.holdingRuleConditions.map(
      (text, index) => overlay.holdingRuleConditions?.[index] ?? text,
    );
    const changeNotice = overlay.status?.changeNotice ?? english.status.changeNotice;
    expect(translated).toEqual({
      ...english,
      name: overlay.name ?? english.name,
      holdingRuleConditions: conditions,
      status: { ...english.status, changeNotice },
    });
    // Each text the overlay translates reads differently from English's, one by one; a name may be the same word
    // in both languages (German's Portugal), so the name is held to the overlay's above and nothing more.
    english.holdingRuleConditions.forEach((text, index) => {
      if (typeof overlay.holdingRuleConditions?.[index] === 'string') expect(conditions[index]).not.toBe(text);
    });
    if (typeof overlay.status?.changeNotice === 'string') expect(changeNotice).not.toBe(english.status.changeNotice);
  });

  it("answers English's own file in English, and English's text marked English over a code without a translation", async () => {
    const english = await loadRules('PT');
    expect(await loadRules('PT', 'en')).toBe(english);
    for (const code of COUNTRY_CODES.filter((each) => PROFILE_OVERLAYS.de[each] === undefined)) {
      const rules = await loadRules(code, 'de');
      expect(rules, code).toEqual(await loadRules(code));
      expect(rules === null ? null : contentLanguageOf(rules), code).toBe('en');
    }
    expect(await loadRules('ZZ', 'pt-PT')).toBeNull();
  });

  it.each(['DE', 'US'])('gives %s in German the German conditions of its profile file, marked de', async (code) => {
    const rules = await loadRules(code, 'de');
    expect(rules?.holdingRuleConditions).toEqual(overlayFile('de', code).holdingRuleConditions);
    expect(rules?.holdingRuleConditions).not.toEqual((await loadRules(code))?.holdingRuleConditions);
    expect(rules === null ? null : contentLanguageOf(rules)).toBe('de');
  });

  it.each(['GB', 'IE'])('gives %s in German its German name, marked de', async (code) => {
    const rules = await loadRules(code, 'de');
    expect(rules?.name).toBe(overlayFile('de', code).name);
    expect(rules?.name).not.toBe((await loadRules(code))?.name);
    expect(rules === null ? null : contentLanguageOf(rules)).toBe('de');
  });

  // 26i's evaluator saw Portugal's English notice inside a German screen: the German file holds both texts.
  it('gives PT in German the German conditions and change notice of its profile file, marked de', async () => {
    const rules = await loadRules('PT', 'de');
    const english = await loadRules('PT');
    const overlay = overlayFile('de', 'PT');
    expect(rules?.holdingRuleConditions).toEqual(overlay.holdingRuleConditions);
    expect(rules?.holdingRuleConditions).not.toEqual(english?.holdingRuleConditions);
    expect(rules?.status.changeNotice).toBe(overlay.status?.changeNotice);
    expect(rules?.status.changeNotice).not.toBe(english?.status.changeNotice);
    expect(rules === null ? null : contentLanguageOf(rules)).toBe('de');
  });

  // Spain and France hold no condition and no notice, so their German files differ from English's by the name.
  it.each(['ES', 'FR'])('gives %s in German the German name of its profile file, marked de', async (code) => {
    const rules = await loadRules(code, 'de');
    expect(rules?.name).toBe(overlayFile('de', code).name);
    expect(rules?.name).not.toBe((await loadRules(code))?.name);
    expect(rules === null ? null : contentLanguageOf(rules)).toBe('de');
  });
});

describe('contentLanguageOf over the rules (ADR-0057, Corrections of 2026-11-16)', () => {
  it("gives a translated profile's rules its language, and English rules English, whatever their folder", async () => {
    for (const language of ['pt-PT', 'de'] as const) {
      const translated = new Set(Object.keys(PROFILE_OVERLAYS[language]));
      for (const code of COUNTRY_CODES) {
        const rules = await loadRules(code, language);
        expect(rules === null ? null : contentLanguageOf(rules)).toBe(translated.has(code) ? language : 'en');
        const english = await loadRules(code);
        expect(english === null ? null : contentLanguageOf(english)).toBe('en');
      }
    }
  });

  it('gives nothing for a copy of the rules', async () => {
    const rules = await loadRules('PT', 'pt-PT');
    expect(contentLanguageOf({ ...rules })).toBeUndefined();
  });
});

describe('renderRules', () => {
  it('indents by two spaces, keeps a short string array on one line and ends with a newline', () => {
    expect(renderRules({ a: ['x', 'y'], b: { c: 1, d: null }, e: [] })).toBe(
      '{\n  "a": ["x", "y"],\n  "b": {\n    "c": 1,\n    "d": null\n  },\n  "e": []\n}\n',
    );
  });

  it('breaks a long string array and an array of objects onto their own lines', () => {
    const long = ['a'.repeat(60), 'b'.repeat(60)];
    expect(renderRules({ long })).toBe(`{\n  "long": [\n    "${long[0]}",\n    "${long[1]}"\n  ]\n}\n`);
    expect(renderRules([{ k: 'v' }])).toBe('[\n  {\n    "k": "v"\n  }\n]\n');
  });

  it('parses back to the value it was given, for every profile', () => {
    for (const code of COUNTRY_CODES) {
      const rules = countryRules(profileFile(code));
      expect(JSON.parse(renderRules(rules))).toEqual(rules);
    }
  });
});

describe('writeRules (scripts/rules.ts)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'content-rules-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes one rules file per profile and removes a rules file with no profile', () => {
    const profiles = join(dir, 'jurisdictions');
    const rules = join(dir, 'rules');
    mkdirSync(profiles, { recursive: true });
    writeFileSync(join(profiles, 'pt.json'), readFileSync(join(PROFILES, 'pt.json')));
    expect(() => readdirSync(rules)).toThrow();
    expect(writeRules({ profiles, rules })).toEqual({ written: ['pt.json', LOCALES_FILE], removed: [] });
    expect(readFileSync(join(rules, 'pt.json'), 'utf8')).toBe(renderRules(countryRules(profileFile('PT'))));
    expect(readFileSync(join(rules, LOCALES_FILE), 'utf8')).toBe(renderLocales([profileFile('PT')]));

    writeFileSync(join(rules, 'zz.json'), '{}\n');
    writeFileSync(join(rules, 'notes.txt'), 'kept');
    expect(writeRules({ profiles, rules })).toEqual({ written: ['pt.json', LOCALES_FILE], removed: ['zz.json'] });
    expect(readdirSync(rules).sort()).toEqual([LOCALES_FILE, 'notes.txt', 'pt.json']);
  });

  it("writes a language's rules over its translation, the numbers and dates English's, and no locales file", () => {
    const profiles = join(dir, 'jurisdictions');
    const overlays = join(dir, 'i18n', 'pt-PT', 'jurisdictions');
    const rules = join(dir, 'rules', 'pt-PT');
    mkdirSync(overlays, { recursive: true });
    const overlay = { name: 'Portugal (pt)', holdingRule: { days: 1 }, status: { changedOn: '2020-01-01' } };
    writeFileSync(join(overlays, 'pt.json'), JSON.stringify(overlay));
    expect(writeRules({ profiles, rules, overlays })).toEqual({ written: ['pt.json'], removed: [] });
    const english = countryRules(profileFile('PT'));
    expect(JSON.parse(readFileSync(join(rules, 'pt.json'), 'utf8'))).toEqual({ ...english, name: 'Portugal (pt)' });
    expect(readdirSync(rules)).toEqual(['pt.json']);
  });

  it('refuses a profile whose code is not two capitals and writes nothing outside the rules folder', () => {
    const outside = join(dir, 'outside');
    const profiles = join(outside, 'jurisdictions');
    const rules = join(outside, 'out', 'rules');
    mkdirSync(profiles, { recursive: true });
    const escaped = { ...profileFile('PT'), code: '../escaped' };
    writeFileSync(join(profiles, 'pt.json'), `${JSON.stringify(escaped, null, 2)}\n`);
    expect(() => writeRules({ profiles, rules })).toThrow(/pt\.json is not a country profile/);
    expect(readdirSync(join(outside, 'out'))).toEqual(['rules']);
    expect(readdirSync(rules)).toEqual([]);
    expect(readdirSync(outside).sort()).toEqual(['jurisdictions', 'out']);
  });
});
