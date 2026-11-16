// A translation file against its English file (ADR-0057), for validate.ts: every path exists in English, holds prose
// TRANSLATABLE names, keeps the English array lengths and carries the English numbers and `{date:<field>}`
// placeholders (a template's `N %` tokens too, in order), and the overlaid value passes the schema. The checks on the overlaid text (the ban list, the hyphen,
// the percent joiner, the 60 words, a template's placeholders against its dates and month names) are validate.ts's,
// passed in. Pure.
import { numberLocaleFor } from '../loaders/locales.ts';
import { decimalSeparator, PERCENT_FOLLOWS } from '../percent-validate.ts';
import { type Problem, schemaProblems } from '../problem.ts';
import { FactSchema } from '../schema/fact.ts';
import { type CountryProfile, CountryProfileSchema } from '../schema/jurisdiction.ts';
import { type ContentTemplate, TemplateSchema } from '../schema/template.ts';
import { datePlaceholdersIn } from '../template-dates.ts';
import {
  applyOverlay,
  CONTENT_LANGUAGES,
  type ContentKind,
  isRecord,
  isTranslatable,
  type Segment,
  TRANSLATABLE,
} from './overlay.ts';

// Digits with the separators a number can hold between them: `31.4`, `31,4`, `1,000`, `1 000`, `1 000`,
// `1 000`. A space joins only a group of three digits, so `365 28` stays two numbers.
const NUMBER = /\d+(?:(?:[.,]|[   ](?=\d{3}(?!\d)))\d+)*/g;

/** A value as a canonical decimal string: no leading zeros before the units, no trailing zeros after the point. */
const decimalValue = (whole: string, fraction: string) => {
  const units = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals === '' ? units : `${units}.${decimals}`;
};

/**
 * The values of one run of digits and separators: the locale's decimal separator once, any other separator before
 * a group of three digits groups them, and any other place splits the run (`3,14` in English is 3 and 14).
 */
function valuesOf(run: string, decimal: string): string[] {
  const [first = '', ...rest] = run.split(/(\D)/);
  const values: string[] = [];
  let whole = first;
  let fraction: string | null = null;
  for (let index = 0; index < rest.length; index += 2) {
    const [separator, digits = ''] = [rest[index], rest[index + 1]];
    if (fraction === null && separator === decimal) fraction = digits;
    else if (fraction === null && /^\d{3}$/.test(digits)) whole += digits;
    else {
      values.push(decimalValue(whole, fraction ?? ''));
      [whole, fraction] = [digits, null];
    }
  }
  return [...values, decimalValue(whole, fraction ?? '')];
}

/**
 * The numbers of a text as values, read with the separators of `locale`, a percentage's with `percentLocale`'s
 * (every figure of a range `12,2–48%`, the sign after any joiner a profile writes; docs/CONTENT-STYLE.md §4),
 * sorted: a multiset to compare. It holds the values, not which noun each belongs to, nor their sign (ADR-0057).
 */
export const numbersIn = (text: string, locale: string, percentLocale = locale): string[] => {
  const [decimal, percentDecimal] = [decimalSeparator(locale), decimalSeparator(percentLocale)];
  return [...text.matchAll(NUMBER)]
    .flatMap(({ 0: run, index }) =>
      valuesOf(run, PERCENT_FOLLOWS.test(text.slice(index + run.length)) ? percentDecimal : decimal),
    )
    .sort();
};

/**
 * The number locales of an English text and of its translation, the English first, then the one an English
 * profile's percentages take (D8: `12,2%` for Portugal), by default the English one.
 */
export type NumberLocales = readonly [english: string, translated: string, englishPercent?: string];

// Every percentage a text writes, in any form (`40 %`, `40%`, `40,5 %`, a no-break space). A template writes `N %`
// with an ordinary space, which the app finds and formats with `format.percent` (template-step.tsx, CONTENT-STYLE §4),
// so its translation writes the same tokens in the same order, whatever the language's own percent style.
const PERCENT_TOKEN = /\d+(?:[.,]\d+)*[\s  ]?%/gu;
const percentsIn = (text: string) => (text.match(PERCENT_TOKEN) ?? []).join(' | ') || 'none';

/** Every way the overlay departs from English; the empty list is a pass. */
export function overlayProblems(
  kind: ContentKind,
  path: string,
  english: unknown,
  overlay: unknown,
  locales: NumberLocales,
): Problem[] {
  const problems: Problem[] = [];
  const report = (code: string, at: readonly Segment[], detail = '') =>
    problems.push({ path, code: `overlay-${code}`, detail: `${at.join('.') || '(root)'}${detail}` });
  const walk = (en: unknown, over: unknown, at: readonly Segment[]): void => {
    if (en === undefined || (en === null && over !== null)) return void report('unknown-path', at);
    if (isRecord(over)) {
      if (!isRecord(en)) return void report('not-translatable', at);
      for (const [key, value] of Object.entries(over)) {
        walk(Object.hasOwn(en, key) ? en[key] : undefined, value, [...at, key]);
      }
      return;
    }
    if (Array.isArray(over)) {
      if (!Array.isArray(en)) return void report('not-translatable', at);
      if (over.length !== en.length) {
        return void report('array-length', at, `: ${over.length} items, English ${en.length}`);
      }
      for (const [index, item] of over.entries()) {
        if (item !== null) walk(en[index], item, [...at, index]);
      }
      return;
    }
    if (typeof over !== 'string' || typeof en !== 'string' || !isTranslatable(kind, at)) {
      return void report('not-translatable', at);
    }
    const [mine, theirs] = [
      numbersIn(over, locales[1]).join(' ') || 'none',
      numbersIn(en, locales[0], locales[2]).join(' ') || 'none',
    ];
    if (mine !== theirs) report('number-mismatch', at, `: ${mine}, English ${theirs}`);
    // A placeholder holds no digits, so the number check cannot see one dropped or added; a swap of two keeps the
    // multiset and stays with counsel's read, as a swap of two written dates does.
    const [ourDates, theirDates] = [
      datePlaceholdersIn(over).join(' ') || 'none',
      datePlaceholdersIn(en).join(' ') || 'none',
    ];
    if (ourDates !== theirDates) report('date-mismatch', at, `: ${ourDates}, English ${theirDates}`);
    if (kind !== 'template') return;
    const [ourPercents, theirPercents] = [percentsIn(over), percentsIn(en)];
    if (ourPercents !== theirPercents) report('percent-mismatch', at, `: ${ourPercents}, English ${theirPercents}`);
  };
  walk(english, overlay, []);
  return problems;
}

const OVERLAY_FILE = /^(.*\/)?packages\/content\/i18n\/([^/]+)\/(jurisdictions|templates|facts)\/([^/]+\.json)$/;
const KINDS = { jurisdictions: 'jurisdiction', templates: 'template', facts: 'fact' } as const;
const LANGUAGES: readonly string[] = CONTENT_LANGUAGES.filter((language) => language !== 'en');

export const isOverlayFile = (path: string) => OVERLAY_FILE.test(path);

/** The texts whose overlaid value differs from English: the ones the English checks have not seen. */
export const changedTexts = (english: readonly [string, string][], translated: readonly [string, string][]) => {
  const before = new Map(english);
  return translated.filter(([field, text]) => before.get(field) !== text);
};

type Pair<T> = readonly [english: T, translated: T];
/** validate.ts's checks on what users read, run on a translation: dependency-cruiser forbids the import cycle. */
export type TextChecks = {
  readonly jurisdiction: (path: string, language: string, profiles: Pair<CountryProfile>) => Problem[];
  readonly template: (path: string, templates: Pair<ContentTemplate>) => Problem[];
  /** A translated fact's changed `value` and `unit`, by `<key>.<field>`: new prose that a Learn page quotes. */
  readonly fact: (path: string, texts: readonly [string, string][]) => Problem[];
};

// The English content writes its numbers with English separators whatever the country (de.json: `1,000`), except a
// profile's percentages, which take the separator of its English page's number locale (D8, percent-validate.ts).
const ENGLISH_NUMBERS = 'en';

/**
 * A translation file (ADR-0057): its English file among `files`, its shape against English, the schema and every check
 * the English field takes on its overlaid value. An English file that fails its schema is the English file's problem.
 */
export function overlayFileProblems(
  file: { readonly path: string; readonly json: unknown },
  files: readonly { readonly path: string; readonly json: unknown }[],
  checks: TextChecks,
): Problem[] {
  const { path, json } = file;
  const [, prefix = '', language = '', folder = '', name = ''] = OVERLAY_FILE.exec(path) ?? [];
  if (!LANGUAGES.includes(language)) {
    return [{ path, code: 'overlay-orphan', detail: `${language} is not a content language` }];
  }
  const englishPath = `${prefix}packages/content/${folder}/${name}`;
  const english = files.find((candidate) => candidate.path === englishPath)?.json;
  if (english === undefined) return [{ path, code: 'overlay-orphan', detail: `no English ${englishPath}` }];
  const kind = KINDS[folder as keyof typeof KINDS];
  // A template or a fact has no country: its translation takes the language's own number locale.
  const plain: NumberLocales = [ENGLISH_NUMBERS, language];
  if (kind === 'fact') return factProblems(path, english, json, plain, checks);
  if (kind === 'template') {
    const parsed = TemplateSchema.safeParse(english);
    if (!parsed.success) return [];
    const translated = applyOverlay(parsed.data, json, kind);
    const check = TemplateSchema.safeParse(translated);
    return [
      ...overlayProblems(kind, path, parsed.data, json, plain),
      ...(check.success ? [] : schemaProblems(path, check.error.issues)),
      ...checks.template(path, [parsed.data, translated]),
    ];
  }
  const parsed = CountryProfileSchema.safeParse(english);
  if (!parsed.success) return [];
  const translated = applyOverlay(parsed.data, json, kind);
  const check = CountryProfileSchema.safeParse(translated);
  const locales = [
    ENGLISH_NUMBERS,
    numberLocaleFor(language, parsed.data),
    numberLocaleFor('en', parsed.data),
  ] as const;
  return [
    ...overlayProblems(kind, path, parsed.data, json, locales),
    ...(check.success ? [] : schemaProblems(path, check.error.issues)),
    ...checks.jurisdiction(path, language, [parsed.data, translated]),
  ];
}

/** A fact's prose by `<key>.<field>`, the fields TRANSLATABLE names. */
const factTexts = (key: string, fact: Readonly<Record<string, unknown>>) =>
  TRANSLATABLE.fact.flatMap((field): [string, string][] => {
    const text = fact[field];
    return typeof text === 'string' ? [[`${key}.${field}`, text]] : [];
  });

/** A facts translation: each fact's `value` and `unit` by its key, a key of the English file. */
function factProblems(
  path: string,
  english: unknown,
  json: unknown,
  locales: NumberLocales,
  checks: TextChecks,
): Problem[] {
  if (!isRecord(json)) return [{ path, code: 'schema', detail: 'expected the translated facts by key' }];
  const facts = Array.isArray(english) ? english.filter(isRecord) : [];
  return Object.entries(json).flatMap(([key, translation]): Problem[] => {
    const fact = facts.find((candidate) => candidate.key === key);
    if (fact === undefined) return [{ path, code: 'overlay-orphan', detail: key }];
    const shape = overlayProblems('fact', path, fact, translation, locales).map((problem) => ({
      ...problem,
      detail: `${key}.${problem.detail}`,
    }));
    const translated = applyOverlay(fact, translation, 'fact');
    const check = FactSchema.safeParse(translated);
    return [
      ...shape,
      ...(check.success ? [] : schemaProblems(`${path}#${key}`, check.error.issues)),
      ...checks.fact(path, changedTexts(factTexts(key, fact), factTexts(key, translated))),
    ];
  });
}
