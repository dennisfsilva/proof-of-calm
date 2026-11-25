// A Learn module's counts and their nouns (docs/CONTENT-STYLE.md §4, R7): a figure before a noun a closed list names is
// joined to it by exactly one U+00A0, so that no line ends between them. The list holds the counts the modules write
// and the 25z probe joined, in Calm Sans at the Learn sheet's paragraph styles, in Chromium and WebKit, 240 to 400 px,
// at 16/24 and 20/30 px. B's count (falls, quedas, Rückgänge) stays off it: R6 in module-figures.ts reads that one. Years (YEAR
// below), dates, amounts and unlisted nouns are not counts here. R7 reads the count, the gap and the noun as the
// file writes them. A default-ignorable code point is part of the gap, nothing between two digits of a count or two
// letters of a noun, and never a letter, mark or digit beside either, so a hidden character never hides the pair, and
// one inside a count is refused.
import { pageSpaces } from './paragraphs.ts';
import { printedGap, printedText } from './percent-gap.ts';
import type { Problem } from './problem.ts';

type Language = 'en' | 'pt-PT' | 'de';
const NBSP = String.fromCodePoint(0xa0);
const IGNORABLE = '\\p{Default_Ignorable_Code_Point}';
const HIDDEN = `${IGNORABLE}*`;

// Each noun as an alternation; a space inside a noun is any run of white space, as a source line break writes it.
const NOUNS: Readonly<Record<Language, string>> = {
  en: 'blocks|data points|inputs|components|indexes|bitcoins|episodes|start months|countries|completed cycles|cycles|parts|signs',
  'pt-PT': 'blocos|observações|componentes|índices|bitcoins|países|ciclos|partes|sinais',
  // The dative plurals the modules write too (`in 95 Ländern`); the two-word noun before its last word.
  de: 'Blöcke|Blöcken|Datenpunkte|Datenpunkten|Komponenten|Indizes|Bitcoins|Episoden|Startmonate|Startmonaten|Länder|Ländern|abgeschlossene Zyklen|abgeschlossenen Zyklen|Zyklen|Teile|Teilen|Anzeichen',
};
const LANGUAGES = Object.keys(NOUNS);
/** Whether `language` is one whose count nouns R7 lists, so its modules' counts are read. */
export const isCountLanguage = (language: string): language is Language => LANGUAGES.includes(language);
const nouns = (language: Language) => NOUNS[language].replaceAll(' ', '\\s+');
// The nouns as the file writes them: any default-ignorable code points between two letters or beside a space.
const written = (language: Language) =>
  NOUNS[language]
    .split('|')
    .map((noun) =>
      noun
        .split(' ')
        .map((word) => [...word].join(HIDDEN))
        .join(`${HIDDEN}(?:\\s${HIDDEN})+`),
    )
    .join('|');

/** The listed nouns of each language, each matched whole and in any case. */
export const COUNT_NOUNS: Readonly<Record<Language, RegExp>> = {
  en: new RegExp(`^(?:${nouns('en')})$`, 'iu'),
  'pt-PT': new RegExp(`^(?:${nouns('pt-PT')})$`, 'iu'),
  de: new RegExp(`^(?:${nouns('de')})$`, 'iu'),
};

// A figure, its groups split by a comma, a dot or U+00A0 (`750,000`, `210 000`), R7's gap (B's gap in
// module-figures.ts and every default-ignorable code point), and a listed noun. No letter, mark or digit but a
// default-ignorable one may touch the figure or continue the noun as the file writes them (EDGE).
const EDGE = `(?:(?!${IGNORABLE})[\\p{L}\\p{M}\\p{N}])`;
const WRITTEN_GAP = `(?<gap>[\\s\\p{Cf}\\p{Cc}${IGNORABLE}]+)`;
const FIGURE = `\\p{N}(?:${HIDDEN}\\p{N})*(?:${HIDDEN}[.,${NBSP}]${HIDDEN}\\p{N}(?:${HIDDEN}\\p{N})*)*`;
const COUNT = (language: Language) =>
  new RegExp(`(?<!${EDGE})(?<count>${FIGURE})${WRITTEN_GAP}(?<noun>${written(language)})(?!${EDGE})`, 'giu');
// Four ASCII digits from 1900 to 2099 with no group separator are a year (`the 2017 and 2021 cycles`), never a count;
// a count written like one (`2016 blocks`) is left unread with them.
const YEAR = /^(?:19|20)[0-9]{2}$/u;
const IN_COUNT = new RegExp(IGNORABLE, 'gu');

/**
 * Each text's counts before a listed noun whose gap is not exactly one U+00A0 (`figure-join`), by its field, and each
 * count that holds a default-ignorable code point, U+00A0 gap or not: the count, the gap and the noun as the file
 * writes them. A count written against its noun with nothing between them is not reported.
 */
export function moduleCountProblems(
  path: string,
  texts: readonly (readonly [field: string, text: string])[],
  language: Language,
): Problem[] {
  return texts.flatMap(([field, text]) =>
    [...text.matchAll(COUNT(language))].flatMap(({ groups }) => {
      const { count = '', gap = '', noun = '' } = groups ?? {};
      if (YEAR.test(count)) return [];
      const pair = `the count "${printedText(count, [NBSP])}"`;
      const shown = printedText(pageSpaces(noun), []);
      const held = count.match(IN_COUNT) ?? [];
      return [
        ...(gap === NBSP
          ? []
          : [
              `${pair} and its noun "${shown}" are joined by ${printedGap(gap, []).trim()}, not U+00A0; replace the gap \
with one U+00A0`,
            ]),
        ...(held.length === 0
          ? []
          : [
              `${pair} before its noun "${shown}" holds ${printedGap(held.join(''), []).trim()}; delete \
${held.length === 1 ? 'it' : 'them'}`,
            ]),
      ].map((said) => ({ path, code: 'figure-join', detail: `${field}: ${said}; R7 (docs/CONTENT-STYLE.md §4)` }));
    }),
  );
}

/** A block of the compiled page (packages/config/vite/page-blocks.ts), as far as this check reads it. */
type Block = {
  readonly kind: string;
  readonly text?: string;
  readonly written?: string;
  readonly listNumbers?: readonly number[];
};
const FRONT = ['title', 'idea', 'caveat'] as const;

/**
 * Every text the Learn sheet shows of a module: the front matter's title, idea and caveat as written, then each block
 * of its compiled page of every kind that holds text, as the parser decoded it (`written`, before the page drops a
 * default-ignorable code point, where it dropped one), an ordered list item's shown number before its first block's
 * text. Each is returned as written; moduleCountProblems reads the body and the front matter alike.
 */
export function moduleCountTexts(
  front: Readonly<Partial<Record<string, string>>>,
  page: readonly Block[],
): (readonly [field: string, text: string])[] {
  const fields = FRONT.flatMap((key) => (front[key] === undefined ? [] : [[key, front[key]] as const]));
  const blocks = page.flatMap(({ text, written = text, listNumbers = [] }) =>
    written === undefined ? [] : [['body', `${listNumbers.map((shown) => `${shown}. `).join('')}${written}`] as const],
  );
  return [...fields, ...blocks];
}
