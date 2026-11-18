import { describe, expect, it } from 'vitest';
import { semicolonProblems } from './header-validate.ts';

// D4 of ADR-0057's Corrections (2026-11-18): the detail prints the text around the `;` by code point (printedText).
describe('semicolonProblems', () => {
  it('names a refused U+2009, U+00A0, U+2060 and U+0085 around the semicolon by code point', () => {
    const path = 'packages/content/jurisdictions/pt.json';
    expect(semicolonProblems(path, [['lotRuleNote', 'a\u2009b\u00a0c; d\u2060e\u0085f']])).toEqual([
      {
        path,
        code: 'header-semicolon',
        detail:
          'lotRuleNote: "aU+2009 bU+00A0 c; dU+2060 eU+0085 f", a comma-decimal spreadsheet splits the header cell ' +
          'there (docs/DOMAIN.md §3.13)',
      },
    ]);
  });
});
