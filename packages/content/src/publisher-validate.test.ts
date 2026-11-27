import { describe, expect, it } from 'vitest';
import { publisherProblems } from './publisher-validate.ts';

// A row's publisher as the falls tables and source lines split it (packages/app's falls-basis.ts, on " and "): the
// check refuses each value whose split would not give one or two whole names. Each case sits one step from a value
// the check takes (docs/BUILD-PROMPT.md, the near misses).
const PATH = 'packages/content/cycles/drawdowns.json';
const details = (...publishers: string[]) =>
  publisherProblems(
    PATH,
    publishers.map((publisher) => ({ publisher })),
  ).map(({ path, code, detail }) => `${path} ${code}: ${detail}`);
const MORE = 'joins more than two names with " and "';
const PARENS = 'has " and " inside parentheses';
const EDGE = "has an empty name or a space at a name's edge";

describe('publisherProblems', () => {
  it.each([
    ['one name', 'Bitstamp'],
    ['another name', 'Kraken'],
    ['a name with capitals inside', 'CoinMarketCap'],
    ['two names, one with its series in parentheses', 'Bitcoinity (Mt. Gox) and CoinMarketCap'],
    ['one name with parentheses and no join', 'Mt. Gox (Bitcoinity)'],
    ['"and" inside a word, which is not a join', 'Anderson and Brand'],
  ])('takes %s: %s', (_, publisher) => {
    expect(details(publisher)).toEqual([]);
  });

  it.each([
    ['three names', 'A and B and C', MORE],
    ['a join inside parentheses that makes three names', 'Foo (Bar and Baz) and CoinMarketCap', MORE],
    ['a join inside parentheses', 'Foo (Bar and Baz)', PARENS],
    ['an empty second name', 'Bitstamp and ', EDGE],
    ['an empty first name', ' and Kraken', EDGE],
    ['a doubled space after the join', 'Bitstamp and  Kraken', EDGE],
  ])('refuses %s: %s', (_, publisher, reason) => {
    expect(details(publisher)).toEqual([
      `${PATH} drawdown-publisher-joined: drawdowns.0 publisher "${publisher}": ${reason}`,
    ]);
  });

  it('names each refused row by its index, one problem a row', () => {
    expect(details('Bitstamp', 'A and B and C', 'Coinbase', 'Bitstamp and ')).toEqual([
      `${PATH} drawdown-publisher-joined: drawdowns.1 publisher "A and B and C": ${MORE}`,
      `${PATH} drawdown-publisher-joined: drawdowns.3 publisher "Bitstamp and ": ${EDGE}`,
    ]);
  });
});
