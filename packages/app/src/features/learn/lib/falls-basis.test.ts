import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import { BRAND } from '../../../lib/brand';
import { createFormatters } from '../../../lib/format';
import type { PastFall } from '../../../lib/services/red-day-types';
import de from '../../../messages/de/learn.json';
import en from '../../../messages/en/learn.json';
import pt from '../../../messages/pt-PT/learn.json';
import { fallsSources } from './falls-basis';

// The line over a coin's earlier falls on the fall page (docs/CONTENT-STYLE.md §3): all intraday, it reads as it did
// before rows on daily closes existed; mixed, it names each publisher under its basis. The rows are synthetic, on
// dates no row of the cycles file holds.

const row = (high: string, low: string, publisher: string, basis?: 'close') =>
  ({ coin: 'ETH', high, low, fall: '80', publisher, ...(basis === undefined ? {} : { basis }) }) as unknown as PastFall;

const INTRADAY = [row('2017-12-20', '2018-12-10', 'Bitstamp'), row('2021-12-01', '2022-06-30', 'CoinMarketCap')];
const MIXED = [row('2018-01-20', '2018-12-08', 'Kraken', 'close'), row('2021-12-01', '2022-06-30', 'Bitstamp')];

const LANGUAGES = [
  { messages: en, locale: 'en', formatting: 'en-GB' },
  { messages: de, locale: 'de', formatting: 'de-DE' },
  { messages: pt, locale: 'pt-PT', formatting: 'pt-PT' },
] as const;

const fallsOf = (language: (typeof LANGUAGES)[number], falls: readonly PastFall[]) => {
  const t = createTranslator({ locale: language.locale, messages: { learn: language.messages }, namespace: 'learn' });
  const sources = fallsSources(falls, createFormatters(language.formatting, language.formatting));
  return t('thisFall.fallsOf', { coin: 'Ethereum', ...sources, product: BRAND.name });
};

describe('fallsSources', () => {
  it('lists the publishers under the basis of their rows, each once', () => {
    const f = createFormatters('en-GB', 'en-GB');
    expect(fallsSources(INTRADAY, f)).toEqual({
      basis: 'intraday',
      intraday: 'Bitstamp and CoinMarketCap',
      closes: '',
    });
    expect(fallsSources(MIXED, f)).toEqual({ basis: 'mixed', intraday: 'Bitstamp', closes: 'Kraken' });
  });

  it("keeps the all-intraday line's words in every language", () => {
    expect(LANGUAGES.map((language) => fallsOf(language, INTRADAY))).toEqual([
      "Earlier falls of Ethereum, computed by Proof of Calm from each source's intraday highs and lows in US dollars:",
      'Frühere Rückgänge von Ethereum, von Proof of Calm aus den Tageshochs und Tagestiefs jeder Quelle in US-Dollar berechnet:',
      'Quedas anteriores de Ethereum, calculadas pela Proof of Calm a partir dos máximos e mínimos intradiários de cada fonte, em dólares americanos:',
    ]);
  });

  it('names each publisher under its basis in every language when the rows mix them', () => {
    expect(LANGUAGES.map((language) => fallsOf(language, MIXED))).toEqual([
      'Earlier falls of Ethereum, computed by Proof of Calm from Bitstamp intraday highs and lows, and Kraken daily closes, in US dollars:',
      'Frühere Rückgänge von Ethereum, von Proof of Calm aus den Tageshochs und Tagestiefs von Bitstamp sowie den Tagesschlusskursen von Kraken in US-Dollar berechnet:',
      'Quedas anteriores de Ethereum, calculadas pela Proof of Calm a partir dos máximos e mínimos intradiários de Bitstamp e dos fechos diários de Kraken, em dólares americanos:',
    ]);
  });
});
