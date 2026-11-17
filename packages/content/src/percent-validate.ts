// A country profile's locale tags, the joiner and decimal of its literal percentages and its money figures' grouping
// (docs/CONTENT-STYLE.md §4), for validate.ts. Pure; relative imports name their .ts files, so that Node runs the CLI
// without a build step.
import { numberLocaleFor } from './loaders/locales.ts';
import type { Problem } from './problem.ts';
import type { CountryProfile } from './schema/jurisdiction.ts';

const wellFormed = (tag: string) => {
  try {
    return Intl.getCanonicalLocales(tag).length > 0;
  } catch {
    return false;
  }
};

/** A tag Intl refuses would throw out of the joiner check below, so it is the file's problem instead. */
function localeTagProblems(path: string, profile: CountryProfile): Problem[] {
  const fields: [string, string][] = [
    ...profile.locales.map((tag, index): [string, string] => [`locales.${index}`, tag]),
    ['numberFormatLocale', profile.numberFormatLocale],
    ['dateFormatLocale', profile.dateFormatLocale],
  ];
  return fields
    .filter(([, tag]) => !wellFormed(tag))
    .map(([field, tag]) => ({ path, code: 'locale-tag', detail: `${field}: ${tag}` }));
}

/** What a number locale writes between a numeral and its percent sign, as Intl formats it (docs/CONTENT-STYLE.md §4). */
export function percentJoiner(locale: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'percent' }).formatToParts(0);
  return parts
    .filter((part) => part.type === 'literal')
    .map((part) => part.value)
    .join('');
}

const codePoints = (text: string) =>
  text === ''
    ? 'none'
    : [...text].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
// What joins the two figures of a percentage range, both of them percentages (`12,2–48%`): an unspaced en dash or
// hyphen (docs/CONTENT-STYLE.md §4). A `to` range writes its sign on each figure (`2,5% to 13,3%`), and a spaced
// dash breaks the sentence, so `art. 33.1 to 28%` and `art. 33.1 – 28%` keep the law citation's point.
const RANGE_JOINER = '[–-]';
const FIGURE = String.raw`\d+(?:[.,]\d+)*`;
/** The rest of a percentage range after one of its figures: at most one further figure, then the sign. */
export const PERCENT_FOLLOWS = new RegExp(String.raw`^(?:${RANGE_JOINER}${FIGURE})?\s*%`, 'u');
// A sign followed by two hexadecimal digits is a URL's percent-escape (`a1%20b`), never a percentage. The joiner
// check reads the figure before the sign; the decimal check reads the whole range.
const SIGN = String.raw`(\s*)%(?![\dA-Fa-f]{2})`;
const PERCENT = new RegExp(`${FIGURE}${SIGN}`, 'g');
const PERCENT_RANGE = new RegExp(`${FIGURE}(?:${RANGE_JOINER}${FIGURE})?${SIGN}`, 'g');
const URL_IN_TEXT = /https?:\/\/\S+/g;

/**
 * Each literal percentage in a profile's prose takes its number locale's joiner, so the sign never wraps away from
 * its number. The app formats numbers with `numberFormatLocale`, or with a `locales` entry whose language is a UI
 * language (packages/app/src/lib/i18n/locale.ts, `localesFor`); a locale of no UI language, such as eu-ES, which
 * writes the sign first (`% 30`), never formats one. Every locale of the profile is still held to the one joiner.
 */
function percentProblems(path: string, profile: CountryProfile, texts: readonly [string, string][]): Problem[] {
  const { locales, numberFormatLocale } = profile;
  // A malformed tag is reported by localeTagProblems; without a number locale there is no joiner to hold the text to.
  if (!wellFormed(numberFormatLocale)) return [];
  const joiner = percentJoiner(numberFormatLocale);
  const expected = codePoints(joiner);
  const problems = locales
    .filter((locale) => wellFormed(locale) && percentJoiner(locale) !== joiner)
    .map((locale) => {
      const detail = `locales: ${locale} writes ${codePoints(percentJoiner(locale))}, numberFormatLocale ${numberFormatLocale} writes ${expected}`;
      return { path, code: 'percent-joiner', detail };
    });
  return [...problems, ...percentTextProblems(path, numberFormatLocale, texts)];
}

/**
 * A translated profile's percentages against the number locale `localesFor` (packages/app) picks in `language`: the
 * profile's locale in that language where it has one, else `numberFormatLocale` (ADR-0057). The joiner, the decimal
 * separator and a money figure's grouping.
 */
export function languagePercentProblems(
  path: string,
  language: string,
  profile: CountryProfile,
  texts: readonly [string, string][],
): Problem[] {
  const locale = numberLocaleFor(language, profile);
  return wellFormed(locale)
    ? [
        ...percentTextProblems(path, locale, texts),
        ...decimalProblems(path, locale, texts),
        ...groupProblems(path, locale, texts),
      ]
    : [];
}

/** The decimal separator `locale` writes, as Intl formats it; a tag Intl refuses writes the point. */
export function decimalSeparator(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
}

/**
 * Each literal percentage in `texts` whose figure holds a separator other than the decimal one `locale` writes (D8,
 * docs/CONTENT-STYLE.md §4): the page formats that profile's figures in `locale`, so its prose writes `12,2%` beside
 * them in Portugal, in English too. A percentage never reaches a thousand, so its separator is the decimal one; a
 * figure with no sign beside it (`art. 33.1`, `Quadro 9.4`) cites a law and keeps its point.
 */
function decimalProblems(path: string, locale: string, texts: readonly [string, string][]): Problem[] {
  const decimal = decimalSeparator(locale);
  return texts.flatMap(([field, text]) =>
    [...text.replaceAll(URL_IN_TEXT, ' ').matchAll(PERCENT_RANGE)].flatMap(([excerpt]): Problem[] => {
      const wrong = /[.,]/.exec(excerpt.replaceAll(decimal, ''))?.[0];
      if (wrong === undefined) return [];
      const detail = `${field}: ${JSON.stringify(excerpt)} writes "${wrong}", expected "${decimal}" (${locale})`;
      return [{ path, code: 'decimal-separator', detail }];
    }),
  );
}

const [NBSP, NARROW] = [String.fromCodePoint(0xa0), String.fromCodePoint(0x202f)];
// A money figure beside its currency, before or after it, with every mark a figure can be grouped by; a space joins
// only a group of three. A currency after the figure is a code, a sign or a word (`20 350 EUR`, `50 000 €`, `euros`).
const MONEY_FIGURE = String.raw`\d+(?:(?:[.,]|[ ${NBSP}${NARROW}](?=\d{3}(?!\d)))\d+)*`;
const CURRENCY = String.raw`EUR|USD|GBP|CHF|€|£|\$`;
const CURRENCY_AFTER = String.raw`(?:${CURRENCY}|[Ee]uros?|dollars?|pounds?|francs?)(?![A-Za-z])`;
const MONEY = new RegExp(
  String.raw`(?:${CURRENCY})[ ${NBSP}]?(${MONEY_FIGURE})|(?<![\d.,])(${MONEY_FIGURE})(?=([ ${NBSP}]?${CURRENCY_AFTER}))`,
  'g',
);
/** A whole figure as a comma-decimal page's profile writes it: groups of three from 10 000, joined by U+00A0. */
export const grouped = (digits: string) => (digits.length < 5 ? digits : digits.replace(/\B(?=(\d{3})+$)/g, NBSP));
/** A text with the escapes a writer types in JSON, so a no-break space never looks like a space. */
export const escaped = (text: string) =>
  text.replace(
    new RegExp(`[${NBSP}${NARROW}]`, 'g'),
    (char) => `${String.fromCodePoint(0x5c)}u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  );
const typed = (text: string) => escaped(JSON.stringify(text));

/**
 * The decimals of a money figure, or `undefined` when every mark in it groups. D2 as amended after its review
 * (2026-11-17): the figure's structure decides first. A point and a comma together make the last mark the decimal. A
 * mark written twice groups. A lone mark after a space group or four digits, or before four digits, is the decimal. Only
 * then does D2's rule read it: one or two digits after it, or a whole part of 0, are decimals; three after 1 to 3 digits
 * are a group.
 */
function decimalsOf(figure: string): string | undefined {
  const at = Math.max(figure.lastIndexOf('.'), figure.lastIndexOf(','));
  const [head, tail, marks] = [figure.slice(0, at), figure.slice(at + 1), figure.replace(/[^.,]/g, '')];
  if (at < 0 || !/^\d+$/.test(tail)) return undefined;
  if (marks.includes('.') && marks.includes(',')) return tail;
  if (marks.length > 1) return undefined;
  if (!/^\d{1,3}$/.test(head) || tail.length !== 3) return tail;
  return head === '0' ? tail : undefined;
}

/**
 * Each money figure in `texts` grouped otherwise than a comma-decimal page writes it (decided 2026-11-16,
 * docs/CONTENT-STYLE.md §4): a no-break space between groups of three from 10 000, none below, a comma before the
 * cents (`EUR 12,50`, never `EUR 12.50`). Under a point-decimal locale (`£37,700`) the locale's grouping stands, so
 * nothing is read.
 */
function groupProblems(path: string, locale: string, texts: readonly [string, string][]): Problem[] {
  if (decimalSeparator(locale) !== ',') return [];
  return texts.flatMap(([field, text]) =>
    [...text.replaceAll(URL_IN_TEXT, ' ').matchAll(MONEY)].flatMap((match): Problem[] => {
      // A currency after the figure is only looked at, so `2026 EUR 20,350` still reads the figure after the code.
      const [matched, before, after, currency = ''] = match;
      const [figure = '', excerpt] = [before ?? after, `${matched}${currency}`];
      // `EUR 1.125` is 1125, `EUR 0.125` keeps 0,125, `EUR 1.250,125` is 1250,125 and `EUR 1000,125` stands.
      const cents = decimalsOf(figure);
      const whole = cents === undefined ? figure : figure.slice(0, -cents.length - 1);
      const expected = `${grouped(whole.replace(/\D/g, ''))}${cents === undefined ? '' : `,${cents}`}`;
      if (expected === figure) return [];
      const detail = `${field}: ${typed(excerpt)} expected ${typed(excerpt.replace(figure, expected))} (${locale})`;
      return [{ path, code: 'number-group', detail }];
    }),
  );
}

/** Each literal percentage in `texts` without the joiner `locale` writes; the locale is well formed. */
function percentTextProblems(path: string, locale: string, texts: readonly [string, string][]): Problem[] {
  const joiner = percentJoiner(locale);
  const problems: Problem[] = [];
  for (const [field, text] of texts) {
    for (const [excerpt, gap = ''] of text.replaceAll(URL_IN_TEXT, ' ').matchAll(PERCENT)) {
      if (gap === joiner) continue;
      const detail = `${field}: ${JSON.stringify(excerpt)} has ${codePoints(gap)}, expected ${codePoints(joiner)}`;
      problems.push({ path, code: 'percent-joiner', detail });
    }
  }
  return problems;
}

/**
 * The profile's malformed locale tags, its percentages without the number locale's joiner, then those whose decimal
 * separator is not the one its English page writes, then its money figures grouped otherwise; `texts` by field.
 */
export function localeProblems(path: string, profile: CountryProfile, texts: readonly [string, string][]): Problem[] {
  const english = numberLocaleFor('en', profile);
  return [
    ...localeTagProblems(path, profile),
    ...percentProblems(path, profile, texts),
    ...(wellFormed(english) ? [...decimalProblems(path, english, texts), ...groupProblems(path, english, texts)] : []),
  ];
}
