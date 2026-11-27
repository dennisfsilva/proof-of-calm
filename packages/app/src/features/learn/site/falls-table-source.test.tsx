import type { CalendarDate } from '@proofofcalm/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'use-intl';
import { describe, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { localesFor, type UiLanguage } from '../../../lib/i18n/locale';
import type { PastFall } from '../../../lib/services/red-day-types';
import learnDe from '../../../messages/de/learn.json';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { SiteFalls, StaticLearn } from './index';

// The Risk page's falls table names each row's publisher in a Source column once the rows mix intraday falls with
// falls between daily closes (docs/CONTENT-STYLE.md §1 rules 1 and 2), and stays as it was with rows of one basis.

// The site renders in English (`StaticLearn`, ADR-0048 Deviations of 2026-11-15); a render in another language swaps
// in that language's formatters, as a translated site page would get them.
const site = vi.hoisted(() => ({ language: null as UiLanguage | null }));
vi.mock('./static', async (original) => {
  const actual = await original<typeof import('./static')>();
  return {
    ...actual,
    useSiteFormatters: () => {
      if (site.language === null) return actual.useSiteFormatters();
      const locales = localesFor(site.language, null);
      return createFormatters(locales.numbers, locales.ui);
    },
  };
});

const TODAY = '2026-11-15' as CalendarDate;

const html = (falls: readonly PastFall[]) =>
  renderToStaticMarkup(
    <StaticLearn today={TODAY}>
      <SiteFalls falls={falls} />
    </StaticLearn>,
  );

const translated = (falls: readonly PastFall[], language: 'pt-PT' | 'de') => {
  site.language = language;
  try {
    return renderToStaticMarkup(
      <IntlProvider locale={language} messages={{ learn: language === 'de' ? learnDe : learnPt }} timeZone="UTC">
        <SiteFalls falls={falls} />
      </IntlProvider>,
    );
  } finally {
    site.language = null;
  }
};

// Synthetic rows: dates no row of the cycles file holds.
const BITCOINITY = {
  coin: 'BTC',
  high: '2011-06-09',
  low: '2011-11-21',
  fall: '93',
  publisher: 'Bitcoinity (Mt. Gox) and CoinMarketCap',
};
const BITSTAMP = { coin: 'BTC', high: '2017-12-18', low: '2018-12-16', fall: '83', publisher: 'Bitstamp' };
const KRAKEN = { coin: 'ETH', high: '2018-01-20', low: '2018-12-08', fall: '93', publisher: 'Kraken', basis: 'close' };

const falls = (...rows: object[]) => rows as unknown as readonly PastFall[];

const rows = (markup: string) =>
  [...(markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(
    (match) => match[1] ?? '',
  );
const cells = (row: string) =>
  [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((match) => (match[1] ?? '').replace(/\s/gu, ' '));
const header = (markup: string) => markup.match(/<thead>(.*?)<\/thead>/)?.[1] ?? '';

describe('SiteFalls: the Source column', () => {
  const { columns } = learn.chart;

  it('a mixed set names each row its publisher, last, in row order', () => {
    const markup = html(falls(BITSTAMP, KRAKEN, BITCOINITY));
    expect(cells(header(markup))).toEqual([columns.coin, columns.fall, columns.high, columns.low, columns.source]);
    expect(columns.source).toBe('Source');
    // A real column header, as the other four are.
    expect([...header(markup).matchAll(/<th scope="col"/g)]).toHaveLength(5);
    const body = rows(markup).map(cells);
    expect(body.map((row) => row[0])).toEqual(['BTC', 'ETH', 'BTC']);
    expect(body.map((row) => row.at(-1))).toEqual(['Bitstamp', 'Kraken', 'Bitcoinity (Mt. Gox) and CoinMarketCap']);
    expect(body[0]).toEqual(['BTC', expect.stringMatching(/83 ?%/), '18 Dec 2017', '16 Dec 2018', 'Bitstamp']);
    // The caption stays.
    expect(markup).toMatch(/<table[^>]*><caption[^>]*>Falls from each high/);
  });

  it('rows of one basis keep the four columns, intraday or on daily closes', () => {
    for (const set of [falls(BITSTAMP, BITCOINITY), falls(KRAKEN)]) {
      const markup = html(set);
      expect(cells(header(markup))).toEqual([columns.coin, columns.fall, columns.high, columns.low]);
      expect(
        rows(markup)
          .map(cells)
          .every((row) => row.length === 4),
      ).toBe(true);
      expect(markup).not.toContain(columns.source);
    }
  });

  // A row drawn from two series names both, joined in the page's language (docs/CONTENT-STYLE.md §1 rule 9, §3):
  // English keeps its "and", pt-PT and German their own word.
  it.each([
    ['pt-PT', 'Fonte', 'Bitcoinity (Mt. Gox) e CoinMarketCap'],
    ['de', 'Quelle', 'Bitcoinity (Mt. Gox) und CoinMarketCap'],
  ] as const)('a compound publisher in %s joins its names in that language', (language, source, compound) => {
    const markup = translated(falls(BITSTAMP, KRAKEN, BITCOINITY), language);
    expect(cells(header(markup)).at(-1)).toBe(source);
    expect(
      rows(markup)
        .map(cells)
        .map((row) => row.at(-1)),
    ).toEqual(['Bitstamp', 'Kraken', compound]);
  });
});
