import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import allowList from '../../sources.allow.json' with { type: 'json' };
import { headerTexts } from '../header-validate.ts';
import { loadProfile } from '../loaders/countries.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { type ContentFile, validateContent } from '../validate.ts';

// The pt-PT overlays of the profiles (ADR-0057), as `pnpm validate:content` reads them next to their English files:
// each figure English's in the country's number format, no banned word, and no `;` in a text the tax-year header
// copies (`header-semicolon`, docs/DOMAIN.md §3.13).

const { $comment: _, ...allow } = allowList;
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string): ContentFile => ({ path, json: JSON.parse(readFileSync(`${ROOT}${path}`, 'utf8')) });
const CODES = ['PT', 'XX'] as const;
const englishOf = (code: string) => read(`packages/content/jurisdictions/${code.toLowerCase()}.json`);
const overlayOf = (code: string) => read(`packages/content/i18n/pt-PT/jurisdictions/${code.toLowerCase()}.json`);

describe('the pt-PT profile overlays', () => {
  it.each(CODES)("%s's overlay validates against its English file", (code) => {
    const overlay = overlayOf(code);
    const problems = validateContent([englishOf(code), overlay], { today: '2026-11-16', allow }).filter(
      (problem) => problem.path === overlay.path,
    );
    expect(problems).toEqual([]);
  });

  it.each(CODES)(
    "%s's header texts in pt-PT hold no ';', and the overlay's lot note is the one copied",
    async (code) => {
      const profile = (await loadProfile(code, 'pt-PT')) as CountryProfile;
      const english = (await loadProfile(code)) as CountryProfile;
      expect(headerTexts(profile).filter(([, text]) => text.includes(';'))).toEqual([]);
      const { lotRuleNote } = overlayOf(code).json as Partial<CountryProfile>;
      // A review may reword or drop the overlay's text (ADR-0057): the profile holds it, or English's without it.
      expect(profile.lotRuleNote).toBe(lotRuleNote ?? english.lotRuleNote);
    },
  );
});
