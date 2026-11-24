import { COUNTRY_CODES, GENERIC_COUNTRY, type ProfileCode } from '@proofofcalm/content';
import compile from 'icu-minify/compile';
import { _createCache, _createIntlFormatters } from 'use-intl/core';
import formatOnly from 'use-intl/format-message/format-only';
import { describe, expect, it } from 'vitest';
import { type CountriesTranslator, countryArgs } from './forms';

// Every message that names a country through its forms, rendered as the app renders it: the language's own message
// compiled by icu-minify and formatted by use-intl's parser-free entry (ADR-0045 §8), with the forms of the merged
// `countries` namespace the screen loads. The table in `fixtures/sentences-<locale>.json` is what a native reader
// reads (key, then code, then sentence); a message that takes a form and is missing from SENTENCES fails the guard.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

const LISTED = COUNTRY_CODES.filter((code) => code !== GENERIC_COUNTRY);

type Sentence = {
  /** The merged key, namespace first. */
  readonly key: string;
  /** The call site's other arguments. */
  readonly values: Readonly<Record<string, string>>;
  /** The codes that reach the call site: the general profile has no head title and no sources. */
  readonly codes: readonly ProfileCode[];
};

const SENTENCES: readonly Sentence[] = [
  { key: 'learn.countries.countryHeadTitle', values: {}, codes: LISTED },
  { key: 'learn.card.sourceList', values: {}, codes: LISTED },
];

const own = import.meta.glob<Tree>(['../../features/*/messages/*.json', '../*/messages/*.json'], {
  eager: true,
  import: 'default',
});
const merged = import.meta.glob<Tree>('../../messages/*/*.json', { eager: true, import: 'default' });
const tables = import.meta.glob<Tree>('./fixtures/sentences-*.json', { eager: true, import: 'default' });

/** The message `key` as `locale`'s own file writes it, or undefined while it holds none. */
function ownMessage(key: string, locale: string): string | undefined {
  const [folder = '', ...path] = key.split('.');
  const file = Object.entries(own).find(([name]) => name.endsWith(`/${folder}/messages/${locale}.json`))?.[1];
  return new Map(leaves(file ?? {})).get(path.join('.'));
}

function forms(locale: string): CountriesTranslator {
  const file = Object.entries(merged).find(([name]) => name.endsWith(`/${locale}/countries.json`))?.[1] ?? {};
  const table = new Map(leaves(file));
  return (key) => table.get(key) ?? key;
}

const cache = _createCache();
const formatters = _createIntlFormatters(cache);

function rendered(locale: string): Tree {
  const t = forms(locale);
  const table: Tree = {};
  for (const { key, values, codes } of SENTENCES) {
    const message = ownMessage(key, locale);
    if (message === undefined) continue;
    const compiled = compile(message);
    table[key] = Object.fromEntries(
      codes.map((code) => {
        const args = { ...values, ...countryArgs(t, code) };
        return [code, String(formatOnly(key, compiled, args, { cache, formatters, locale, timeZone: 'UTC' }))];
      }),
    );
  }
  return table;
}

const LOCALES = Object.keys(tables).map((path) => /sentences-([^/]+)\.json$/.exec(path)?.[1] ?? '');

/** Whether a message takes a country through one of its forms (`{countryFor}`, `{oldThe}`, `{newTo}`). */
const takesForm = (message: string) => /\{(?:country|old|new)(?:The|In|For|From|To|With)\}/u.test(message);

describe('the sentences that name a country', () => {
  it('are tabled for English and pt-PT', () => {
    expect(LOCALES).toEqual(expect.arrayContaining(['en', 'pt-PT']));
  });

  it.each(LOCALES)('read in %s as the table writes them', (locale) => {
    const table = Object.entries(tables).find(([path]) => path.endsWith(`sentences-${locale}.json`))?.[1];
    expect(rendered(locale)).toEqual(table);
  });

  it('are every merged message that takes a form', () => {
    expect(takesForm('Sources {countryFor}')).toBe(true);
    expect(takesForm('Country: {oldThe} {newTo}')).toBe(true);
    expect(takesForm('Paid in {countryCurrency}')).toBe(false);
    const listed = new Set(SENTENCES.map(({ key }) => key));
    const missing = Object.entries(merged).flatMap(([path, tree]) => {
      const namespace = /([^/]+)\.json$/.exec(path)?.[1] ?? '';
      return leaves(tree, namespace)
        .filter(([key, message]) => takesForm(message) && !listed.has(key))
        .map(([key]) => key);
    });
    expect([...new Set(missing)]).toEqual([]);
  });
});
