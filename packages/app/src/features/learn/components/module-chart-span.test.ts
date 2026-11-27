import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import { BRAND } from '../../../lib/brand';
import { createFormatters } from '../../../lib/format';
import type { PastFall } from '../../../lib/services/red-day-types';
import { createTestServices } from '../../../lib/services/testing';
import learnDe from '../../../messages/de/learn.json';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { DRAWDOWN_COINS, fallsSpan } from './module-chart';

// The falls' source sentence (docs/LEGAL.md §4): each publisher once under the basis its rows were computed on,
// intraday highs and lows or daily closes, and the span from the first high to the last low.

const f = createFormatters('en-GB', 'en-GB');
const t = createTranslator({ locale: 'en', messages: { learn }, namespace: 'learn.chart' });
const sentence = (falls: readonly PastFall[]) => t('source', { ...fallsSpan(falls, f), product: BRAND.name });

const row = (coin: string, high: string, low: string, publisher: string, basis?: 'close') =>
  ({ coin, high, low, fall: '80', publisher, ...(basis === undefined ? {} : { basis }) }) as unknown as PastFall;

describe('fallsSpan', () => {
  it("gives today's exact sentence for the cycles file's rows, all intraday", async () => {
    const falls = await createTestServices().redDay.pastFalls(DRAWDOWN_COINS);
    expect(fallsSpan(falls, f).basis).toBe('intraday');
    expect(sentence(falls)).toBe(
      'Bitcoinity (Mt. Gox), Bitstamp, Coinbase, and CoinMarketCap intraday highs and lows in US dollars, ' +
        "8 Jun 2011 to 10 Jun 2023; the falls are Proof of Calm's own computation.",
    );
  });

  it('names daily closes when every row was computed from them', () => {
    const falls = [
      row('ETH', '2021-12-01', '2022-06-30', 'Kraken', 'close'),
      row('SOL', '2021-11-20', '2022-12-20', 'Kraken', 'close'),
    ];
    expect(fallsSpan(falls, f)).toMatchObject({ basis: 'close', intraday: '', closes: 'Kraken' });
    expect(sentence(falls)).toBe(
      "Kraken daily closes in US dollars, 20 Nov 2021 to 20 Dec 2022; the falls are Proof of Calm's own computation.",
    );
  });

  it('lists each publisher once under its basis when the rows mix them', () => {
    const falls = [
      row('BTC', '2011-06-08', '2011-11-22', 'Bitcoinity (Mt. Gox) and CoinMarketCap'),
      row('BTC', '2017-12-17', '2018-12-15', 'Bitstamp'),
      row('ETH', '2018-01-20', '2018-12-08', 'Kraken', 'close'),
      row('SOL', '2021-11-20', '2022-12-20', 'Kraken', 'close'),
      row('LINK', '2018-01-08', '2018-06-29', 'CoinMarketCap'),
    ];
    expect(fallsSpan(falls, f)).toMatchObject({
      basis: 'mixed',
      intraday: 'Bitcoinity (Mt. Gox), Bitstamp, and CoinMarketCap',
      closes: 'Kraken',
    });
    expect(sentence(falls)).toBe(
      'Bitcoinity (Mt. Gox), Bitstamp, and CoinMarketCap intraday highs and lows, and Kraken daily closes, in US dollars, ' +
        "8 Jun 2011 to 20 Dec 2022; the falls are Proof of Calm's own computation.",
    );
  });

  it('joins the second kind as each language does when the rows mix them', () => {
    const falls = [
      row('BTC', '2017-12-17', '2018-12-15', 'Bitstamp'),
      row('ETH', '2018-01-20', '2018-12-08', 'Kraken', 'close'),
    ];
    const de = createTranslator({ locale: 'de', messages: { learn: learnDe }, namespace: 'learn.chart' });
    const pt = createTranslator({ locale: 'pt-PT', messages: { learn: learnPt }, namespace: 'learn.chart' });
    const span = (locale: string) => ({ ...fallsSpan(falls, createFormatters(locale, locale)), product: BRAND.name });
    expect(de('source', span('de-DE'))).toMatch(
      /^Tageshochs und Tagestiefs von Bitstamp sowie Tagesschlusskurse von Kraken in US-Dollar, /,
    );
    expect(pt('source', span('pt-PT'))).toMatch(
      /^Máximos e mínimos intradiários de Bitstamp e os fechos diários de Kraken, em dólares americanos, /,
    );
  });
});
