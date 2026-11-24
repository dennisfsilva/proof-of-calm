import { COUNTRY_CODES, GENERIC_COUNTRY, type ProfileCode } from '@proofofcalm/content';
import compile from 'icu-minify/compile';
import { _createCache, _createIntlFormatters } from 'use-intl/core';
import formatOnly from 'use-intl/format-message/format-only';
import { describe, expect, it } from 'vitest';
import { type CountriesTranslator, countryArgs } from './forms';

// Every message that names a country, rendered as the app renders it: the language's own message compiled by
// icu-minify and formatted by use-intl's parser-free entry (ADR-0045 §8), with the forms of the merged `countries`
// namespace the screen loads. The table in `fixtures/sentences-<locale>.json` is what a native reader reads (key,
// then case, then sentence); a message that takes a country, bare or by a form, and is missing from SENTENCES fails
// the guard. A case is a code, or `<old>-<new>` for a change of country; the general profile's cases (XX) take the
// branch its call site gives it.

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node).flatMap(([key, value]) => leaves(value, path === '' ? key : `${path}.${key}`));

const ALL: readonly ProfileCode[] = COUNTRY_CODES;
const LISTED = COUNTRY_CODES.filter((code) => code !== GENERIC_COUNTRY);
const generic = (code: ProfileCode) => code === GENERIC_COUNTRY;
/** A change from Portugal to every other code, and from the general profile back to Portugal. */
const CHANGES = [...COUNTRY_CODES.filter((code) => code !== 'PT').map((code) => `PT-${code}`), `${GENERIC_COUNTRY}-PT`];

type Case = {
  readonly code: ProfileCode;
  readonly old: ProfileCode | undefined;
  /** `settings.country.ruleName` for a code, as the country section words it. */
  readonly rule: (code: ProfileCode) => string;
};

type Sentence = {
  /** The merged key, namespace first. */
  readonly key: string;
  /** The cases that reach the call site: the general profile has no head title, no sources and no review line. */
  readonly cases: readonly string[];
  /** The call site's other arguments. */
  readonly values?: (input: Case) => Readonly<Record<string, string | number>>;
};

const RULE = '1 year, then tax-free.';
const NOW = { date: '16 Oct 2026' };
const LENGTH = { unit: 'years', count: 1, figure: '1' };

const SENTENCES: readonly Sentence[] = [
  { key: 'learn.countries.countryHeadTitle', cases: LISTED },
  { key: 'learn.card.sourceList', cases: LISTED },
  { key: 'onboarding.country.suggested', cases: LISTED },
  { key: 'onboarding.country.confirm', cases: ALL },
  {
    key: 'onboarding.summary.holdingRuleValue',
    cases: ALL,
    values: ({ code }) => ({ kind: generic(code) ? 'generic' : 'named', words: RULE }),
  },
  { key: 'plan.review.rules.country', cases: LISTED },
  {
    key: 'plan.review.rules.changed',
    cases: ALL,
    values: ({ code }) => ({ ...NOW, kind: generic(code) ? 'generic' : 'country' }),
  },
  { key: 'plan.review.rules.link', cases: ALL, values: ({ code }) => ({ kind: generic(code) ? 'generic' : 'country' }) },
  {
    key: 'plan.earlyWindow.notice',
    cases: ALL,
    values: ({ code }) => ({
      opensOn: '1 Sept 2029',
      eligibleOn: '5 Mar 2030',
      effect: 'exempt',
      rule: generic(code) ? 'generic' : 'named',
      on: 'window',
      host: 'country',
    }),
  },
  { key: 'plan.holdingRule.country', cases: ALL, values: ({ code }) => ({ kind: generic(code) ? 'generic' : 'named' }) },
  { key: 'settings.country.summary', cases: ALL },
  { key: 'settings.country.row.country', cases: CHANGES },
  { key: 'settings.country.row.ruleNow', cases: ALL, values: ({ code, rule }) => ({ name: rule(code), rule: RULE }) },
  { key: 'settings.country.row.ruleAfter', cases: ALL, values: ({ code, rule }) => ({ name: rule(code), rule: RULE }) },
  {
    key: 'settings.country.ruleName',
    cases: ALL,
    values: ({ code }) => ({ kind: generic(code) ? 'generic' : 'country' }),
  },
  {
    key: 'settings.country.confirmRule',
    cases: CHANGES,
    values: ({ code, old, rule }) => ({ from: rule(old ?? code), to: rule(code) }),
  },
  { key: 'settings.country.confirm', cases: ALL },
  { key: 'settings.country.changed', cases: ALL },
  { key: 'settings.country.alreadyChanged', cases: ALL },
  {
    key: 'settings.data.taxYear.file.title',
    cases: ALL,
    values: () => ({ product: 'Proof of Calm', from: '2026-01-01', to: '2026-12-31' }),
  },
  { key: 'settings.data.taxYear.file.reviewed', cases: LISTED, values: () => ({ date: '2026-10-01' }) },
  {
    key: 'settings.data.taxYear.file.reviewedSources',
    cases: LISTED,
    values: () => ({ date: '2026-10-01', sources: 'https://example.org' }),
  },
  { key: 'settings.data.taxYear.file.underReview', cases: LISTED, values: () => ({ date: '2025-10-01' }) },
  {
    key: 'settings.data.taxYear.file.holding',
    cases: LISTED,
    values: () => ({ ...LENGTH, held: '2026-10-20' }),
  },
  { key: 'settings.data.taxYear.file.holdingRaw', cases: LISTED, values: () => LENGTH },
  { key: 'settings.data.taxYear.file.planRule', cases: LISTED },
  {
    key: 'today.ruleChange.generic',
    cases: ALL,
    values: ({ code }) => ({ ...NOW, kind: generic(code) ? 'generic' : 'country' }),
  },
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

const codeOf = (text: string) => COUNTRY_CODES.find((code) => code === text) ?? GENERIC_COUNTRY;

function rendered(locale: string): Tree {
  const t = forms(locale);
  const format = (key: string, values: Readonly<Record<string, string | number>>) => {
    const message = ownMessage(key, locale);
    if (message === undefined) return undefined;
    return String(formatOnly(key, compile(message), values, { cache, formatters, locale, timeZone: 'UTC' }));
  };
  const rule = (code: ProfileCode) =>
    format('settings.country.ruleName', { kind: generic(code) ? 'generic' : 'country', ...countryArgs(t, code) }) ?? '';
  const table: Tree = {};
  for (const { key, cases, values } of SENTENCES) {
    if (ownMessage(key, locale) === undefined) continue;
    table[key] = Object.fromEntries(
      cases.map((name) => {
        const [first = '', second] = name.split('-');
        const code = codeOf(second ?? first);
        const old = second === undefined ? undefined : codeOf(first);
        const args = {
          ...values?.({ code, old, rule }),
          ...countryArgs(t, code),
          ...(old === undefined ? {} : { ...countryArgs(t, old, 'old'), ...countryArgs(t, code, 'new') }),
        };
        return [name, format(key, args) ?? ''];
      }),
    );
  }
  return table;
}

const LOCALES = Object.keys(tables).map((path) => /sentences-([^/]+)\.json$/.exec(path)?.[1] ?? '');

/** Whether a message takes a country, bare or through one of its forms (`{country}`, `{countryFor}`, `{newTo}`). */
const takesCountry = (message: string) =>
  /\{(?:country|old|new)(?:The|In|For|From|To|With)?\}/u.test(message);

describe('the sentences that name a country', () => {
  it('are tabled for English and pt-PT', () => {
    expect(LOCALES).toEqual(expect.arrayContaining(['en', 'pt-PT']));
  });

  it.each(LOCALES)('read in %s as the table writes them', (locale) => {
    const table = Object.entries(tables).find(([path]) => path.endsWith(`sentences-${locale}.json`))?.[1];
    expect(rendered(locale)).toEqual(table);
  });

  it('are every merged message that takes a country', () => {
    expect(takesCountry('Sources {countryFor}')).toBe(true);
    expect(takesCountry('Country now: {old}. After the change: {new}.')).toBe(true);
    expect(takesCountry('Your plan is in {country}.')).toBe(true);
    expect(takesCountry('Paid in {countryCurrency}')).toBe(false);
    expect(takesCountry('Replace {from} with {to}')).toBe(false);
    const listed = new Set(SENTENCES.map(({ key }) => key));
    const missing = Object.entries(merged).flatMap(([path, tree]) => {
      const namespace = /([^/]+)\.json$/.exec(path)?.[1] ?? '';
      return leaves(tree, namespace)
        .filter(([key, message]) => takesCountry(message) && !listed.has(key))
        .map(([key]) => key);
    });
    expect([...new Set(missing)]).toEqual([]);
  });
});
