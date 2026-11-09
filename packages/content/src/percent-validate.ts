// A country profile's locale tags and the joiner of its literal percentages (docs/CONTENT-STYLE.md §4), for
// validate.ts. Pure; relative imports name their .ts files, so that Node runs the CLI without a build step.
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
// A sign followed by two hexadecimal digits is a URL's percent-escape (`a1%20b`), never a percentage.
const PERCENT = /\d+(?:[.,]\d+)*(\s*)%(?![\dA-Fa-f]{2})/g;
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
  for (const [field, text] of texts) {
    for (const [excerpt, gap = ''] of text.replaceAll(URL_IN_TEXT, ' ').matchAll(PERCENT)) {
      if (gap === joiner) continue;
      const detail = `${field}: ${JSON.stringify(excerpt)} has ${codePoints(gap)}, expected ${expected}`;
      problems.push({ path, code: 'percent-joiner', detail });
    }
  }
  return problems;
}

/** The profile's malformed locale tags, then its percentages without the number locale's joiner; `texts` by field. */
export function localeProblems(path: string, profile: CountryProfile, texts: readonly [string, string][]): Problem[] {
  return [...localeTagProblems(path, profile), ...percentProblems(path, profile, texts)];
}
