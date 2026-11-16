// A country profile's locale tags and the joiner of its literal percentages (docs/CONTENT-STYLE.md §4), for
// validate.ts. Pure; relative imports name their .ts files, so that Node runs the CLI without a build step.
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
 * profile's locale in that language where it has one, else `numberFormatLocale` (ADR-0057). The joiner and the
 * decimal separator both.
 */
export function languagePercentProblems(
  path: string,
  language: string,
  profile: CountryProfile,
  texts: readonly [string, string][],
): Problem[] {
  const locale = numberLocaleFor(language, profile);
  return wellFormed(locale)
    ? [...percentTextProblems(path, locale, texts), ...decimalProblems(path, locale, texts)]
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
 * separator is not the one its English page writes; `texts` by field.
 */
export function localeProblems(path: string, profile: CountryProfile, texts: readonly [string, string][]): Problem[] {
  const english = numberLocaleFor('en', profile);
  return [
    ...localeTagProblems(path, profile),
    ...percentProblems(path, profile, texts),
    ...(wellFormed(english) ? decimalProblems(path, english, texts) : []),
  ];
}
