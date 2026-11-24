import { describe, expect, it } from 'vitest';
import { COUNTRY_FORMS, COUNTRY_SLOTS } from './forms';

// The lint over every merged message that names a country (docs/CONTENT-STYLE.md §9, §10): a country form is a whole
// phrase with its own preposition and article, so a message writes none before it, never a possessive of a name, and
// no message or select branch opens with a form (its first letter would be lower case). A country argument is a slot
// with or without a form; `countryCurrency` names a currency, not a country.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

const merged = import.meta.glob<Tree>('../../messages/*/*.json', { eager: true, import: 'default' });

/** The words that may not stand right before a country, in each language with a merged folder. */
const BEFORE: Readonly<Record<string, readonly string[]>> = {
  en: ['for', 'in', 'to', 'with', 'from', 'of', 'under', 'on', 'at', 'by', 'into'],
  'pt-PT': [
    ...['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'a', 'à', 'ao', 'aos'],
    ...['por', 'pelo', 'pela', 'pelos', 'segundo', 'sobre', 'o', 'os', 'as'],
  ],
  de: [
    ...['für', 'in', 'im', 'mit', 'nach', 'von', 'vom', 'zu', 'zum', 'zur', 'auf', 'aus', 'bei', 'beim', 'über'],
    ...['um', 'durch', 'der', 'die', 'das', 'den', 'dem', 'des'],
  ],
};

const capital = (form: string) => `${form.charAt(0).toUpperCase()}${form.slice(1)}`;
const SLOT = COUNTRY_SLOTS.join('|');
const FORM = COUNTRY_FORMS.filter((form) => form !== 'name').map(capital).join('|');
/** A country argument, bare or by a form: `{country}`, `{countryFor}`, `{newTo}`. */
const COUNTRY = `\\{(?:${SLOT})(?:${FORM})?\\}`;
const NOT_CURRENCY = new Set(['countryCurrency']);

function findings(locale: string, message: string): string[] {
  const words = BEFORE[locale] ?? [];
  const found: string[] = [];
  const before = new RegExp(`(?<![\\p{L}\\p{N}])(${words.join('|')})\\s+(${COUNTRY})`, 'giu');
  for (const match of message.matchAll(before)) found.push(`"${match[1]}" before ${match[2]}`);
  for (const match of message.matchAll(new RegExp(`${COUNTRY}['’]s`, 'gu'))) found.push(`possessive ${match[0]}`);
  const opening = new RegExp(`(?:^|\\{)\\s*(\\{(?:${SLOT})(?:${FORM})\\})`, 'gu');
  for (const match of message.matchAll(opening)) found.push(`opens with ${match[1]}`);
  const named = new RegExp(`\\{((?:${SLOT})[A-Z][\\p{L}\\p{N}]*)\\}`, 'gu');
  for (const match of message.matchAll(named)) {
    const name = match[1] ?? '';
    if (!new RegExp(`^${COUNTRY.slice(2, -2)}$`, 'u').test(name) && !NOT_CURRENCY.has(name)) found.push(`slot ${name}`);
  }
  return found;
}

const files = Object.entries(merged).map(([path, tree]) => {
  const [, locale = '', namespace = ''] = /\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? [];
  return { locale, namespace, tree };
});

describe('the country slots of the merged messages', () => {
  it('cover English, pt-PT and German', () => {
    expect([...new Set(files.map(({ locale }) => locale))]).toEqual(expect.arrayContaining(['en', 'pt-PT', 'de']));
  });

  it('find what the lint names', () => {
    expect(findings('en', 'Sources for {countryFor}')).toEqual(['"for" before {countryFor}']);
    expect(findings('en', 'Continue with {country}')).toEqual(['"with" before {country}']);
    expect(findings('en', "{country}'s rule")).toEqual(["possessive {country}'s"]);
    expect(findings('en', '{countryThe} changed')).toEqual(['opens with {countryThe}']);
    expect(findings('en', '{kind, select, generic {x} other {{countryThe} changed}}')).toEqual([
      'opens with {countryThe}',
    ]);
    expect(findings('en', 'Moved {newOver}')).toEqual(['slot newOver']);
    expect(findings('pt-PT', 'Regras de {countryFor}')).toEqual(['"de" before {countryFor}']);
    expect(findings('pt-PT', 'Mudar para {countryTo}')).toEqual(['"para" before {countryTo}']);
    expect(findings('pt-PT', 'Fontes à {countryFor}')).toEqual(['"à" before {countryFor}']);
    expect(findings('de', 'Quellen für {countryFor}')).toEqual(['"für" before {countryFor}']);
    expect(findings('en', 'Change to {countryCurrency}')).toEqual([]);
    expect(findings('en', '{country} rules reviewed')).toEqual([]);
    expect(findings('pt-PT', 'Regras {countryFor} revistas')).toEqual([]);
    expect(findings('pt-PT', 'Mudar o país {countryTo}')).toEqual([]);
    expect(findings('en', 'Country now: {old}. After the change: {new}.')).toEqual([]);
  });

  it.each(files.map(({ locale, namespace }) => [`${locale}/${namespace}`]))('hold in %s', (name) => {
    const file = files.find(({ locale, namespace }) => `${locale}/${namespace}` === name);
    const found = leaves(file?.tree ?? {}).flatMap(([key, message]) =>
      findings(file?.locale ?? '', message).map((finding) => `${key}: ${finding}`),
    );
    expect(found).toEqual([]);
  });
});
