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

// What main rendered for BITCOINITY and BITSTAMP, the row and cell classes included.
const ONE_BASIS = [
  '<div class="relative -m-[calc(var(--focus-offset)+var(--focus-width))] overflow-x-auto p-[calc(var(--focus-offset)+var(--focus-width))]" tabindex="0" role="region" aria-labelledby="_R_0_">',
  '<table class="w-full border-collapse text-14">',
  '<caption id="_R_0_" class="pb-2 text-left text-13 text-ink-2">Falls from each high to the lowest low after it for BTC, 9\u00a0Jun\u00a02011 to 16\u00a0Dec\u00a02018</caption>',
  '<thead><tr class="border-line-2 border-b">',
  '<th scope="col" class="px-2 py-2 font-medium text-13 text-ink-2 text-left">Coin</th>',
  '<th scope="col" class="px-2 py-2 font-medium text-13 text-ink-2 text-right">Fall</th>',
  '<th scope="col" class="px-2 py-2 font-medium text-13 text-ink-2 text-left">Date of high</th>',
  '<th scope="col" class="px-2 py-2 font-medium text-13 text-ink-2 text-left">Date of low</th>',
  '</tr></thead><tbody>',
  '<tr class="border-line border-b"><th scope="row" class="px-2 py-2 text-ink text-left font-normal">BTC</th>',
  '<td class="px-2 py-2 text-ink nums text-right">−93%</td>',
  '<td class="px-2 py-2 text-ink">9\u00a0Jun\u00a02011</td><td class="px-2 py-2 text-ink">21\u00a0Nov\u00a02011</td></tr>',
  '<tr class="border-line border-b"><th scope="row" class="px-2 py-2 text-ink text-left font-normal">BTC</th>',
  '<td class="px-2 py-2 text-ink nums text-right">−83%</td>',
  '<td class="px-2 py-2 text-ink">18\u00a0Dec\u00a02017</td><td class="px-2 py-2 text-ink">16\u00a0Dec\u00a02018</td></tr>',
  '</tbody></table></div>',
  '<p class="text-16">Bitcoinity (Mt. Gox), Bitstamp, and CoinMarketCap intraday highs and lows in US dollars,',
  ' 9\u00a0Jun\u00a02011 to 16\u00a0Dec\u00a02018; the falls are Proof of Calm&#x27;s own computation.',
  ' Past performance is not a reliable indicator of future results.</p>',
].join('');

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

  // Rows of one basis render byte for byte what main rendered before the mixed table's layout changed (captured on
  // 634c26b1d), so the one-basis pages and their visual baselines stay as they are.
  it('rows of one basis render the markup they rendered before', () => {
    expect(html(falls(BITCOINITY, BITSTAMP))).toBe(ONE_BASIS);
  });

  // The page's text test reads each row as coin, fall, high, low and publisher run together (apps/web/src/site/legal.test.ts),
  // so a stacked label or a class adds no text to a row.
  it('a mixed row reads as coin, fall, high, low and publisher, with nothing between them', () => {
    const text = (row: string) => row.replace(/<[^>]*>/g, '').replace(/\s/gu, ' ');
    expect(rows(html(falls(BITCOINITY, BITSTAMP, KRAKEN))).map(text)).toEqual([
      'BTC−93%9 Jun 201121 Nov 2011Bitcoinity (Mt. Gox) and CoinMarketCap',
      'BTC−83%18 Dec 201716 Dec 2018Bitstamp',
      'ETH−93%20 Jan 20188 Dec 2018Kraken',
    ]);
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
