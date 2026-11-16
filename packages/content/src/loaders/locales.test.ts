import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderLocales } from '../../scripts/rules.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';
import { COUNTRY_CODES, GENERIC_COUNTRY, loadProfile } from './countries.ts';
import { countryLocales, numberLocaleFor, spokenLocale } from './locales.ts';

// The generated locales file (ADR-0049, Deviations of 2026-11-15): each country's number and date locales, read
// at once, so a plan whose rules chunk did not arrive still reads and writes numbers as its country does (#261 A).

const FILE = fileURLToPath(new URL('../../rules/locales.json', import.meta.url));
const STALE = 'stale locales file: run `pnpm --filter @proofofcalm/content rules` and commit the result';

const profiles = async () =>
  Promise.all(COUNTRY_CODES.map(async (code) => (await loadProfile(code)) as CountryProfile));

describe('countryLocales', () => {
  it("every code's locales equal its profile's", async () => {
    for (const profile of await profiles()) {
      const { locales, numberFormatLocale, dateFormatLocale } = profile;
      expect(countryLocales(profile.code)).toEqual({ locales, numberFormatLocale, dateFormatLocale });
    }
  });

  it("a code with no profile gets XX's", () => {
    const generic = countryLocales(GENERIC_COUNTRY);
    for (const code of ['ZZ', 'BE', 'pt', 'toString']) expect(countryLocales(code)).toEqual(generic);
  });
});

describe('spokenLocale and numberLocaleFor (ADR-0023, ADR-0057)', () => {
  const belgium = { locales: ['nl-BE', 'fr-BE', 'de-BE'], numberFormatLocale: 'nl-BE' };

  it("take the profile's locale in the language where it has one, by the language's base", () => {
    expect(spokenLocale('de', belgium)).toBe('de-BE');
    expect(numberLocaleFor('de', belgium)).toBe('de-BE');
    expect(numberLocaleFor('fr', belgium)).toBe('fr-BE');
    expect(numberLocaleFor('pt-PT', { locales: ['pt-BR'], numberFormatLocale: 'en-US' })).toBe('pt-BR');
  });

  it("fall back to numberFormatLocale in a language the profile does not speak", () => {
    expect(spokenLocale('pt-PT', belgium)).toBeUndefined();
    expect(numberLocaleFor('pt-PT', belgium)).toBe('nl-BE');
    expect(numberLocaleFor('en', countryLocales('DE'))).toBe(countryLocales('DE').numberFormatLocale);
  });
});

describe('packages/content/rules/locales.json', () => {
  it('rules/locales.json is not stale', async () => {
    expect(readFileSync(FILE, 'utf8'), STALE).toBe(renderLocales(await profiles()));
  });
});
