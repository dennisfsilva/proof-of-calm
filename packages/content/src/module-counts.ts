// A Learn module's counts and their nouns (docs/CONTENT-STYLE.md §4, R7): a figure before a noun a closed list names is
// joined to it by exactly one U+00A0, so that no line ends between them. The list holds the counts the modules write
// and the 25z probe joined, in Calm Sans at the Learn sheet's paragraph styles, in Chromium and WebKit, 240 to 400 px,
// at 16/24 and 20/30 px. B's count (falls, quedas) stays off it: R6 in module-figures.ts reads that one. Years (YEAR
// below), dates, amounts and unlisted nouns are not counts here.
import { GAP, pageSpaces } from './module-figures.ts';
import { printedGap, printedText } from './percent-gap.ts';
import type { Problem } from './problem.ts';

type Language = 'en' | 'pt-PT';
const NBSP = String.fromCodePoint(0xa0);

// Each noun as an alternation; a space inside a noun is any run of white space, as a source line break writes it.
const NOUNS: Readonly<Record<Language, string>> = {
  en: 'blocks|data points|inputs|components|indexes|bitcoins|episodes|start months|countries|completed cycles|cycles|parts|signs',
  'pt-PT': 'blocos|observações|componentes|índices|bitcoins|países|ciclos|partes|sinais',
};
const nouns = (language: Language) => NOUNS[language].replaceAll(' ', '\\s+');

/** The listed nouns of each language, each matched whole and in any case. */
export const COUNT_NOUNS: Readonly<Record<Language, RegExp>> = {
  en: new RegExp(`^(?:${nouns('en')})$`, 'iu'),
  'pt-PT': new RegExp(`^(?:${nouns('pt-PT')})$`, 'iu'),
};

// A figure no letter, mark or digit touches, its groups split by a comma, a dot or U+00A0 (`750,000`, `210 000`),
// B's gap, and a listed noun no letter, mark or digit continues.
const EDGE = '[\\p{L}\\p{M}\\p{N}]';
const COUNT = (language: Language) =>
  new RegExp(`(?<!${EDGE})(?<count>\\p{N}+(?:[.,${NBSP}]\\p{N}+)*)${GAP}(?<noun>${nouns(language)})(?!${EDGE})`, 'giu');
// Four ASCII digits from 1900 to 2099 with no group separator are a year (`the 2017 and 2021 cycles`), never a count;
// a count written like one (`2016 blocks`) is left unread with them.
const YEAR = /^(?:19|20)[0-9]{2}$/u;

/** Each text's counts before a listed noun whose gap is not exactly one U+00A0 (`figure-join`), by its field. */
export function moduleCountProblems(
  path: string,
  texts: readonly (readonly [field: string, text: string])[],
  language: Language,
): Problem[] {
  return texts.flatMap(([field, text]) =>
    [...text.matchAll(COUNT(language))].flatMap(({ groups }) => {
      const { count = '', gap = '', noun = '' } = groups ?? {};
      if (gap === NBSP || YEAR.test(count)) return [];
      const shown = printedText(pageSpaces(noun), []);
      const detail = `${field}: the count "${printedText(count, [NBSP])}" and its noun "${shown}" are joined by \
${printedGap(gap, []).trim()}, not U+00A0; write one U+00A0 between them; R7 (docs/CONTENT-STYLE.md §4)`;
      return [{ path, code: 'figure-join', detail }];
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
 * text. Body and front matter read alike, so a hidden break beside a noun is refused in either.
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
