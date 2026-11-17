// The one percentage token of a template's explanation, English or translated (docs/CONTENT-STYLE.md §4 and §9):
// whole digits, an ordinary space, `%`. The figures check's shapes, the token check and the onboarding template step
// all read it here, so every percentage the checks accept is one the app formats
// (docs/research/review-safe-figures.md, amendment 7).
import { paragraphsOf } from './paragraphs.ts';
import type { Problem } from './problem.ts';

/** The joiner between a figure and its `%`: the ordinary space (U+0020). */
export const PERCENT_JOINER = ' ';
/** The joiners a Learn module's text may write between a figure and `%`: the ones the app's withJoiner formats. */
export const MODULE_PERCENT_JOINERS: readonly string[] = [' ', ' '];
const TOKEN = new RegExp(`(\\d+)${PERCENT_JOINER}%`, 'gu');
// A figure and one of the four signs, joined by nothing, any run of white space, or a hyphen: the token or not.
const WRITTEN = /\d+(?<joiner>[\s\u2010\u2011-]*)(?<sign>[%\u066A\uFE6A\uFF05])/gu;

const named = (text: string) =>
  [...text].map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`).join(' ') || 'none';

/** The text with each token written by `format` from its digits, as the app shows a paragraph. */
export const formatPercentTokens = (text: string, format: (digits: string) => string): string =>
  text.replace(TOKEN, (_, digits: string) => format(digits));

// The sentences of a paragraph as the figures check's `sentencesOf` splits them (template-figures.ts imports this
// file, so it cannot be imported here; the test holds the two to one split). A figure holds no `.`, `!` or `?`,
// so it never spans two sentences.
const sentencesIn = (paragraph: string) => paragraph.split(/(?<=[.!?])\s+/u);

/** Each percentage in the paragraphs the app renders (`paragraphsOf`) written other than as the token. */
export const percentTokenProblems = (path: string, field: string, text: string): Problem[] =>
  paragraphsOf(text)
    .flatMap(sentencesIn)
    .flatMap((sentence) =>
      [...sentence.matchAll(WRITTEN)]
        .filter(({ groups: { joiner = '', sign = '' } = {} }) => joiner !== PERCENT_JOINER || sign !== '%')
        .map(({ 0: figure, groups: { joiner = '', sign = '' } = {} }) => {
          const parts = [
            joiner === PERCENT_JOINER ? '' : `${joiner === '' ? 'nothing' : named(joiner)} before its sign`,
            sign === '%' ? '' : `${named(sign)} in place of %`,
          ];
          const what = `"${figure}" has ${parts.filter(Boolean).join(' and ')} in "${sentence}"`;
          const fix = 'write N % with an ordinary space (U+0020) (docs/CONTENT-STYLE.md §4)';
          return { path, code: 'percent-token', detail: `${field}: ${what}; ${fix}` };
        }),
    );
