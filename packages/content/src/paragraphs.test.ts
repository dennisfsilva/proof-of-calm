import { describe, expect, it } from 'vitest';
import { pageSpaces, paragraphsOf } from './paragraphs.ts';

// The paragraphs the app renders: each a plain <p>, where CSS (white-space: normal) shows every run of space, tab,
// LF, CR or FF as one space. The checker and the template step both read them here, so no split can disagree.
describe('paragraphsOf', () => {
  it.each(['\n\n', '\n \n', '\r\n\r\n', '\n\t\n', '\n\n\n', '\n\n\n\n', '\n\f\n'])(
    '%j ends a paragraph',
    (separator) => {
      expect(paragraphsOf(`A.${separator}B.`)).toEqual(['A.', 'B.']);
    },
  );

  it.each(['\n', '\r\n', '\t', '  '])('%j reads as one space inside a paragraph', (joiner) => {
    expect(paragraphsOf(`A.${joiner}B.`)).toEqual(['A. B.']);
  });

  it('keeps the no-break spaces CSS does not collapse', () => {
    expect(paragraphsOf('Solana fell 97 %.')).toEqual(['Solana fell 97 %.']);
    expect(paragraphsOf('Solana fell 97 %.')).toEqual(['Solana fell 97 %.']);
    expect(paragraphsOf('A.\n \nB.')).toEqual(['A.   B.']);
  });

  it('leaves no empty paragraph for blank lines at either end, or for no text', () => {
    expect(paragraphsOf('\n\n \nA.\n\nB.\n \n\n')).toEqual(['A.', 'B.']);
    expect(paragraphsOf('')).toEqual([]);
    expect(paragraphsOf(' \n\n\t')).toEqual([]);
  });
});

// The 25zb ruling (its point 3 outside R7): a detail quotes a block's spaces with the class paragraphsOf collapses, so
// the two never disagree on which space the page shows as one.
describe('pageSpaces', () => {
  it('pageSpaces collapses only the class paragraphsOf collapses', () => {
    const spaces = [0x20, 0x09, 0x0a, 0x0d, 0x0c, 0xa0, 0x2028, 0x200b, 0x3000].map((point) =>
      String.fromCodePoint(point),
    );
    for (const space of spaces) {
      expect(pageSpaces(`a${space}b`), JSON.stringify(space)).toBe(paragraphsOf(`a${space}b`)[0]);
    }
  });
});
