// How a check's detail prints the gap between a figure and its sign (ADR-0057's Corrections, docs/CONTENT-STYLE.md §4).
// The overlay check and a module's figure check both read it here, so a gap prints one way in every detail.

const codePoint = (char: string) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')} `;

/**
 * The gap as a detail prints it: as written when it is one of the joiners `shown` holds, else every character by its
 * code point, each followed by a space, the ordinary space as U+0020, so that no space reads as the separator
 * (`40U+2060 U+0020 ‰`).
 */
export const printedGap = (gap: string, shown: readonly string[]) =>
  shown.includes(gap) ? gap : [...gap].map(codePoint).join('');
