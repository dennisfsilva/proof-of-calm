import { describe, expect, it } from 'vitest';
import facts from '../facts/education.json' with { type: 'json' };

// docs/CONTENT-OPS.md §7: Coinbase Exchange answers at most 300 daily candles per request, and without `start` and `end`
// only its latest days, so a fact citing its candles names the window of its headline figure. `windowOf` and `holds`
// are copied from cycles.test.ts, which applies the same rule to the cycles file's rows.
const day = 86_400_000;
const windowOf = (href: string, coin: string) => {
  const url = new URL(href);
  const [start = '', end = ''] = ['start', 'end'].map((key) => url.searchParams.get(key) ?? '');
  const daily = `${url.origin}${url.pathname}` === `https://api.exchange.coinbase.com/products/${coin}-USD/candles`;
  const midnight = [start, end].every((at) => at.endsWith('T00:00:00Z'));
  if (!daily || url.searchParams.get('granularity') !== '86400' || !midnight) return { start: '', end: '' };
  return { start: start.slice(0, 10), end: end.slice(0, 10) };
};
const holds = (url: string, coin: string, date: string) => {
  const { start, end } = windowOf(url, coin);
  return start <= date && date <= end && (Date.parse(end) - Date.parse(start)) / day < 300;
};

// The dates each fact's window holds: b's ETH 2022 high and low (its cycles row's window); o's first buy; p's first buy
// and its worst value-to-cost. The rest of each series is reached by moving `start` and `end` (§7).
const DATED = {
  'b.alt-drawdowns': ['ETH', '2021-11-10', '2022-06-18'],
  'o.dca-windows-eth': ['ETH', '2017-01-01'],
  'p.simulator-examples-eth': ['ETH', '2021-11-01', '2022-06-18'],
} as const;

describe('the facts that cite Coinbase Exchange candles (docs/CONTENT-OPS.md §7)', () => {
  const coinbase = facts.filter(({ source }) => new URL(source).hostname === 'api.exchange.coinbase.com');

  it('are the three facts with a dated window', () => {
    expect(coinbase.map(({ key }) => key)).toEqual(Object.keys(DATED));
  });

  it('each name one request of fewer than 300 daily candles holding the fact’s dates', () => {
    const missed = coinbase.flatMap(({ key, source }) => {
      const [coin, ...dates] = DATED[key as keyof typeof DATED];
      return dates.filter((date) => !holds(source, coin, date)).map((date) => `${key} ${date}`);
    });
    expect(missed).toEqual([]);
  });
});
