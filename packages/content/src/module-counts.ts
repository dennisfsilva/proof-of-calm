// A Learn module's counts and their nouns (docs/CONTENT-STYLE.md §4, R7): a figure before a noun a closed list names is
// joined to it by exactly one U+00A0, so that no line ends between them. The list holds the counts the modules write
// and the 25z probe joined, in Calm Sans at the Learn sheet's paragraph styles, in Chromium and WebKit, 240 to 400 px,
// at 16/24 and 20/30 px. B's count (falls, quedas) stays off it: R6 in module-figures.ts reads that one. Years (YEAR
// below), dates, amounts and unlisted nouns are not counts here. R7 finds a count and its noun as the reader reads
// them, without default-ignorable code points. It judges the gap between them, and the word edges around them, as the
// file writes it. A hidden character inside a count or a noun never hides the pair, and one in the gap is always seen.
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

// A figure, its groups split by a comma, a dot or U+00A0 (`750,000`, `210 000`), B's gap or none, and a listed noun;
// matched on the reader's view (readerView). No letter, mark or digit may touch the figure or continue the noun as the
// file writes them (EDGE, judged in moduleCountProblems); no noun is the start of another, so judging the noun's end
// after the match loses no alternative.
const EDGE = /^[\p{L}\p{M}\p{N}]$/u;
const COUNT = (language: Language) =>
  new RegExp(`(?<count>\\p{N}+(?:[.,${NBSP}]\\p{N}+)*)${GAP}?(?<noun>${nouns(language)})`, 'giu');
// Four ASCII digits from 1900 to 2099 with no group separator are a year (`the 2017 and 2021 cycles`), never a count;
// a count written like one (`2016 blocks`) is left unread with them.
const YEAR = /^(?:19|20)[0-9]{2}$/u;

const IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;
/**
 * A text as the reader reads it, without its default-ignorable code points, walked by code point (U+E0001 is two
 * UTF-16 units), and for each UTF-16 unit of it the index of that unit in the written text.
 */
const readerView = (written: string) => {
  let text = '';
  const at: number[] = [];
  let index = 0;
  for (const point of written) {
    if (!IGNORABLE.test(point)) {
      text += point;
      for (let unit = 0; unit < point.length; unit += 1) at.push(index + unit);
    }
    index += point.length;
  }
  return { text, at };
};

// Whether the written code point that ends at `at`, or the one that starts there, is a letter, mark or digit; a
// surrogate pair is one code point, and the text's start and end are no edge.
const edgeBefore = (written: string, at: number) => EDGE.test([...written.slice(Math.max(0, at - 2), at)].at(-1) ?? '');
const edgeAfter = (written: string, at: number) => EDGE.test(String.fromCodePoint(written.codePointAt(at) ?? 0x20));

/**
 * Each count before a listed noun in the reader's view of `written`, with the written index where its count starts,
 * its gap starts, its noun starts and its noun ends, kept only when no letter, mark or digit touches the count or
 * continues the noun as written. A match refused there is tried again a code point on, as a lookbehind would.
 */
function* writtenPairs(written: string, language: Language) {
  const reader = readerView(written);
  // The written index where the reader's unit `at` starts, and where the one before `end` ends.
  const from = (at: number) => reader.at[at] ?? written.length;
  const to = (end: number) => from(end - 1) + 1;
  const pattern = COUNT(language);
  for (let found = pattern.exec(reader.text); found !== null; found = pattern.exec(reader.text)) {
    const { count = '', gap = '', noun = '' } = found.groups ?? {};
    const [countEnd, nounStart] = [found.index + count.length, found.index + count.length + gap.length];
    const at = { count: from(found.index), gap: to(countEnd), noun: from(nounStart), end: to(nounStart + noun.length) };
    if (!edgeBefore(written, at.count) && !edgeAfter(written, at.end)) yield { count, at };
    else pattern.lastIndex = found.index + ([...count][0]?.length ?? 1);
  }
}

/**
 * Each text's counts before a listed noun whose gap is not exactly one U+00A0 (`figure-join`), by its field: the count
 * and its noun found as the reader reads them, the gap and the word edges judged as the file writes them, every code
 * point there, a default-ignorable one included. A count written against its noun with nothing between them is not
 * reported.
 */
export function moduleCountProblems(
  path: string,
  texts: readonly (readonly [field: string, text: string])[],
  language: Language,
): Problem[] {
  return texts.flatMap(([field, written]) =>
    [...writtenPairs(written, language)].flatMap(({ count, at }) => {
      const writtenGap = written.slice(at.gap, at.noun);
      if (writtenGap === '' || writtenGap === NBSP || YEAR.test(count)) return [];
      const writtenCount = written.slice(at.count, at.gap);
      const writtenNoun = written.slice(at.noun, at.end);
      const shown = printedText(pageSpaces(writtenNoun), []);
      const detail = `${field}: the count "${printedText(writtenCount, [NBSP])}" and its noun "${shown}" are joined by \
${printedGap(writtenGap, []).trim()}, not U+00A0; replace the gap with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)`;
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
