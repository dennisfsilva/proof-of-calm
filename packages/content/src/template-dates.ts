// A template's dates come from its fields (docs/CONTENT-STYLE.md §4 and §6, docs/DOMAIN.md §5): its text names each
// date as `{date:<field path>}`, the app writes it with `format.date` in the UI language's format, unbroken
// (ADR-0023), and the validator refuses a placeholder that names no date of the template and any month name in en,
// pt or de, so no date is written out by hand. Pure and without zod: the app ships the loaders' half.
import type { CalendarDate } from '@proofofcalm/core';
import { asDate } from './loaders/brands.ts';
import { printedText } from './percent-gap.ts';
import type { Problem } from './problem.ts';
import type { ContentTemplate } from './schema/template.ts';

/** `{date:<field path>}`, the path in group 1: `lastBuy`, `sellWindow.opens`, `drawdowns.SOL.high`. */
export const PLACEHOLDER = /\{date:([^{}\s]+)\}/g;

/**
 * A text's placeholders, sorted: a multiset, so a translation's can be held to its English text's whatever their order.
 * It holds which dates a text names, not which noun each belongs to: a swap of two stays with counsel's read.
 */
export const datePlaceholdersIn = (text: string) => [...text.matchAll(PLACEHOLDER)].map(([whole]) => whole).sort();

/**
 * Every date field of a template by its path: `lastBuy`, `validUntil`, `sellWindow.<field>`, `references.<field>` and
 * `drawdowns.<coin>.high` or `.low`; an absent field has no path.
 */
export function templateDatePaths(template: ContentTemplate): ReadonlyMap<string, CalendarDate> {
  const { lastBuy, validUntil, sellWindow, references, drawdowns } = template;
  const fields: [string, string | undefined][] = [
    ['lastBuy', lastBuy],
    ['validUntil', validUntil],
    ...Object.entries(sellWindow ?? {}).map(([field, day]): [string, string] => [`sellWindow.${field}`, day]),
    ...Object.entries(references).map(([field, day]): [string, string | undefined] => [`references.${field}`, day]),
    ...drawdowns.flatMap(({ coin, high, low }): [string, string][] => [
      [`drawdowns.${coin}.high`, high],
      [`drawdowns.${coin}.low`, low],
    ]),
  ];
  return new Map(fields.flatMap(([path, day]) => (day === undefined ? [] : [[path, asDate(day)] as const])));
}

/** The text with each placeholder written by `formatDate`; one that names no date stays as written. */
export const fillTemplateDates = (
  text: string,
  dates: ReadonlyMap<string, CalendarDate>,
  formatDate: (date: CalendarDate) => string,
) =>
  text.replace(PLACEHOLDER, (whole, path: string) => {
    const date = dates.get(path);
    return date === undefined ? whole : formatDate(date);
  });

/** The fields the app fills; it shows the name and the risk label as written. */
const DATED_FIELDS: readonly string[] = ['oneLine', 'explanation'];
const MONTH_LOCALES = ['en-US', 'en-GB', 'pt-PT', 'pt-BR', 'de-DE'];

/** The month names of en, pt and de as Intl writes them, each also capitalised, the longest first. */
function monthNames(month: 'long' | 'short'): string {
  const names = new Set<string>();
  for (const locale of MONTH_LOCALES) {
    const format = new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' });
    for (let index = 0; index < 12; index += 1) {
      const name = format.format(Date.UTC(2000, index, 1)).replace(/\.$/, '');
      names.add(name).add(`${name.charAt(0).toUpperCase()}${name.slice(1)}`);
    }
  }
  return [...names].sort((a, b) => b.length - a.length).join('|');
}

let months: RegExp | undefined;
/**
 * A full month name anywhere, case as written (so "may" and "Mai" differ), and a short one beside a number (`1 Sept`,
 * `Nov 10`, `1 out.`), so the words "out" and "set" pass.
 */
const monthPattern = () => {
  if (months === undefined) {
    const [long, short] = [monthNames('long'), monthNames('short')];
    months = new RegExp(
      String.raw`(?<!\p{L})(?:${long})(?!\p{L})|(?<=\d[\s.,]{0,3})(?:${short})\.?(?!\p{L})|(?<!\p{L})(?:${short})\.?(?=\s+\d)`,
      'gu',
    );
  }
  return months;
};

/** Each text's placeholders against the template's dates, and any month name written out (docs/CONTENT-STYLE.md §4). */
export function templateDateProblems(
  path: string,
  template: ContentTemplate,
  texts: readonly (readonly [string, string])[],
): Problem[] {
  const dates = templateDatePaths(template);
  return texts.flatMap(([field, text]): Problem[] => {
    const placeholders = [...text.matchAll(PLACEHOLDER)];
    const problems: Problem[] = [];
    const report = (code: string, detail: string) =>
      problems.push({ path, code: `template-date-${code}`, detail: `${field}: ${detail}` });
    if (!DATED_FIELDS.includes(field) && /\{date/.test(text)) {
      report('field', 'a date goes in oneLine or explanation, as {date:<field>}');
      return problems;
    }
    for (const [whole, at = ''] of placeholders) {
      if (!dates.has(at)) report('unresolved', `${whole} names no date of this template`);
    }
    for (const [broken] of text.replace(PLACEHOLDER, '').matchAll(/\{date[^}\s]*/g)) {
      report('unresolved', `"${printedText(broken, [])}" is not a whole placeholder`);
    }
    for (const [name] of text.matchAll(monthPattern())) {
      report('month', `"${printedText(name, [])}" is a month name; write {date:<field>} (docs/CONTENT-STYLE.md §4)`);
    }
    return problems;
  });
}
