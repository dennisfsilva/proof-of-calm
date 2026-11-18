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

// Hidden or look-alike: any space separator but U+0020, a format or control character, U+2010 and U+2011.
const HIDDEN = /(?! )[\p{Z}\p{Cf}\p{Cc}‐‑]/gu;

/** A quoted text as a detail prints it: each hidden or look-alike character not in `shown` by its code point, as
 * printedGap prints it (`fellU+2009 50 %`), everything else as written. */
export const printedText = (text: string, shown: readonly string[]) =>
  text.replace(HIDDEN, (char) => (shown.includes(char) ? char : codePoint(char)));
