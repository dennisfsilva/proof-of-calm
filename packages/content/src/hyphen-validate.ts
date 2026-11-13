// A numeral joined to its unit by a hyphen never breaks there on a screen: the text writes U+2011 (docs/CONTENT-STYLE.md
// §4), for validate.ts and modules-validate.ts. Pure; relative imports name their .ts files, so that Node runs the CLI
// without a build step.
import type { Problem } from './problem.ts';

// A reference such as `24-D/2022`, an ISO date and a tax year such as `2026-27` name no unit, so they pass.
const NUMBER_UNIT = /\d-(?:day|week|month|year|hour|minute)s?(?![\p{L}\p{N}])/gu;
const DIGITS_BEFORE = /\d*$/;
const DETAIL = 'write U+2011 between the number and its unit (90‑day)';

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
    detail: `${field}: ${JSON.stringify(match)}; ${DETAIL}`,
  }));
