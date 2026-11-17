import { describe, expect, it } from 'vitest';
import { paragraphsOf } from './paragraphs.ts';
import { formatPercentTokens, PERCENT_JOINER, percentTokenProblems } from './percent-token.ts';

// The one percentage token of a template's explanation (docs/CONTENT-STYLE.md §4 and §9): the check refuses every
// other form, and the app formats every form the check accepts, both read through percent-token.ts.
const PATH = 'packages/content/templates/two-coins.json';
const codes = (text: string) => percentTokenProblems(PATH, 'explanation', text).map(({ code }) => code);
const SIGNS = ['%', '٪', '﹪', '％'];
const JOINERS = ['', ' ', ' ', ' ', ' ', '\t', '  ', '\n', '\r\n', '-', '‐', '‑', '  '];

describe('percentTokenProblems', () => {
  it('takes the ordinary space as the one joiner', () => {
    expect(PERCENT_JOINER).toBe(' ');
    expect(codes('Bitcoin: 60 % of each amount.')).toEqual([]);
  });

  it.each([
    ['U+00A0', ' ', 'has U+00A0'],
    ['U+202F', ' ', 'has U+202F'],
    ['no joiner', '', 'has none'],
    ['a hyphen', '-', 'has U+002D'],
  ])('refuses %s before "%"', (_, joiner, said) => {
    const [problem, ...rest] = percentTokenProblems(PATH, 'explanation', `Bitcoin: 60${joiner}% of each amount.`);
    expect(rest).toEqual([]);
    expect(problem?.code).toBe('percent-token');
    expect(problem?.detail).toContain(`"60${joiner}%" ${said}`);
    expect(problem?.detail).toContain('docs/CONTENT-STYLE.md §4');
  });

  it.each(SIGNS.slice(1))('refuses the sign %s, which the app does not format', (sign) => {
    expect(codes(`Bitcoin: 60 ${sign} of each amount.`)).toEqual(['percent-token']);
  });

  it('reads the paragraphs the app renders, so a line break before "%" is the ordinary space', () => {
    expect(codes('Bitcoin: 60\n% of each amount.')).toEqual([]);
    expect(codes('Bitcoin: 60 % of each amount.\n\nEthereum: 40% of each amount.')).toEqual(['percent-token']);
  });
});

describe('formatPercentTokens', () => {
  const shown = (text: string) => formatPercentTokens(text, (digits) => `<${digits}>`);

  it('formats each token with its digits', () => {
    expect(shown('It splits each amount 60 % Bitcoin and 40 % Ethereum.')).toBe(
      'It splits each amount <60> Bitcoin and <40> Ethereum.',
    );
  });

  it('leaves nothing the check accepts unformatted, in the paragraphs the app renders', () => {
    const accepted: string[] = [];
    for (const joiner of JOINERS) {
      for (const sign of SIGNS) {
        const text = `Bitcoin: 60${joiner}${sign} of each amount.`;
        if (codes(text).length > 0) continue;
        accepted.push(JSON.stringify(text));
        expect(paragraphsOf(text).map(shown), JSON.stringify(text)).toEqual(['Bitcoin: <60> of each amount.']);
      }
    }
    expect(accepted).toEqual([
      '"Bitcoin: 60 % of each amount."',
      '"Bitcoin: 60\\t% of each amount."',
      '"Bitcoin: 60  % of each amount."',
      '"Bitcoin: 60\\n% of each amount."',
      '"Bitcoin: 60\\r\\n% of each amount."',
    ]);
  });
});
