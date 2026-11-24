import { COUNTRY_CODES, GENERIC_COUNTRY, loadProfile } from '@proofofcalm/content';
import { describe, expect, it } from 'vitest';
import { COUNTRY_FORMS, type CountriesTranslator, countryArgs } from './forms';

// Each language's own forms file, read as written (not the merge's completion from English): every profile code
// with every form, each a whole phrase that ends with the name the profile gives it, so a sentence and its label
// never name a country two ways (docs/CONTENT-STYLE.md §9, §10).

type Forms = Readonly<Record<string, Readonly<Record<string, string>>>>;
const files = import.meta.glob<Forms>('./messages/*.json', { eager: true, import: 'default' });
const byLocale = new Map(
  Object.entries(files).map(([path, forms]) => [/([^/]+)\.json$/.exec(path)?.[1] ?? '', forms] as const),
);
const own = (locale: string): Forms => byLocale.get(locale) ?? {};

const translator =
  (forms: Forms): CountriesTranslator =>
  (key) => {
    const [code = '', form = ''] = key.split('.');
    return forms[code]?.[form] ?? key;
  };

// The words that end the general profile's forms, in each language whose forms are whole.
const GENERAL = { en: 'general profile', 'pt-PT': 'perfil geral' } as const;
const WHOLE = Object.keys(GENERAL) as (keyof typeof GENERAL)[];

describe('the country forms', () => {
  it('are written whole in English and pt-PT', () => {
    expect([...byLocale.keys()]).toEqual(expect.arrayContaining(WHOLE));
  });

  it.each([...byLocale.keys()])('of %s hold every code with every form, in order and none empty', (locale) => {
    const forms = own(locale);
    expect(Object.keys(forms)).toEqual([...COUNTRY_CODES]);
    for (const code of COUNTRY_CODES) {
      expect(Object.keys(forms[code] ?? {}), code).toEqual([...COUNTRY_FORMS]);
      for (const form of COUNTRY_FORMS) expect(forms[code]?.[form]?.trim(), `${code}.${form}`).not.toBe('');
    }
  });

  it.each(WHOLE)('of %s name each country as its profile does, and end every form with that name', async (locale) => {
    const forms = own(locale);
    for (const code of COUNTRY_CODES) {
      const name = forms[code]?.name ?? '';
      expect(name, code).toBe((await loadProfile(code, locale))?.name);
      const end = code === GENERIC_COUNTRY ? GENERAL[locale] : name;
      for (const form of COUNTRY_FORMS.slice(1))
        expect(forms[code]?.[form], `${code}.${form}`).toMatch(new RegExp(`${end}$`, 'u'));
    }
  });

  it.each([...byLocale.keys()])('of %s start each phrase with its preposition in lower case', (locale) => {
    const forms = own(locale);
    for (const code of COUNTRY_CODES)
      for (const form of ['in', 'for', 'from', 'to', 'with'] as const)
        expect(forms[code]?.[form], `${code}.${form}`).toMatch(/^\p{Ll}/u);
  });
});

describe('countryArgs', () => {
  const t = translator(own('en'));

  it('gives every form of a slot as its argument', () => {
    expect(countryArgs(t, 'NL')).toEqual({
      country: 'Netherlands',
      countryThe: 'the Netherlands',
      countryIn: 'in the Netherlands',
      countryFor: 'for the Netherlands',
      countryFrom: 'from the Netherlands',
      countryTo: 'to the Netherlands',
      countryWith: 'with the Netherlands',
    });
    expect(countryArgs(t, 'PT', 'old')).toMatchObject({ old: 'Portugal', oldThe: 'Portugal', oldTo: 'to Portugal' });
    expect(countryArgs(t, 'GB', 'new')).toMatchObject({ new: 'United Kingdom', newTo: 'to the United Kingdom' });
  });

  it("gives a code with no profile the general profile's forms, as its plan runs on", () => {
    expect(countryArgs(t, 'BE')).toEqual(countryArgs(t, GENERIC_COUNTRY));
    expect(countryArgs(t, 'BE').countryFor).toBe('for the general profile');
    expect(countryArgs(translator(own('pt-PT')), 'BE').countryIn).toBe('no perfil geral');
  });
});
