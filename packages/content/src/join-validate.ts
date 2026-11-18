// A currency code joined to its figure and a form's name joined to its number by a no-break space
// (docs/CONTENT-STYLE.md §4), for percent-validate.ts. Pure; relative imports name their .ts files, so that Node runs
// the CLI without a build step.
import type { Problem } from './problem.ts';
import { FILE_ONLY_PROFILE_TEXT } from './profile-texts.ts';

const NBSP = String.fromCodePoint(0xa0);
// Any white space but the no-break space: an ordinary space, a tab, a line break, a narrow no-break space.
const GAP = String.raw`((?:(?!${NBSP})\s)+)`;
// The ISO codes the live profiles write beside a figure, and the words that name a form or one of its boxes.
const CODE = '(EUR|GBP|USD)';
const FORM =
  '((?:[Aa]nexo|[Aa]nnexe?|[Bb]ox(?:es)?|[Cc]ampo|[Ff]ield|[Ff]orm|[Mm]odelo|[Mm]odello|[Qq]uadro|[Ss]chedule)s?)';
// A money figure, its groups joined by a point, a comma or a space before three digits (an ordinary space between
// groups is `number-group`'s), and a form's number: digits with their letters, points and hyphens (`9.4`, `1099-DA`,
// `3AN`), or capitals with their digits (`G1`, `RW`, `D-100`), never a word (`Modello Redditi`).
const FIGURE = String.raw`(\d+(?:(?:[.,]|\s(?=\d{3}(?!\d)))\d+)*)`;
const NUMBER = String.raw`(\d[\dA-Za-z]*(?:[.-][\dA-Za-z]+)*|[A-Z][A-Z\d]*(?:-[A-Za-z\d]+)*(?!\p{L}))`;
const NOT_IN_WORD = String.raw`(?<![\p{L}\d])`;
// A code joined to a letter by a hyphen (`EUR-denominated`, `non-EUR`) or to another code by a slash (`USD/EUR`,
// `BTC/USD`) is part of a word or a pair, not a code beside its figure; a slash and a unit word (`5 EUR/month`) is not.
const CODE_BEFORE = String.raw`${NOT_IN_WORD}(?<!\p{L}-)(?<!\p{Lu}{3}/)`;
const CODE_AFTER = String.raw`(?![\p{L}\d])(?!-\p{L})(?!/\p{Lu}{3})`;
// A code after a figure is that figure's only when no figure follows it: in `art. 33.1 EUR 1000` the code is 1000's.
const JOINS = new RegExp(
  [
    `${CODE_BEFORE}${CODE}${GAP}${FIGURE}`,
    String.raw`(?<![\d.,])${FIGURE}${GAP}${CODE}${CODE_AFTER}(?!\s?\d)`,
    `${NOT_IN_WORD}${FORM}${GAP}${NUMBER}`,
  ].join('|'),
  'gu',
);

// The prose joins of a language (docs/CONTENT-STYLE.md §4): a closed list of law names, taken from a census of every
// profile, and its month names. A language without an entry gets the code and form joins only.
const PROSE_JOINS: Readonly<Record<string, { names: RegExp; months: RegExp }>> = {
  en: {
    names:
      /§§?|[Aa]rts?\.|[Aa]rticles?|[Ss]ections?|s{1,2}\.|[Nn]os?\.|n\.ºs?|n°|\(EU\)|Orden|Nr\.|c\.|[Ss]entence|[Pp]aragraph|Part|Lei|Ley|Law|L\.|Decreto-Lei|D\.Lgs\.|BGBl\.|TCA|TCGA|SolZG|Act|Bill|Budget|Belastingplan|BMF|Circolare|Notice|Topic|Publication|Pub\.|Proc\./u,
    // en-GB's long and short months, with `Sept` as en-GB writes it; counted only when capitalised (`may`).
    months:
      /January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec/u,
  },
};
const WJ = String.fromCodePoint(0x2060);
// A law's number: digits first, or capitals before a slash and a digit (`HAC/277/2026`), then letters, digits, and
// points, slashes or hyphens between them, a hyphen-minus with the U+2060 after it (`24‑D/2022`, `2026-534`).
const LAW_NUMBER = String.raw`(?:\d[\d\p{L}]*|\p{Lu}+(?=/\d))(?:[./‑-]${WJ}?[\d\p{L}]+)*`;
const prose = ({ names, months }: { names: RegExp; months: RegExp }) => ({
  names: new RegExp(String.raw`(?<![\p{L}\d.§])(${names.source})(\s+)(${LAW_NUMBER})`, 'gu'),
  // `D Month YYYY`, `D Month` and `Month YYYY`; a month alone is no date.
  dates: new RegExp(
    String.raw`(?<![\p{L}\d.,])(?:(\d{1,2})(\s+))?(${months.source})(?![\p{L}\d])(?:(\s+)(\d{4})(?!\d))?`,
    'gu',
  ),
});
// Two figures joined by an en dash with no U+2060 after it.
const DIGITS = String.raw`\d+(?:[.,]\d+)*`;
const RANGE = new RegExp(String.raw`(?<![\d.,])${DIGITS}–(?!${WJ})${DIGITS}`, 'gu');
// S4 (2026-11-17): figures joined by hyphen-minus (`2026-27`, `2026-534`, `02-01-03`), each hyphen to take U+2060,
// since Chromium and WebKit break after it; a hyphen beside a letter (`COVID-19`, `e-money`) is left out.
const HYPHENED = new RegExp(String.raw`(?<![\d.,])${DIGITS}(?:-${WJ}?${DIGITS})+`, 'gu');
const OPEN_HYPHEN = new RegExp(`-(?!${WJ})`, 'u');

const codePoints = (text: string) =>
  [...new Set(text)].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);
const escape = (code: string) => `${String.fromCodePoint(0x5c)}u${code}`;
const typed = (text: string) => JSON.stringify(text).replaceAll(NBSP, escape('00a0')).replaceAll(WJ, escape('2060'));
const joined = (path: string, field: string, pair: string, figure: string, gap: string): Problem[] =>
  gap === NBSP
    ? []
    : [
        {
          path,
          code: 'figure-join',
          detail: `${field}: ${pair} ${typed(figure)} are joined by ${codePoints(gap).join(' ')}, not U+00A0 (docs/CONTENT-STYLE.md §4)`,
        },
      ];

/** A language's law names and date parts not joined by U+00A0, and its dashes and hyphens between figures without U+2060. */
function proseProblems(path: string, field: string, text: string, language: string): Problem[] {
  const lists = Object.hasOwn(PROSE_JOINS, language) ? PROSE_JOINS[language] : undefined;
  if (lists === undefined) return [];
  const { names, dates } = prose(lists);
  return [
    ...[...text.matchAll(names)].flatMap(([, name = '', gap = '', number = '']) =>
      joined(path, field, `the name ${typed(name)} and its number`, number, gap),
    ),
    ...[...text.matchAll(dates)].flatMap(([, day, dayGap = '', month = '', yearGap = '', year]) => [
      ...(day === undefined ? [] : joined(path, field, `the day ${typed(day)} and its month`, month, dayGap)),
      ...(year === undefined ? [] : joined(path, field, `the month ${typed(month)} and its year`, year, yearGap)),
    ]),
    ...[...text.matchAll(RANGE)].map(([range]): Problem => {
      const detail = `${field}: the range ${typed(range)} can break after its dash (docs/CONTENT-STYLE.md §4)`;
      return { path, code: 'range-join', detail };
    }),
    ...[...text.matchAll(HYPHENED)].flatMap(([figure]): Problem[] => {
      if (!OPEN_HYPHEN.test(figure)) return [];
      const detail = `${field}: the range or number ${typed(figure)} can break after its hyphen (docs/CONTENT-STYLE.md §4)`;
      return [{ path, code: 'range-join', detail }];
    }),
  ];
}

/**
 * Each currency code and its figure (`EUR 20 350`, `100 USD`) and each form's name and its number (`Modelo 721`,
 * `Anexo G`) in `texts` joined by anything but U+00A0, so that a line can break between them (docs/CONTENT-STYLE.md
 * §4), then the prose joins of `language`, but in the file-only text, which does not wrap. The detail names the pair
 * and the space between them, or the range, never a text to write.
 */
export function joinProblems(path: string, texts: readonly [string, string][], language = 'en'): Problem[] {
  return texts.flatMap(([field, text]) =>
    field === FILE_ONLY_PROFILE_TEXT
      ? []
      : [...codeProblems(path, field, text), ...proseProblems(path, field, text, language)],
  );
}

function codeProblems(path: string, field: string, text: string): Problem[] {
  return [...text.matchAll(JOINS)].flatMap((match) => {
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
    const pair = code === undefined ? `the name ${typed(form ?? '')} and its number` : `${typed(code)} and its figure`;
    return joined(path, field, pair, figure, gap);
  });
}
