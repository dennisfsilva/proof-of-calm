import compile from 'icu-minify/compile';
import { _createCache, _createIntlFormatters, createTranslator } from 'use-intl/core';
import formatOnly from 'use-intl/format-message/format-only';
import { describe, expect, it } from 'vitest';
import errors from '../errors/messages/en.json' with { type: 'json' };
import { messages } from './messages';
import { type LazyNamespace, NAMESPACE_LOADERS } from './namespaces';

// The hosts ship the messages compiled by icu-minify and format them with use-intl's parser-free
// entry (ADR-0045 §8, the Vite plugin in packages/config). This proves the two paths agree on every
// English message, so the parser can leave the bundle without changing a word on screen.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

/**
 * One visible value per `{argument}`, so a dropped or renamed placeholder shows up in the comparison;
 * a count for each `{n, plural, …}` (2, so the `other` branch and `#` are formatted), `other` for each
 * `{x, select, …}` (a select without its value is an error for the parser) and a marking
 * function for each `<tag>`, so a lost tag or branch shows up too.
 */
type Value = string | number | ((chunks: unknown) => string);
const valuesFor = (message: string): Record<string, Value> => ({
  ...Object.fromEntries([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => [name, `«${name}»`])),
  ...Object.fromEntries([...message.matchAll(/\{(\w+), plural,/g)].map(([, name]) => [name, 2])),
  ...Object.fromEntries([...message.matchAll(/\{(\w+), select,/g)].map(([, name]) => [name, 'other'])),
  ...Object.fromEntries(
    [...message.matchAll(/<(\w+)>/g)].map(([, name]) => [
      name,
      (chunks: unknown) => `<${name}>${String(chunks)}</${name}>`,
    ]),
  ),
});

type Translate = (key: string, values: Record<string, Value>) => string;
const translator = createTranslator({ locale: 'en', messages }) as unknown as Translate & { markup: Translate };
const parsing: Translate = (key, values) =>
  Object.values(values).some((value) => typeof value === 'function')
    ? translator.markup(key, values)
    : translator(key, values);
const cache = _createCache();
const formatters = _createIntlFormatters(cache);

// One describe per namespace, so a case carries one key, or one namespace's comparison, and never the whole
// file's work: under turbo's parallel load a case that imported and compared every namespace outran the 5 s
// timeout. The lazy files are imported while the file is collected, before any case's clock starts.
const lazy = Object.keys(NAMESPACE_LOADERS) as LazyNamespace[];
const loaded = new Map(
  await Promise.all(
    lazy.map(async (namespace) => [namespace, (await NAMESPACE_LOADERS[namespace]()).default] as const),
  ),
);
const isLazy = (namespace: string): namespace is LazyNamespace => (lazy as string[]).includes(namespace);

describe.each(Object.keys(messages))('precompiled messages: %s', (namespace) => {
  const tree = messages[namespace as keyof typeof messages] as Tree;
  it.each(leaves(tree, namespace))('%s formats the same through format-only as through the parser', (key, message) => {
    const values = valuesFor(message);
    const formatted = formatOnly(key, compile(message), values, { cache, formatters, locale: 'en', timeZone: 'UTC' });
    expect(formatted).toBe(parsing(key, values));
  });

  // A lazy screen's file is the merged file's namespace, so the comparison above covers every key a
  // lazy route loads through the compiled path (the plugin transforms the per-namespace files too).
  if (isLazy(namespace)) {
    it('loads its merged namespace', () => {
      const file = loaded.get(namespace);
      expect(file).toEqual(tree);
      expect(leaves(file ?? {}).length).toBeGreaterThan(0);
    });
  }
});

describe('precompiled messages', () => {
  it('names every lazy namespace in the merged file', () => {
    expect(lazy.filter((namespace) => !(namespace in messages))).toEqual([]);
  });

  // lib/errors builds its key table (`errors.<group>.<code>`) from its own messages file; every key it
  // can hand to the translator has to be a leaf of the merged file, or format-only shows the key.
  it('covers every key of the error surface', () => {
    const merged = new Set(leaves(messages).map(([key]) => key));
    const errorKeys = Object.entries(errors).flatMap(([group, entries]) =>
      typeof entries === 'string' ? [`errors.${group}`] : Object.keys(entries).map((code) => `errors.${group}.${code}`),
    );
    expect(errorKeys.length).toBeGreaterThan(0);
    expect(errorKeys.filter((key) => !merged.has(key))).toEqual([]);
  });
});
