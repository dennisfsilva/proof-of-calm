// A currency code joined to its figure and a form's name joined to its number by a no-break space
// (docs/CONTENT-STYLE.md §4), for percent-validate.ts. Pure; relative imports name their .ts files, so that Node runs
// the CLI without a build step.
import type { Problem } from './problem.ts';
import { FILE_ONLY_PROFILE_TEXT } from './profile-texts.ts';

const NBSP = String.fromCodePoint(0xa0);
/** A URL in prose: its figures (`n-23-27.pdf`) and percent-escapes are a path, so the checks here read the pieces
 * of a text between its URLs each on its own, and percent-validate.ts reads the text with each URL replaced by a
 * space. No capture group, so that `split` returns no part of a URL. */
export const URL_IN_TEXT = /https?:\/\/\S+/g;
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
// profile, and its month names, with the word that links a date's parts where the language writes one (`1 de janeiro
// de 2023`). A language without an entry gets the code and form joins only.
type ProseJoins = { names: RegExp; months: RegExp; linker?: string };
const ENGLISH_NAMES =
  /§§?|[Aa]rts?\.|[Aa]rticles?|[Ss]ections?|s{1,2}\.|[Nn]os?\.|n\.ºs?|n°|\(EU\)|Orden|Nr\.|c\.|[Ss]entence|[Pp]aragraph|Part|Lei|Ley|Law|L\.|Decreto-Lei|D\.Lgs\.|BGBl\.|TCA|TCGA|SolZG|Act|Bill|Budget|Belastingplan|BMF|Circolare|Notice|Topic|Publication|Pub\.|Proc\./u;
const PROSE_JOINS: Readonly<Record<string, ProseJoins>> = {
  en: {
    names: ENGLISH_NAMES,
    // en-GB's long and short months, with `Sept` as en-GB writes it; counted only when capitalised (`may`).
    months:
      /January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec/u,
  },
  // D6 (2026-11-18), from the census of the pt-PT overlays, with English's names, which a translation keeps where the
  // source language's law is cited (`Topic 409`, `Circolare 30/E`, `c. 1`); months in lower case (CONTENT-STYLE §9).
  // A `de` before a bare year (`de 2023`) is no date, as English's word before a year is not.
  'pt-PT': {
    names: new RegExp(
      `${/[Aa]rtigos?|[Ss]ecção|[Ff]rase|[Pp]arágrafo|[Ee]xemplo|[Cc]ódigo/u.source}|${ENGLISH_NAMES.source}`,
      'u',
    ),
    months: /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/u,
    linker: 'de',
  },
};
const WJ = String.fromCodePoint(0x2060);
// A law's number: digits first, or capitals before a slash and a digit (`HAC/277/2026`), then letters, digits, and
// points, slashes or hyphens between them, a hyphen-minus with the U+2060 after it (`24‑D/2022`, `2026-534`).
const LAW_NUMBER = String.raw`(?:\d[\d\p{L}]*|\p{Lu}+(?=/\d))(?:[./‑-]${WJ}?[\d\p{L}]+)*`;
// The gap between two parts of a date: a space, or a space, the linker and a space; without a linker its two groups
// match nothing, so that every language's dates have the same groups.
const link = (linker?: string) => (linker === undefined ? String.raw`(\s+)()()` : String.raw`(\s+)(${linker})(\s+)`);
const prose = ({ names, months, linker }: ProseJoins) => ({
  names: new RegExp(String.raw`(?<![\p{L}\d.§])(${names.source})(\s+)(${LAW_NUMBER})`, 'gu'),
  // `D Month YYYY`, `D Month` and `Month YYYY`, or `D de M de YYYY` with a linker; a month alone is no date.
  dates: new RegExp(
    String.raw`(?<![\p{L}\d.,])(?:(\d{1,2})${link(linker)})?(${months.source})(?![\p{L}\d])(?:${link(linker)}(\d{4})(?!\d))?`,
    'gu',
  ),
});
// Two figures joined by an en dash with no U+2060 after it. A figure starts after anything but a digit, or a point or
// a comma after one: a point after a letter ends an abbreviation (`s.104–105`, `Rev.Proc.2025-32`).
const DIGITS = String.raw`\d+(?:[.,]\d+)*`;
const STARTS = String.raw`(?<!\d)(?<!\d[.,])`;
const RANGE = new RegExp(String.raw`${STARTS}${DIGITS}–(?!${WJ})${DIGITS}`, 'gu');
// S4 (2026-11-17): figures joined by hyphen-minus (`2026-27`, `2026-534`, `02-01-03`), each hyphen to take U+2060,
// since Chromium and WebKit break after it; a hyphen beside a letter (`COVID-19`, `e-money`) is left out.
const HYPHENED = new RegExp(String.raw`${STARTS}${DIGITS}(?:-${WJ}?${DIGITS})+`, 'gu');
const OPEN_HYPHEN = new RegExp(`-(?!${WJ})`, 'u');

const codePoints = (text: string) =>
  [...new Set(text)].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);
const escaped = (code: string) => `${String.fromCodePoint(0x5c)}u${code}`;
const typed = (text: string) => JSON.stringify(text).replaceAll(NBSP, escaped('00a0')).replaceAll(WJ, escaped('2060'));
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

/** The gap between two parts of a date (`the day "1" and its month`), or with a linker the gaps on its either side
 * (`the day "1" and its linker`, `the linker "de" and its month`). */
function dateGaps(
  path: string,
  field: string,
  [left, before]: [string, string],
  [right, after]: [string, string],
  gap: string,
  linker: string,
  linkerGap: string,
): Problem[] {
  if (linker === '') return joined(path, field, `the ${left} ${typed(before)} and its ${right}`, after, gap);
  return [
    ...joined(path, field, `the ${left} ${typed(before)} and its linker`, linker, gap),
    ...joined(path, field, `the linker ${typed(linker)} and its ${right}`, after, linkerGap),
  ];
}

/** A language's law names and date parts not joined by U+00A0, and its dashes and hyphens between figures without U+2060. */
function proseProblems(path: string, field: string, text: string, language: string): Problem[] {
  const lists = Object.hasOwn(PROSE_JOINS, language) ? PROSE_JOINS[language] : undefined;
  if (lists === undefined) return [];
  const { names, dates } = prose(lists);
  return [
    ...[...text.matchAll(names)].flatMap(([, name = '', gap = '', number = '']) =>
      joined(path, field, `the name ${typed(name)} and its number`, number, gap),
    ),
    ...[...text.matchAll(dates)].flatMap(([, day, dayGap = '', dayLink = '', monthGap = '', month = '', ...rest]) => {
      const [yearGap = '', yearLink = '', linkGap = '', year] = rest;
      return [
        ...(day === undefined ? [] : dateGaps(path, field, ['day', day], ['month', month], dayGap, dayLink, monthGap)),
        ...(year === undefined
          ? []
          : dateGaps(path, field, ['month', month], ['year', year], yearGap, yearLink, linkGap)),
      ];
    }),
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
 * §4), then the prose joins of `language`, but in the file-only text, which does not wrap, and in a URL. The detail
 * names the pair and the space between them, or the range, never a text to write.
 */
export function joinProblems(path: string, texts: readonly [string, string][], language = 'en'): Problem[] {
  return texts.flatMap(([field, text]) => {
    if (field === FILE_ONLY_PROFILE_TEXT) return [];
    // Each piece between URLs on its own, so that no join is read across a URL; URL_IN_TEXT has no capture group,
    // so split returns no part of a URL.
    return text
      .split(URL_IN_TEXT)
      .flatMap((piece) => [...codeProblems(path, field, piece), ...proseProblems(path, field, piece, language)]);
  });
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
