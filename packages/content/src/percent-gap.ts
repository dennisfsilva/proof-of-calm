// How a check's detail prints a quoted text and the gap between a figure and its sign or its pair (ADR-0057's
// Corrections, docs/CONTENT-STYLE.md §4): by code point for every hidden or look-alike character. The overlay check,
// a module's figure check and the joins check all print here, so a character prints one way in every detail.

const codePoint = (char: string) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')} `;

/**
 * The gap as a detail prints it: as written when it is one of the joiners `shown` holds, else every character by its
 * code point, each followed by a space, the ordinary space as U+0020, so that no space reads as the separator
 * (`40U+2060 U+0020 ‰`).
 */
export const printedGap = (gap: string, shown: readonly string[]) =>
  shown.includes(gap) ? gap : [...gap].map(codePoint).join('');

// Hidden or look-alike: any space separator but U+0020, a format or control character, any default-ignorable code
// point (the class the page reader drops, packages/config/vite/page-blocks.ts), U+2010 and U+2011.
const HIDDEN = /(?! )[\p{Z}\p{Cf}\p{Cc}\p{Default_Ignorable_Code_Point}‐‑]/gu;

/** A quoted text as a detail prints it: each hidden or look-alike character not in `shown` by its code point, as
 * printedGap prints it (`fellU+2009 50 %`), everything else as written. */
export const printedText = (text: string, shown: readonly string[]) =>
  text.replace(HIDDEN, (char) => (shown.includes(char) ? char : codePoint(char)));

/** A quoted text of a Learn module's chart section: as printedText prints it, but a joiner of `joiners` prints as
 * written only directly before a percent sign, and any hidden character a match of the global `joined` covers prints
 * as written too: the places the module check accepts them (`EtherU+00A0 fell 94 %`). */
export const printedPercentText = (text: string, joiners: readonly string[], joined?: RegExp) => {
  const kept = new Set(
    [...(joined === undefined ? [] : text.matchAll(joined))].flatMap(({ 0: match, index }) =>
      Array.from({ length: match.length }, (_, offset) => index + offset),
    ),
  );
  return text.replace(HIDDEN, (char, at: number) =>
    kept.has(at) || (joiners.includes(char) && text[at + 1] === '%') ? char : codePoint(char),
  );
};
