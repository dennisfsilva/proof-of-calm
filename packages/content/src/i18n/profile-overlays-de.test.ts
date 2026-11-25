import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import allowList from '../../sources.allow.json' with { type: 'json' };
import { headerTexts } from '../header-validate.ts';
import { COUNTRY_CODES, loadProfile, PROFILE_OVERLAYS } from '../loaders/countries.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { type ContentFile, validateContent } from '../validate.ts';
import { isRecord, isTranslatable, type Segment } from './overlay.ts';

// D1 of ADR-0057's Corrections of 2026-11-25: a German profile overlay is whole. Its profile is marked `de` as a
// whole object (`contentLanguageOf`), so every text it can translate is German: an English string left at a
// translatable path would show in German markup. The codes come from PROFILE_OVERLAYS.de, so each later file joins
// these cases with its registry line alone.

const { $comment: _, ...allow } = allowList;
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string): ContentFile => ({ path, json: JSON.parse(readFileSync(`${ROOT}${path}`, 'utf8')) });
const englishOf = (code: string) => read(`packages/content/jurisdictions/${code.toLowerCase()}.json`);
const overlayOf = (code: string) => read(`packages/content/i18n/de/jurisdictions/${code.toLowerCase()}.json`);
const CODES = COUNTRY_CODES.filter((code) => PROFILE_OVERLAYS.de[code] !== undefined);

/** Each translatable path where the English file holds a string and the overlay none (`card.caveats.3`). */
function missingTexts(english: unknown, overlay: unknown, at: readonly Segment[] = []): string[] {
  if (typeof english === 'string')
    return isTranslatable('jurisdiction', at) && typeof overlay !== 'string' ? [at.join('.')] : [];
  if (Array.isArray(english))
    return english.flatMap((item, index) =>
      missingTexts(item, Array.isArray(overlay) ? overlay[index] : undefined, [...at, index]),
    );
  if (!isRecord(english)) return [];
  return Object.entries(english).flatMap(([key, value]) =>
    missingTexts(value, isRecord(overlay) ? overlay[key] : undefined, [...at, key]),
  );
}

describe('the German profile overlays', () => {
  it('start with Germany’s', () => {
    expect(CODES).toContain('DE');
  });

  it.each(CODES)("%s's overlay holds a German string at every translatable path its English file holds", (code) => {
    expect(missingTexts(englishOf(code).json, overlayOf(code).json)).toEqual([]);
  });

  it('names a path the overlay leaves out, a condition, a rate note and the name', () => {
    const { json } = overlayOf('DE');
    const overlay = structuredClone(json) as {
      name?: string;
      holdingRuleConditions: string[];
      card: { rates: { note?: string }[] };
    };
    overlay.holdingRuleConditions = overlay.holdingRuleConditions.slice(0, 1);
    delete overlay.card.rates[2]?.note;
    delete overlay.name;
    expect(missingTexts(englishOf('DE').json, overlay)).toEqual([
      'name',
      'holdingRuleConditions.1',
      'card.rates.2.note',
    ]);
    expect(missingTexts({ status: { version: '1', changeNotice: 'x' } }, {})).toEqual(['status.changeNotice']);
  });

  it.each(CODES)("%s's overlay validates against its English file", (code) => {
    const overlay = overlayOf(code);
    const problems = validateContent([englishOf(code), overlay], { today: '2026-11-25', allow }).filter(
      (problem) => problem.path === overlay.path,
    );
    expect(problems).toEqual([]);
  });

  it.each(CODES)(
    "%s's header texts in German hold no ';', and the overlay's lot note is the one copied",
    async (code) => {
      const profile = (await loadProfile(code, 'de')) as CountryProfile;
      expect(headerTexts(profile).filter(([, text]) => text.includes(';'))).toEqual([]);
      expect(profile.lotRuleNote).toBe((overlayOf(code).json as Partial<CountryProfile>).lotRuleNote);
    },
  );
});
