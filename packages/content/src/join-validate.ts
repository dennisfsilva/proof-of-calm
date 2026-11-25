// A currency code joined to its figure and a form's name joined to its number by a no-break space
// (docs/CONTENT-STYLE.md §4), for percent-validate.ts. Pure; relative imports name their .ts files, so that Node runs
// the CLI without a build step.
import { printedGap, printedText } from './percent-gap.ts';
import type { Problem } from './problem.ts';
import { FILE_ONLY_PROFILE_TEXT, sourceTitles } from './profile-texts.ts';
import type { CountryProfile } from './schema/jurisdiction.ts';

const NBSP = String.fromCodePoint(0xa0);
const NB_HYPHEN = String.fromCodePoint(0x2011);
/** A URL in prose: its figures (`n-23-27.pdf`) and percent-escapes are a path, so the checks here read the pieces
 * of a text between its URLs each on its own, and percent-validate.ts reads the text with each URL replaced by a
 * space. No capture group, so that `split` returns no part of a URL. */
export const URL_IN_TEXT = /https?:\/\/\S+/g;
// The run between the two parts of every join, read with R7's gap class (`WRITTEN_GAP` in module-counts.ts): white
// space (`\s`), format characters (`\p{Cf}`), control characters (`\p{Cc}`) and default-ignorable code points, a mark,
// a letter or an unassigned one among them (U+FE0F, U+3164, U+2065). `joined` refuses the run unless it is a lone
// no-break space, so a no-break space beside any other character of the run is refused too (beside an ordinary space a
// line still breaks at that space). Any other character between them ends the run, so that pair is not read.
const SPACE = String.raw`[\s\p{Cf}\p{Cc}\p{Default_Ignorable_Code_Point}]`;
const RUN = `(${SPACE}+)`;
// The ISO codes the live profiles write beside a figure, and the words that name a form or one of its boxes.
const CODE = '(EUR|GBP|USD)';
const FORM =
  '((?:[Aa]nexo|[Aa]nnexe?|[Bb]ox(?:es)?|[Cc]ampo|[Ff]ield|[Ff]orm|[Ff]ormulaire|[Ff]ormulário|[Mm]odelo|[Mm]odello|[Qq]uadro|[Ss]chedule)s?)';
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
// A code after a figure is that figure's only when no figure follows it across a run: in `art. 33.1 EUR 1000` the code
// is 1000's. Each pair takes its first part and its run and reads its second part in a lookahead, so that, joined or
// refused, it leaves that part to the next pair (`EUR 100 USD` is two pairs).
const JOINS = new RegExp(
  [
    `${CODE_BEFORE}${CODE}${RUN}(?=${FIGURE})`,
    String.raw`(?<![\d.,])${FIGURE}${RUN}(?=${CODE}${CODE_AFTER}(?!${SPACE}*\d))`,
    `${NOT_IN_WORD}${FORM}${RUN}(?=${NUMBER})`,
  ].join('|'),
  'gu',
);

// The prose joins of a language (docs/CONTENT-STYLE.md §4): a closed list of law names, taken from a census of every
// profile, its month names, with the word that links a date's parts where the language writes one (`1 de janeiro
// de 2023`), and its unit words where it has any, each joined to the figure before it (`365 days`, `2.º Suplemento`;
// decided 2026-11-18). A language without an entry gets the code and form joins only. `dayPoint` reads a date's day
// with the point a German date writes after it (`15. März 2027`).
type ProseJoins = { names: RegExp; months: RegExp; linker?: string; units?: RegExp; dayPoint?: true };
const ENGLISH_NAMES =
  /§§?|[Aa]rts?\.|[Aa]rticles?|[Ss]ections?|s{1,2}\.|[Nn]os?\.|n\.ºs?|n°|\(EU\)|Orden|Nr\.|c\.|[Ss]entence|[Pp]aragraph|Part|Lei|Ley|Law|L\.|Decreto-Lei|D\.Lgs\.|BGBl\.|TCA|TCGA|SolZG|Act|Bill|Budget|Belastingplan|BMF|Circolare|Notice|Topic|Publication|Pub\.|Proc\.|PIV|Série/u;
const PROSE_JOINS: Readonly<Record<string, ProseJoins>> = {
  en: {
    names: ENGLISH_NAMES,
    // en-GB's long and short months, with `Sept` as en-GB writes it; counted only when capitalised (`may`).
    months:
      /January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec/u,
    units: /days?|weeks?|months?|years?/u,
  },
  // D6 (2026-11-18), from the census of the pt-PT overlays, with English's names, which a translation keeps where the
  // source language's law is cited (`Topic 409`, `Circolare 30/E`, `c. 1`); months in lower case (CONTENT-STYLE §9).
  // `(UE)` is pt-PT's `(EU)` before a regulation's number. A `de` before a bare year (`de 2023`) is no date, as
  // English's word before a year is not.
  // A source title's `processo 28969`; English's list holds `PIV` and `Série`, which English cites as written.
  'pt-PT': {
    names: new RegExp(
      `${/[Aa]rtigos?|[Ss]ecção|[Ff]rase|[Pp]arágrafo|[Ee]xemplo|[Cc]ódigo|\(UE\)|[Pp]rocesso/u.source}|${ENGLISH_NAMES.source}`,
      'u',
    ),
    months: /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/u,
    linker: 'de',
    // `Suplemento` only after an ordinal figure (`2.º Suplemento`, CONTENT-STYLE §9): `2 Suplemento` is no unit.
    units: new RegExp(String.raw`dias?|semanas?|mês|meses|anos?|(?<=\d\.º${SPACE}+)Suplemento`, 'u'),
  },
  // D2 of #486 (2026-11-25), for the German profile overlays: German's citation names with English's, which a
  // translation keeps where another country's law is cited; months long and short as lib/format writes them in de,
  // the day with its point; nouns capitalised, so a lower-case word is never read as a month or a unit.
  de: {
    names: new RegExp(`${/§§?|Abs\.|Satz|Nr\.|Art\./u.source}|${ENGLISH_NAMES.source}`, 'u'),
    months:
      /Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan\.|Feb\.|Apr\.|Aug\.|Sept\.|Okt\.|Nov\.|Dez\./u,
    units: /Tage?|Tagen|Tages|Wochen?|Monate?|Monaten|Monats|Jahre?|Jahren|Jahres|Stunden?|Minuten?/u,
    dayPoint: true,
  },
  // Decided 2026-11-18, for the source titles only: each language's names from a census of its own titles, without
  // English's; its months in lower case, all twelve. They add no unit word, but their titles are read with every
  // language's unit words (`UNITS` below), so `Durante 2 semanas` with a space is a `figure-join`.
  es: {
    names: /Ley|Real Decreto|Orden|art\./u,
    months: /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/u,
    linker: 'de',
  },
  fr: {
    names: /LOI n°|article/u,
    months: /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/u,
  },
  // `Circolare` and `Decreto` stand before `n.` or a title in Italy's, never before a number.
  it: {
    names: /Legge|n\.|art\.|fascicolo/u,
    months: /gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre/u,
  },
};
// Every language's unit words, read in every text a language with lists writes: a profile quotes its country's law in
// that law's language (`365 dias` in Portugal's English card; decided 2026-11-18). Two closed lists make one closed list.
const UNITS = new RegExp(
  Object.values(PROSE_JOINS)
    .flatMap(({ units }) => (units === undefined ? [] : [units.source]))
    .join('|'),
  'u',
);
const WJ = String.fromCodePoint(0x2060);
// A law's number: digits first, capitals before a slash and a digit (`HAC/277/2026`), or a roman numeral (`Série I`),
// then letters, digits, and points, slashes or hyphens between them, a hyphen-minus with the U+2060 after it
// (`24‑D/2022`, `2026-534`).
const LAW_NUMBER = String.raw`(?:\d[\d\p{L}]*|\p{Lu}+(?=/\d)|[IVXLC]+(?![\p{L}\d]))(?:[./‑-]${WJ}?[\d\p{L}]+)*`;
// A hyphen-minus in a law's number beside a letter, with no U+2060 after it (`24-D/2022`); one between two digits is
// HYPHENED's.
const OPEN_LAW_HYPHEN = new RegExp(`(?<!\\d)-(?!${WJ})|-(?![\\d${WJ}])`, 'u');
// A figure, an ordinal's (`2.º`) included, and the unit word after it.
const UNIT_FIGURE = String.raw`(?<![\p{L}\d.,])(\d+(?:[.,]\d+)*(?:\.º)?)`;
// A citation's brackets after its figure (`55(1)(d)`, `1(j)(3)(ii)`), two or more, each pair to meet with U+2060.
const CITATION = new RegExp(String.raw`\d+\([\dA-Za-z]{1,4}\)(?:${WJ}?\([\dA-Za-z]{1,4}\))+`, 'gu');
// The gap between two parts of a date: a run, or a run, the linker and a run; without a linker its two groups match
// nothing, so that every language's dates have the same groups.
const link = (linker?: string) => (linker === undefined ? `${RUN}()()` : `${RUN}(${linker})${RUN}`);
const prose = ({ names, months, linker, dayPoint }: ProseJoins) => ({
  names: new RegExp(String.raw`(?<![\p{L}\d.§])(${names.source})${RUN}(${LAW_NUMBER})`, 'gu'),
  units: new RegExp(String.raw`${UNIT_FIGURE}${RUN}(${UNITS.source})(?![\p{L}\d])`, 'gu'),
  // `D Month YYYY`, `D Month` and `Month YYYY`, `D. Monat YYYY` with the day's point, or `D de M de YYYY` with a
  // linker; a month alone is no date.
  dates: new RegExp(
    String.raw`(?<![\p{L}\d.,])(?:(\d{1,2}${dayPoint ? String.raw`\.` : ''})${link(linker)})?(${months.source})(?![\p{L}\d])(?:${link(linker)}(\d{4})(?!\d))?`,
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
// The Latin ordinal suffixes the profiles' laws write after a number or a single letter (`9-bis`, `c-sexies`), a closed
// list, each after a hyphen-minus with no U+2060 after it: text a screen shows writes U+2011 (`9‑bis`), a source's title
// a hyphen-minus and U+2060 (docs/CONTENT-STYLE.md §4). One inside a law name's number is that name's check.
const ORDINAL_SUFFIX = new RegExp(
  String.raw`(?<![\p{L}\d])(?:\d+|\p{L})-(?!${WJ})(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)(?![\p{L}\d])`,
  'gu',
);

// A quoted text and a gap print by every code point they hold (percent-gap.ts), two spaces as `U+0020 U+0020`.
const quoted = (text: string) => `"${printedText(text, [])}"`;
const joined = (path: string, field: string, pair: string, figure: string, gap: string): Problem[] =>
  gap === NBSP
    ? []
    : [
        {
          path,
          code: 'figure-join',
          detail: `${field}: ${pair} ${quoted(figure)} are joined by ${printedGap(gap, []).trimEnd()}, not U+00A0 (docs/CONTENT-STYLE.md §4)`,
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
  if (linker === '') return joined(path, field, `the ${left} ${quoted(before)} and its ${right}`, after, gap);
  return [
    ...joined(path, field, `the ${left} ${quoted(before)} and its linker`, linker, gap),
    ...joined(path, field, `the linker ${quoted(linker)} and its ${right}`, after, linkerGap),
  ];
}

/** A language's law names and date parts not joined by U+00A0, and its dashes and hyphens between figures without U+2060. */
function proseProblems(path: string, field: string, text: string, language: string): Problem[] {
  const lists = Object.hasOwn(PROSE_JOINS, language) ? PROSE_JOINS[language] : undefined;
  if (lists === undefined) return [];
  const { names, dates, units } = prose(lists);
  const named = [...text.matchAll(names)];
  // Where each law name's number starts and ends in the text.
  const numbers = named.map(({ index, 1: name = '', 2: gap = '', 3: number = '' }) => {
    const start = index + name.length + gap.length;
    return [start, start + number.length] as const;
  });
  const inNumber = (at: number) => numbers.some(([start, end]) => at >= start && at < end);
  return [
    ...named.flatMap(([, name = '', gap = '', number = '']) => [
      ...joined(path, field, `the name ${quoted(name)} and its number`, number, gap),
      ...(OPEN_LAW_HYPHEN.test(number) ? [hyphenProblem(path, field, number)] : []),
    ]),
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
      const detail = `${field}: the range ${quoted(range)} can break after its dash (docs/CONTENT-STYLE.md §4)`;
      return { path, code: 'range-join', detail };
    }),
    ...[...text.matchAll(HYPHENED)].flatMap(([figure]) =>
      OPEN_HYPHEN.test(figure) ? [hyphenProblem(path, field, figure)] : [],
    ),
    ...[...text.matchAll(ORDINAL_SUFFIX)].flatMap(({ 0: figure, index }) =>
      inNumber(index) ? [] : [hyphenProblem(path, field, figure)],
    ),
    ...[...text.matchAll(units)].flatMap(([, figure = '', gap = '', unit = '']) =>
      joined(path, field, `the figure ${quoted(figure)} and its unit`, unit, gap),
    ),
    ...[...text.matchAll(CITATION)].flatMap(([citation]): Problem[] => {
      if (!citation.includes(')(')) return [];
      const detail = `${field}: the citation ${quoted(citation)} can break between its brackets (docs/CONTENT-STYLE.md §4)`;
      return [{ path, code: 'citation-join', detail }];
    }),
  ];
}

const hyphenProblem = (path: string, field: string, figure: string): Problem => ({
  path,
  code: 'range-join',
  detail: `${field}: the range or number ${quoted(figure)} can break after its hyphen (docs/CONTENT-STYLE.md §4)`,
});

/** Each source title's joins, read in the language its `lang` names: `en` as English, `pt` as pt-PT, `es`, `fr` and
 * `it` with their own lists, `nl` with the code and form joins only; a title in any other language stays unchecked
 * until that language has its lists. A title of any language never holds U+2011: it keeps the published hyphen-minus
 * (docs/CONTENT-STYLE.md §4). */
const TITLE_LANGUAGES: Readonly<Record<string, string>> = {
  en: 'en',
  pt: 'pt-PT',
  es: 'es',
  fr: 'fr',
  it: 'it',
  nl: 'nl',
};
export const titleJoinProblems = (path: string, profile: CountryProfile): Problem[] =>
  sourceTitles(profile).flatMap(([field, text, lang]) => {
    const language = Object.hasOwn(TITLE_LANGUAGES, lang) ? TITLE_LANGUAGES[lang] : undefined;
    const detail = `${field}: the title ${quoted(text)} holds U+2011; a source's title keeps the published U+002D, with \
U+2060 after it where range-join asks for one (docs/CONTENT-STYLE.md §4)`;
    return [
      ...(text.includes(NB_HYPHEN) ? [{ path, code: 'range-join', detail }] : []),
      ...(language === undefined ? [] : joinProblems(path, [[field, text]], language)),
    ];
  });

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
    const pair =
      code === undefined ? `the name ${quoted(form ?? '')} and its number` : `${quoted(code)} and its figure`;
    return joined(path, field, pair, figure, gap);
  });
}
