// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { coinWords, readableStrings } from './coin-words';

/** The catalogue names a page holding this markup shows, read as the manifest-capture spec reads a screen. */
const found = (html: string) => {
  document.body.innerHTML = html;
  return coinWords(readableStrings(document.body));
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the coin-name count on the manifest screenshots', () => {
  it('finds a ticker in its own element beside a figure', () => {
    expect(found('<span>0.0012</span><span>BTC</span>')).toEqual(['BTC']);
  });

  it('finds a name in a description beside its term', () => {
    expect(found('<dl><dt>Coin</dt><dd>Bitcoin</dd></dl>')).toEqual(['Bitcoin']);
  });

  it('finds every name of a list whose items touch', () => {
    expect(found('<ul><li>Bitcoin</li><li>Ethereum</li></ul>')).toEqual(['Bitcoin', 'Ethereum']);
  });

  it('finds a ticker inside a sentence', () => {
    expect(found('<p>0.0012 BTC</p>')).toEqual(['BTC']);
  });

  it('finds a name split across inline elements', () => {
    expect(found('<p>Bit<b>coin</b></p>')).toContain('Bitcoin');
  });

  it("finds a name in an input's value and in a placeholder", () => {
    document.body.innerHTML = '<input aria-label="Amount"><textarea placeholder="Ethereum"></textarea>';
    const input = document.querySelector('input');
    if (input === null) throw new Error('the markup has an input');
    input.value = 'Solana';
    expect(coinWords(readableStrings(document.body))).toEqual(['Solana', 'Ethereum']);
  });

  it('finds a name in alt, aria-label and title', () => {
    expect(found('<img alt="Bitcoin"><button aria-label="ETH"></button><abbr title="Cardano">x</abbr>')).toEqual([
      'Bitcoin',
      'ETH',
      'Cardano',
    ]);
  });

  it('leaves scripts, styles and English words that are tickers in lowercase out', () => {
    expect(found('<script>"BTC"</script><style>.ETH{}</style><p>near the render</p>')).toEqual([]);
  });
});
