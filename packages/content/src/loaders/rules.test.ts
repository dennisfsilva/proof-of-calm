import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CountryRulesSchema } from '@proofofcalm/core';
import { afterAll, describe, expect, it } from 'vitest';
import { renderRules, writeRules } from '../../scripts/rules.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { COUNTRY_CODES, countryRules, loadProfile } from './countries.ts';
import { loadRules } from './rules.ts';

// The generated rules files (ADR-0049): what the shell boots on in place of the profile. Each is the script's
// render of `countryRules` over the profile file, so a stale one fails here and names the command.

const RULES = fileURLToPath(new URL('../../rules/', import.meta.url));
const PROFILES = fileURLToPath(new URL('../../jurisdictions/', import.meta.url));
const STALE = 'stale rules file: run `pnpm --filter @proofofcalm/content rules` and commit the result';
const fileName = (code: string) => `${code.toLowerCase()}.json`;
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
  it('holds one file per profile code and no other', () => {
    expect(readdirSync(RULES).sort()).toEqual(COUNTRY_CODES.map(fileName).sort());
  });

  it.each(COUNTRY_CODES)('%s reads as the script renders its profile', (code) => {
    const text = readFileSync(join(RULES, fileName(code)), 'utf8');
    expect(text, STALE).toBe(renderRules(countryRules(profileFile(code))));
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
    expect(writeRules({ profiles, rules })).toEqual({ written: ['pt.json'], removed: [] });
    expect(readFileSync(join(rules, 'pt.json'), 'utf8')).toBe(renderRules(countryRules(profileFile('PT'))));

    writeFileSync(join(rules, 'zz.json'), '{}\n');
    writeFileSync(join(rules, 'notes.txt'), 'kept');
    expect(writeRules({ profiles, rules })).toEqual({ written: ['pt.json'], removed: ['zz.json'] });
    expect(readdirSync(rules).sort()).toEqual(['notes.txt', 'pt.json']);
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
