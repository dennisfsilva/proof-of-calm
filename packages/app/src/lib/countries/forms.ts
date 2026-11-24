import { COUNTRY_CODES, GENERIC_COUNTRY, type ProfileCode } from '@proofofcalm/content';
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

// How a sentence names a country (docs/CONTENT-STYLE.md §9, §10): each language's `messages/<locale>.json`
// writes seven forms per profile code, each a whole phrase with its preposition, article and case (pt-PT
// `dos Países Baixos`, German `im Vereinigten Königreich`), so a message never writes a preposition or an
// article before a country and a contraction cannot come out wrong. A message takes the form its sentence needs
// (`Sources {countryFor}`), and its call site spreads the whole family from `countryArgs`, so a translation may
// take another form of the same slot than English does. The forms are named by the English preposition of
// their role, since English is the source every translator reads.

export const COUNTRY_FORMS = ['name', 'the', 'in', 'for', 'from', 'to', 'with'] as const;
type CountryForm = (typeof COUNTRY_FORMS)[number];

export const COUNTRY_SLOTS = ['country', 'old', 'new'] as const;
export type CountrySlot = (typeof COUNTRY_SLOTS)[number];

type Argument<S extends CountrySlot, F extends CountryForm> = F extends 'name' ? S : `${S}${Capitalize<F>}`;

/** One slot's arguments: `{country}` and `{countryThe}` to `{countryWith}`, or `{old…}`, `{new…}`. */
export type CountryArgs<S extends CountrySlot = 'country'> = {
  readonly [F in CountryForm as Argument<S, F>]: string;
};

/** The `countries` namespace's translator: `useTranslations('countries')`, or the site's `createTranslator`. */
export type CountriesTranslator = (key: `${ProfileCode}.${CountryForm}`) => string;

const argument = (slot: CountrySlot, form: CountryForm): string =>
  form === 'name' ? slot : `${slot}${form.charAt(0).toUpperCase()}${form.slice(1)}`;

/** Every form of `code` in the UI language; a code with no profile takes the general profile's, as its plan does. */
export function countryArgs<S extends CountrySlot = 'country'>(
  t: CountriesTranslator,
  code: string,
  slot?: S,
): CountryArgs<S> {
  const profile = COUNTRY_CODES.find((known) => known === code) ?? GENERIC_COUNTRY;
  const name = slot ?? 'country';
  // The entries are the mapped type's keys, one per form, which `Object.fromEntries` cannot type.
  return Object.fromEntries(
    COUNTRY_FORMS.map((form) => [argument(name, form), t(`${profile}.${form}`)]),
  ) as CountryArgs<S>;
}

/** The hook over `useTranslations('countries')`: the screen loads the namespace with its own. */
export function useCountryArgs(): <S extends CountrySlot = 'country'>(code: string, slot?: S) => CountryArgs<S> {
  const t = useTranslations('countries');
  return useCallback(<S extends CountrySlot = 'country'>(code: string, slot?: S) => countryArgs(t, code, slot), [t]);
}
