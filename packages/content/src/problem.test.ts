import { describe, expect, it } from 'vitest';
import { bannedProblems } from './problem.ts';

// D4 of ADR-0057's Corrections (2026-11-18): a ban-list detail prints its match by code point (printedText).
describe('bannedProblems', () => {
  it('names a refused U+2009, U+00A0, U+2060 and U+0085 in the match by code point', () => {
    const text = 'A 40\u2009%\u00a0gains plan\u2060 for\u0085 you.';
    expect(bannedProblems('packages/content/jurisdictions/pt.json', 'card.summary60', text)).toEqual([
      {
        path: 'packages/content/jurisdictions/pt.json',
        code: 'banned-return-percentage',
        detail: 'card.summary60: "40U+2009 %U+00A0 gains" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)',
      },
    ]);
  });
});
