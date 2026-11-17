// A currency code joined to its figure and a form's name joined to its number by a no-break space
// (docs/CONTENT-STYLE.md §4), for percent-validate.ts. Pure; relative imports name their .ts files, so that Node runs
// the CLI without a build step.
import type { Problem } from './problem.ts';

const NBSP = String.fromCodePoint(0xa0);
// Any white space but the no-break space: an ordinary space, a tab, a line break, a narrow no-break space.
const GAP = String.raw`((?:(?!${NBSP})\s)+)`;
// The ISO codes the live profiles write beside a figure, and the words that name a form or one of its boxes.
const CODE = '(EUR|GBP|USD)';
const FORM =
  '((?:[Aa]nexo|[Bb]ox|[Cc]ampo|[Ff]ield|[Ff]orm|[Ff]ormulaire|[Mm]odelo|[Mm]odello|[Qq]uadro|[Ss]chedule)s?)';
// A money figure, its groups joined by a point, a comma or a space before three digits (an ordinary space between
// groups is `number-group`'s), and a form's number: digits with their letters, points and hyphens (`9.4`, `1099-DA`,
// `3AN`), or capitals with their digits (`G1`, `RW`, `D-100`), never a word (`Modello Redditi`).
const FIGURE = String.raw`(\d+(?:(?:[.,]|\s(?=\d{3}(?!\d)))\d+)*)`;
const NUMBER = String.raw`(\d[\dA-Za-z]*(?:[.-][\dA-Za-z]+)*|[A-Z][A-Z\d]*(?:-[A-Za-z\d]+)*(?!\p{L}))`;
const NOT_IN_WORD = String.raw`(?<![\p{L}\d])`;
// A code after a figure is that figure's only when no figure follows it: in `art. 33.1 EUR 1000` the code is 1000's.
const JOINS = new RegExp(
  [
    `${NOT_IN_WORD}${CODE}${GAP}${FIGURE}`,
    String.raw`(?<![\d.,])${FIGURE}${GAP}${CODE}(?![\p{L}\d])(?!\s?\d)`,
    `${NOT_IN_WORD}${FORM}${GAP}${NUMBER}`,
  ].join('|'),
  'gu',
);

const codePoints = (text: string) =>
  [...new Set(text)].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);
const typed = (text: string) => JSON.stringify(text).replaceAll(NBSP, `${String.fromCodePoint(0x5c)}u00a0`);

/**
 * Each currency code and its figure (`EUR 20 350`, `100 USD`) and each form's name and its number (`Modelo 721`,
 * `Anexo G`) in `texts` joined by anything but U+00A0, so that a line can break between them (docs/CONTENT-STYLE.md
 * §4). The detail names the pair and the space between them, never a text to write.
 */
export function joinProblems(path: string, texts: readonly [string, string][]): Problem[] {
  return texts.flatMap(([field, text]) =>
    [...text.matchAll(JOINS)].map((match): Problem => {
      const [
        ,
        codeBefore,
        gapAfterCode,
        figureAfterCode,
        figureBefore,
        gapBeforeCode,
        codeAfter,
        form,
        gapAfterForm,
        number,
      ] = match;
      const [gap = '', figure = ''] = [
        gapAfterCode ?? gapBeforeCode ?? gapAfterForm,
        figureAfterCode ?? figureBefore ?? number,
      ];
      const code = codeBefore ?? codeAfter;
      const pair =
        code === undefined ? `the form ${typed(form ?? '')} and its number` : `${typed(code)} and its figure`;
      const detail = `${field}: ${pair} ${typed(figure)} are joined by ${codePoints(gap).join(' ')}, not U+00A0 (docs/CONTENT-STYLE.md §4)`;
      return { path, code: 'figure-join', detail };
    }),
  );
}
