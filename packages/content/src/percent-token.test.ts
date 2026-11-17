import { describe, expect, it } from 'vitest';
import { paragraphsOf } from './paragraphs.ts';
import { formatPercentTokens, PERCENT_JOINER, percentTokenProblems } from './percent-token.ts';
import { sentencesOf } from './template-figures.ts';

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
    ['U+00A0', ' ', 'U+00A0'],
    ['U+202F', ' ', 'U+202F'],
    ['no joiner', '', 'nothing'],
    ['a hyphen', '-', 'U+002D'],
  ])('refuses %s before "%", quoting the sentence and naming the fix', (_, joiner, said) => {
    const sentence = `Bitcoin: 60${joiner}% of each amount.`;
    const text = `It is a starting point. ${sentence} Ether: 40 %.`;
    const [problem, ...rest] = percentTokenProblems(PATH, 'explanation', text);
    expect(rest).toEqual([]);
    expect(problem).toEqual({
      path: PATH,
      code: 'percent-token',
      detail:
        `explanation: "60${joiner}%" has ${said} before its sign in "${sentence}"; ` +
        'write N % with an ordinary space (U+0020) (docs/CONTENT-STYLE.md §4)',
    });
  });

  it.each(SIGNS.slice(1))('refuses the sign %s, which the app does not format, naming just the sign', (sign) => {
    const [problem, ...rest] = percentTokenProblems(PATH, 'explanation', `Bitcoin: 60 ${sign} of each amount.`);
    expect(rest).toEqual([]);
    const code = `U+${sign.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`;
    expect(problem?.detail).toBe(
      `explanation: "60 ${sign}" has ${code} in place of % in "Bitcoin: 60 ${sign} of each amount."; ` +
        'write N % with an ordinary space (U+0020) (docs/CONTENT-STYLE.md §4)',
    );
  });

  it('names both the joiner and the sign when both are wrong', () => {
    const [problem] = percentTokenProblems(PATH, 'explanation', `Bitcoin: 60${SIGNS[1]} of each amount.`);
    expect(problem?.detail).toContain(
      `"60${SIGNS[1]}" has nothing before its sign and U+066A in place of % in "Bitcoin`,
    );
  });

  it('quotes the sentence sentencesOf reads, in a long explanation and across paragraphs', () => {
    const text = 'A plan.\nIt keeps\tBitcoin at 60% and Ether\n\nat 40 %. Then 3% more? Yes!';
    const quoted = percentTokenProblems(PATH, 'explanation', text).map(
      ({ detail }) => /in "(.*)"; /u.exec(detail)?.[1],
    );
    expect(quoted).toEqual(['It keeps Bitcoin at 60% and Ether', 'Then 3% more?']);
    for (const sentence of quoted) expect(sentencesOf(text)).toContain(sentence);
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
