// The one paragraph rule for a template's explanation: the figures check, the paragraph length check and the
// onboarding template step all read it here, so the checker reads the paragraphs the app renders
// (docs/research/review-safe-figures.md, amendment 7).

// The white space CSS collapses inside a paragraph (white-space: normal): space, tab, LF, CR, FF.
const COLLAPSIBLE = /[ \t\n\r\f]+/gu;

/** The paragraphs the app renders from a text: split at a line holding only collapsible white space, each
 *  paragraph's runs of it read as one space, as CSS shows them, none at either end, empty ones dropped. */
export const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n[ \t\r\f]*\n/u)
    .map((paragraph) => paragraph.replace(COLLAPSIBLE, ' ').replace(/^ | $/gu, ''))
    .filter((paragraph) => paragraph !== '');
