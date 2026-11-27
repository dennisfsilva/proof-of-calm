import { describe, expect, it } from 'vitest';
import { publisherProblems } from './publisher-validate.ts';

// A row's publisher as the falls tables and source lines split it (packages/app's falls-basis.ts, on " and "): the
// check takes one name or two joined by " and ", each name words of letters, digits and . & - ' ’ with at most one
// parenthesised note at its end. Each case sits one step from a clause of that grammar (docs/BUILD-PROMPT.md, the
// near misses).
const PATH = 'packages/content/cycles/drawdowns.json';
const details = (...publishers: string[]) =>
  publisherProblems(
    PATH,
    publishers.map((publisher) => ({ publisher })),
  ).map(({ path, code, detail }) => `${path} ${code}: ${detail}`);
const MORE = 'joins more than two names with " and "';
const EMPTY = 'is empty';
const EDGE = 'has a space at its edge';
const DOUBLE = 'has two spaces in a row';
const SIGN = (sign: string) => `has a sign no name takes: "${sign}"`;
const FIRST = 'starts with neither a letter nor a digit';
const UNOPENED = 'closes a note it does not open';
const UNCLOSED = 'has a note it does not close';
const NOTES = 'has more than one note';
const MID = 'has a note before its end';
const NO_SPACE = 'has no space before its note';
const NOTE_EMPTY = 'has an empty note';
const NOTE_EDGE = "has a space at its note's edge";
const NOTE_FIRST = 'has a note that starts with neither a letter nor a digit';
const AND = 'is the word "and"';
const AND_START = 'starts with the word "and"';
const AND_END = 'ends with the word "and"';
const named = (name: string, reason: string) => `name "${name}" ${reason}`;

describe('publisherProblems', () => {
  it.each([
    ['one name', 'Bitstamp'],
    ['another name', 'Kraken'],
    ['a name with capitals inside', 'CoinMarketCap'],
    ['two names, one with its series in parentheses', 'Bitcoinity (Mt. Gox) and CoinMarketCap'],
    ['one name with parentheses and no join', 'Mt. Gox (Bitcoinity)'],
    ['"and" inside a word, which is not a join', 'Anderson and Brand'],
    ['"and" opening a word after the join, not followed by a space', 'Bitstamp and andes'],
    ['an apostrophe', "Coinbase's and Kraken"],
    ['a typographic apostrophe', 'Coinbase’s and Kraken'],
    ['a full stop inside a word', 'Mt.Gox'],
    ['an ampersand as a word', 'Kraken & Co'],
    ['an ampersand inside a word', 'A&B Data'],
    ['a hyphen', 'Coin-Desk and Kraken'],
    ['a sign opening a later word', 'Kraken -Index'],
    ['a digit opening a name', '21Shares'],
    ['a name that is only digits', 'Kraken and 1771'],
    ['a letter outside ASCII', 'Börse Stuttgart'],
    ['a name in another script', 'Кракен and Kraken'],
    ['a note of several words', 'Kraken (Pro Index)'],
    ['a note opening with a digit', 'Bitstamp (2014 series)'],
    ['a note opening with "and", which is not a name', 'Kraken (and Co)'],
    ['two names, each with a note at its end', 'Bitcoinity (Mt. Gox) and Kraken (Pro)'],
    ['a name ending in "and" inside a word', 'Brand'],
    ['two names, one ending in "and" inside a word', 'Sand and Co'],
    ['one name with "AND", since the split is case-sensitive', 'A AND B'],
    ['a name opening with "Anderson"', 'Anderson'],
  ])('takes %s: %s', (_, publisher) => {
    expect(details(publisher)).toEqual([]);
  });

  it.each([
    ['three names', 'A and B and C', MORE],
    ['a join inside parentheses that makes three names', 'Foo (Bar and Baz) and CoinMarketCap', MORE],
    ['a join inside parentheses', 'Foo (Bar and Baz)', named('Foo (Bar', UNCLOSED)],
    ['a join inside square brackets', 'CoinMarketCap [Bitstamp and Kraken]', named('CoinMarketCap [Bitstamp', SIGN('['))],
    ['a join inside curly brackets', 'Foo {Bar and Baz}', named('Foo {Bar', SIGN('{'))],
    ['a join inside quotes', 'Kaiko "Bitstamp and Kraken"', named('Kaiko "Bitstamp', SIGN('"'))],
    ['a join inside typographic quotes', 'Kaiko “Bitstamp and Kraken”', named('Kaiko “Bitstamp', SIGN('“'))],
    ['a join inside single typographic quotes', 'Kaiko ‘Bitstamp and Kraken’', named('Kaiko ‘Bitstamp', SIGN('‘'))],
    ['an empty second name', 'Bitstamp and ', named('', EMPTY)],
    ['an empty first name', ' and Kraken', named('', EMPTY)],
    ['a doubled space after the join', 'Bitstamp and  Kraken', named(' Kraken', EDGE)],
    ['a second "and" after the join', 'A and and B', named('and B', AND_START)],
    ['a second "and" before the join', 'A and B and', named('B and', AND_END)],
    ['brackets before a second "and"', 'Foo [Bar and and Baz]', named('Foo [Bar', SIGN('['))],
    ['a space at an edge before a second "and"', 'A and and B ', named('and B ', EDGE)],
    // Taken by the deny-list, which balanced brackets and quotes; the grammar takes neither.
    ['two names, one with its series in square brackets', 'CoinMarketCap [Bitstamp] and Kraken', named('CoinMarketCap [Bitstamp]', SIGN('['))],
    ['two names, one with a quoted series', 'Kaiko "Index" and Kraken', named('Kaiko "Index"', SIGN('"'))],
    ['two names, one with a series in typographic quotes', 'Kaiko “Index” and Kraken', named('Kaiko “Index”', SIGN('“'))],
    // Each sign outside the grammar, in one name and in two.
    ['a comma', 'Bitstamp, Kraken', SIGN(',')],
    ['a comma in the second name', 'Bitstamp and Kraken, Pro', named('Kraken, Pro', SIGN(','))],
    ['a slash', 'Bitstamp/Kraken', SIGN('/')],
    ['a slash in the first name', 'Bitstamp/USD and Kraken', named('Bitstamp/USD', SIGN('/'))],
    ['an opening square bracket', 'Kraken [Pro', SIGN('[')],
    ['a closing square bracket', 'Kraken and Pro]', named('Pro]', SIGN(']'))],
    ['an opening curly bracket', 'Kraken and {Pro', named('{Pro', SIGN('{'))],
    ['a closing curly bracket', 'Kraken Pro}', SIGN('}')],
    ['a quote', 'Kaiko "Index"', SIGN('"')],
    ['a quote in the second name', 'Kraken and Kaiko "Index"', named('Kaiko "Index"', SIGN('"'))],
    ['an opening typographic quote', 'Kaiko “Index', SIGN('“')],
    ['a closing typographic quote', 'Kaiko ”Index and Kraken', named('Kaiko ”Index', SIGN('”'))],
    ['a closing typographic quote in one name', 'Kaiko Index”', SIGN('”')],
    ['an opening single typographic quote', 'Kaiko ‘Index', SIGN('‘')],
    ['an opening single typographic quote in the second name', 'Kraken and ‘Index', named('‘Index', SIGN('‘'))],
    // Spaces.
    ['an empty name', '', EMPTY],
    ['a leading space', ' Kraken', EDGE],
    ['a trailing space', 'Kraken ', EDGE],
    ['a trailing space before the join', 'Bitstamp  and Kraken', named('Bitstamp ', EDGE)],
    ['a double space', 'Mt.  Gox', DOUBLE],
    ['a double space in the second name', 'Kraken and Mt.  Gox', named('Mt.  Gox', DOUBLE)],
    // The first sign of a name and of its note.
    ['a name opening with a sign', '-Kraken', FIRST],
    ['a name opening with an apostrophe', "Kraken and 's Data", named("'s Data", FIRST)],
    ['a name opening with a note', '(Pro) Kraken', FIRST],
    ['a note opening with a sign', 'Kraken (-Pro)', NOTE_FIRST],
    ['a note opening with an ampersand', 'Kraken and Bitstamp (&Co)', named('Bitstamp (&Co)', NOTE_FIRST)],
    // The note.
    ['two notes', 'Kraken (Pro) (Index)', NOTES],
    ['a nested note', 'Kraken (Pro (Index))', NOTES],
    ['a note mid-name', 'Kraken (Pro) Index', MID],
    ['a note mid-name in the second name', 'Bitstamp and Kraken (Pro) Index', named('Kraken (Pro) Index', MID)],
    ['an empty note', 'Kraken ()', NOTE_EMPTY],
    ['a note with no space before it', 'Kraken(Pro)', NO_SPACE],
    ['an unclosed note', 'Kraken (Pro', UNCLOSED],
    ['a note closed twice', 'Kraken (Pro))', UNOPENED],
    ['a close before the open', 'Kraken )Pro(', UNOPENED],
    ['a close with no open, before the join', 'Foo) and Bar', named('Foo)', UNOPENED)],
    ['a leading space in a note', 'Kraken ( Pro)', NOTE_EDGE],
    ['a trailing space in a note', 'Kraken (Pro )', NOTE_EDGE],
    // The word "and".
    ['the word "and" as the only name', 'and', AND],
    ['the word "and" as the second name', 'A and and', named('and', AND)],
    ['the word "and" as the first name', 'and and B', named('and', AND)],
    ['a name opening with the word "and"', 'and Co', AND_START],
    ['a name ending with the word "and"', 'Kraken and', AND_END],
  ])('refuses %s: %s', (_, publisher, reason) => {
    expect(details(publisher)).toEqual([
      `${PATH} drawdown-publisher-joined: drawdowns.0 publisher "${publisher}": ${reason}`,
    ]);
  });

  it('names each refused row by its index, one problem a row', () => {
    expect(details('Bitstamp', 'A and B and C', 'Coinbase', 'Bitstamp and ')).toEqual([
      `${PATH} drawdown-publisher-joined: drawdowns.1 publisher "A and B and C": ${MORE}`,
      `${PATH} drawdown-publisher-joined: drawdowns.3 publisher "Bitstamp and ": ${named('', EMPTY)}`,
    ]);
  });
});
