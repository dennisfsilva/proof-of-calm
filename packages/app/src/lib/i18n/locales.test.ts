import compile from 'icu-minify/compile';
import { describe, expect, it } from 'vitest';
import { RISK_WORDING_LANGUAGES } from '../brand';
import { COUNTRY_FORMS, COUNTRY_SLOTS } from '../countries/forms';
import { VISIBLE_LANGUAGES } from './language';
import type { UiLanguage } from './locale';

// The translations beside English (ADR-0045 §8, the entry of 2026-11-15): `<folder>/messages/<locale>.json`,
// completed from English by the merge. A translated key exists in English with the same ICU arguments,
// argument types and rich tags, each plural or select keeps its `other` branch, and a visible locale
// translates every key, while a hidden one may be partial.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

const capitalized = COUNTRY_FORMS.slice(1).map((form) => `${form.charAt(0).toUpperCase()}${form.slice(1)}`);
const COUNTRY_FORM = new RegExp(`^(${COUNTRY_SLOTS.join('|')})(?:${capitalized.join('|')})?$`, 'u');

/**
 * A message's ICU shape from icu-minify's compiled form, where a message or branch is a string or a list of
 * parts: `arg:<name>:<type code>` per argument (a name and a numeric type, or a name alone) and
 * `tag:<name>` per rich tag (a name and its parts), sorted, without repeats. A plain country argument in any of
 * its forms (`{country}`, `{countryFor}`, `{oldThe}`) is `arg:<slot>:form`, since every call site passes the whole
 * family (lib/countries). The compiler itself throws on a plural or select without `other`.
 */
function shape(message: string): string[] {
  const found = new Set<string>();
  const part = (node: unknown): void => {
    if (!Array.isArray(node) || typeof node[0] !== 'string') return;
    const [name, type, branches] = node as [string, unknown, unknown];
    const slot = COUNTRY_FORM.exec(name)?.[1];
    if (node.length === 1) found.add(slot === undefined ? `arg:${name}:plain` : `arg:${slot}:form`);
    else if (typeof type === 'number') {
      found.add(`arg:${name}:${type}`);
      if (branches !== null && typeof branches === 'object')
        for (const branch of Object.values(branches)) sequence(branch);
    } else {
      found.add(`tag:${name}`);
      for (const child of node.slice(1)) part(child);
    }
  };
  const sequence = (node: unknown): void => {
    if (Array.isArray(node)) for (const child of node) part(child);
  };
  sequence(compile(message));
  return [...found].sort();
}

const files = import.meta.glob<Tree>(['../../features/*/messages/*.json', '../*/messages/*.json'], {
  eager: true,
  import: 'default',
});
/** `<folder>/<locale>` → that file's tree. */
const byFolder = new Map(
  Object.entries(files).map(([path, tree]) => {
    const [, folder, locale] = /([^/]+)\/messages\/([^/]+)\.json$/.exec(path) ?? [];
    return [`${folder}/${locale}`, { folder: folder ?? '', locale: locale ?? '', tree }] as const;
  }),
);
const translations = [...byFolder.values()].filter(({ locale }) => locale !== 'en');

/** The problems of one translated file against its English file, as lines. */
function problems(english: Tree, translated: Tree, complete: boolean): string[] {
  const source = new Map(leaves(english));
  const found: string[] = [];
  for (const [key, message] of leaves(translated)) {
    const original = source.get(key);
    if (original === undefined) {
      found.push(`${key}: not an English key`);
      continue;
    }
    try {
      const want = shape(original).join();
      const got = shape(message).join();
      if (got !== want) found.push(`${key}: ${got} instead of ${want}`);
    } catch (error) {
      found.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (complete) {
    const done = new Set(leaves(translated).map(([key]) => key));
    for (const key of source.keys()) if (!done.has(key)) found.push(`${key}: not translated`);
  }
  return found;
}

describe('the ICU shape', () => {
  it('names arguments with their types and tags, and refuses a plural without other', () => {
    expect(
      shape('{kind, select, reviewed {On <b>{date}</b>.} other {{n, plural, one {# day} other {# days}}}}'),
    ).toEqual(['arg:date:plain', 'arg:kind:1', 'arg:n:2', 'tag:b']);
    expect(shape('Plain words.')).toEqual([]);
    expect(() => shape('{n, plural, one {# day}}')).toThrow();
  });

  // A translation may take another form of a country than English does (lib/countries), never another slot.
  it("counts a country slot's forms as one argument", () => {
    expect(shape('{country} rules')).toEqual(shape('Regras {countryFor}'));
    expect(shape('{country} rules')).toEqual(['arg:country:form']);
    expect(shape('Paid in {countryCurrency}')).toEqual(['arg:countryCurrency:plain']);
    expect(shape('{oldThe}')).not.toEqual(shape('{country}'));
    expect(shape('{country, select, PT {a} other {b}}')).toEqual(['arg:country:1']);
  });
});

describe('a translated file', () => {
  const english = { a: 'Saved on {date}.', b: '{n, plural, one {# buy} other {# buys}}', c: 'Read <link>more</link>.' };

  it('passes with the same shapes, partial while hidden', () => {
    expect(problems(english, { a: 'Guardado em {date}.' }, false)).toEqual([]);
  });

  it('fails on an unknown key, a changed argument or tag, a lost other and a gap in a visible locale', () => {
    const bad = {
      a: 'Guardado em {data}.',
      b: '{n, plural, one {# compra}}',
      c: 'Leia <a>mais</a>.',
      d: 'Extra',
    };
    expect(problems(english, bad, true)).toEqual([
      'a: arg:data:plain instead of arg:date:plain',
      'b: MISSING_OTHER_CLAUSE',
      'c: tag:a instead of tag:link',
      'd: not an English key',
    ]);
    expect(problems(english, { a: 'Guardado em {date}.' }, true)).toEqual(['b: not translated', 'c: not translated']);
  });
});

describe('the translations in the repository', () => {
  it('found the English files', () => {
    expect([...byFolder.values()].filter(({ locale }) => locale === 'en').length).toBeGreaterThan(5);
  });

  it.each(translations.map(({ folder, locale, tree }) => [`${folder}/${locale}`, folder, locale, tree] as const))(
    '%s matches English',
    (_name, folder, locale, tree) => {
      const english = byFolder.get(`${folder}/en`)?.tree;
      expect(english, `${folder} has no English file`).toBeDefined();
      expect(problems(english ?? {}, tree, (VISIBLE_LANGUAGES as readonly string[]).includes(locale))).toEqual([]);
    },
  );

  // Today's entry boots with these three in the stored language (ADR-0045 §8), so they are whole while pt-PT and
  // German are still hidden: a key the merge completed from English would show English on Today.
  it.each(['errors', 'shell', 'today'].flatMap((folder) => ['pt-PT', 'de'].map((locale) => [folder, locale])))(
    '%s is whole in %s',
    (folder, locale) => {
      const translated = byFolder.get(`${folder}/${locale}`)?.tree;
      expect(translated, `${folder} has no ${locale} file`).toBeDefined();
      expect(problems(byFolder.get(`${folder}/en`)?.tree ?? {}, translated ?? {}, true)).toEqual([]);
    },
  );

  it('are complete for every visible locale', () => {
    const folders = [...byFolder.values()].filter(({ locale }) => locale === 'en').map(({ folder }) => folder);
    for (const locale of VISIBLE_LANGUAGES.filter((language) => language !== 'en'))
      expect(
        folders.filter((folder) => !byFolder.has(`${folder}/${locale}`)),
        locale,
      ).toEqual([]);
  });
});

// Onboarding, Portfolio and Plan are whole in pt-PT, but for the acknowledged disclosure: a language shows its
// own text only once counsel approved it as the English text's equal (RISK_WORDING_LANGUAGES, docs/LEGAL.md §4).
describe('the pt-PT onboarding, portfolio and plan', () => {
  const owesEnglish = (folder: string, locale: UiLanguage) =>
    folder === 'onboarding' && !RISK_WORDING_LANGUAGES.includes(locale) ? ['disclosure.text: not translated'] : [];

  it.each(['onboarding', 'portfolio', 'plan'])('%s is whole in pt-PT', (folder) => {
    const translated = byFolder.get(`${folder}/pt-PT`)?.tree;
    expect(translated, `${folder} has no pt-PT file`).toBeDefined();
    expect(problems(byFolder.get(`${folder}/en`)?.tree ?? {}, translated ?? {}, true)).toEqual(
      owesEnglish(folder, 'pt-PT'),
    );
  });
});

// A count is a figure in the country's number format: a plural picks its form from the count and writes the
// formatted figure, never ICU's `#`, which follows the language (docs/CONTENT-STYLE.md §4).
describe('a translated plural', () => {
  it("writes no ICU '#'", () => {
    const plural = (message: string) => shape(message).some((part) => /^arg:[^:]+:2$/.test(part));
    expect(plural('{n, plural, one {{figure} dia} other {{figure} dias}}')).toBe(true);
    const found = translations.flatMap(({ folder, locale, tree }) =>
      leaves(tree)
        .filter(([, message]) => plural(message) && message.includes('#'))
        .map(([key]) => `${folder}/${locale} ${key}`),
    );
    expect(found).toEqual([]);
  });
});
