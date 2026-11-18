// A numeral joined to its unit by a hyphen never breaks there on a screen: the text writes U+2011 (docs/CONTENT-STYLE.md
// §4), for validate.ts and modules-validate.ts. Pure; relative imports name their .ts files, so that Node runs the CLI
// without a build step.
import { printedText } from './percent-gap.ts';
import type { Problem } from './problem.ts';

// English's units and pt-PT's (`90-dias`, `1-mês`). An ISO date and a tax year such as `2026-27` name no unit, so they
// pass. A law's number (`24-D/2022`) takes U+2011 in text shown on screen and U+002D in a source's title, a fact, and a
// document (docs/CONTENT-STYLE.md §4, the no-break hyphen paragraph); this lint does not check it, so it passes too.
const NUMBER_UNIT =
  /\d-(?:(?:day|week|month|year|hour|minute)s?|dia|dias|semana|semanas|mês|meses|ano|anos|hora|horas|minuto|minutos)(?![\p{L}\p{N}])/gu;
const DIGITS_BEFORE = /\d*$/;
const DETAIL = 'write U+2011 between the number and its unit (90\u2011day)';

/** Each numeral joined to its unit by an ordinary hyphen, the whole numeral with it (`90-day`). */
export function numberUnitHyphens(text: string): string[] {
  return [...text.matchAll(NUMBER_UNIT)].map(
    (match) => `${DIGITS_BEFORE.exec(text.slice(0, match.index))?.[0] ?? ''}${match[0]}`,
  );
}

/** One `number-unit-hyphen` problem per match in one field's text. */
export const hyphenProblems = (path: string, field: string, text: string): Problem[] =>
  numberUnitHyphens(text).map((match) => ({
    path,
    code: 'number-unit-hyphen',
    detail: `${field}: "${printedText(match, [])}"; ${DETAIL}`,
  }));
