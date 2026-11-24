import { COUNTRY_CODES, GENERIC_COUNTRY, loadProfile, PROFILE_OVERLAYS } from '@proofofcalm/content';
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

// The words that end the general profile's forms, in each language whose forms end with the name.
const GENERAL = { en: 'general profile', 'pt-PT': 'perfil geral' } as const;
const WHOLE = Object.keys(GENERAL) as (keyof typeof GENERAL)[];

/** German's preposition of each form, before a name it writes the same after every preposition. */
const PREPOSITION = { in: 'in', for: 'für', from: 'von', to: 'auf', with: 'mit' } as const;
const unchanged = (name: string) => ({
  name,
  the: name,
  ...Object.fromEntries(Object.entries(PREPOSITION).map(([form, word]) => [form, `${word} ${name}`])),
});
const row = (...forms: string[]) => Object.fromEntries(COUNTRY_FORMS.map((form, index) => [form, forms[index]]));
/** D3's verdict §4, German, in COUNTRY_CODES order. */
const GERMAN = {
  DE: unchanged('Deutschland'),
  ES: unchanged('Spanien'),
  FR: unchanged('Frankreich'),
  GB: row(
    'Vereinigtes Königreich',
    'das Vereinigte Königreich',
    'im Vereinigten Königreich',
    'für das Vereinigte Königreich',
    'vom Vereinigten Königreich',
    'auf das Vereinigte Königreich',
    'mit dem Vereinigten Königreich',
  ),
  IE: unchanged('Irland'),
  IT: unchanged('Italien'),
  NL: row(
    'Niederlande',
    'die Niederlande',
    'in den Niederlanden',
    'für die Niederlande',
    'von den Niederlanden',
    'auf die Niederlande',
    'mit den Niederlanden',
  ),
  PT: unchanged('Portugal'),
  US: row('USA', 'die USA', 'in den USA', 'für die USA', 'von den USA', 'auf die USA', 'mit den USA'),
  XX: row(
    'Anderes Land',
    'das allgemeine Profil',
    'im allgemeinen Profil',
    'für das allgemeine Profil',
    'vom allgemeinen Profil',
    'auf das allgemeine Profil',
    'mit dem allgemeinen Profil',
  ),
};

describe('the country forms', () => {
  it('are written whole in English, pt-PT and German', () => {
    expect([...byLocale.keys()]).toEqual(expect.arrayContaining([...WHOLE, 'de']));
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

  // German writes the case into the name after a preposition (`im Vereinigten Königreich`), so no form ends with the
  // label: every form is pinned to D3's verdict (§4), and `name` to the German profile once its overlay exists.
  it('of de are the forms of the verdict, every code and every form', () => {
    expect(own('de')).toEqual(GERMAN);
  });

  // Skipped per code while packages/content has no German profile for it: the label then comes from this file alone.
  for (const code of COUNTRY_CODES)
    it.skipIf(PROFILE_OVERLAYS.de[code] === undefined)(`of de name ${code} as its German profile does`, async () => {
      expect(own('de')[code]?.name).toBe((await loadProfile(code, 'de'))?.name);
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
