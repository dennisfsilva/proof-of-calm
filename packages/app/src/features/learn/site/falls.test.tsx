import type { CalendarDate } from '@proofofcalm/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PastFall } from '../../../lib/services/red-day-types';
import learn from '../../../messages/en/learn.json';
import { SiteFalls, StaticLearn } from './index';

// The Risk page's dated falls (docs/LEGAL.md §5): a table of the cycles file's rows as passed, then §4's source line
// and the past-performance line, rendered to a string as the web host's prerender renders them.

const TODAY = '2026-11-15' as CalendarDate;

const html = (falls: readonly PastFall[]) =>
  renderToStaticMarkup(
    <StaticLearn today={TODAY}>
      <SiteFalls falls={falls} />
    </StaticLearn>,
  );

const FALLS = [
  { coin: 'BTC', high: '2011-06-08', low: '2011-11-22', fall: '94', publisher: 'Bitcoinity (Mt. Gox) and CoinMarketCap' },
  { coin: 'BTC', high: '2013-11-30', low: '2015-01-14', fall: '87', publisher: 'Bitstamp' },
  { coin: 'ETH', high: '2018-01-13', low: '2018-12-14', fall: '94', publisher: 'Coinbase' },
  { coin: 'LINK', high: '2021-05-10', low: '2023-06-10', fall: '91', publisher: 'Bitstamp' },
] as unknown as readonly PastFall[];

const rows = (markup: string) => [...markup.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].slice(1).map((match) => match[1] ?? '');
const cells = (row: string) => [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((match) => match[1]);

describe('SiteFalls', () => {
  it('one row per fall in the order passed', () => {
    const markup = html(FALLS);
    const body = rows(markup).map(cells);
    expect(body).toHaveLength(FALLS.length);
    expect(body.map((row) => row[0])).toEqual(['BTC', 'BTC', 'ETH', 'LINK']);
    expect(body[0]?.slice(1, 3)).toEqual(['8 Jun 2011', '22 Nov 2011']);
    expect(body[0]?.[3]).toMatch(/94 ?%/);
    expect(body[3]?.[3]).toMatch(/91 ?%/);
    const header = cells(markup.match(/<thead>(.*?)<\/thead>/)?.[1] ?? '');
    expect(header).toEqual(Object.values(learn.chart.columns));
    expect(markup).not.toContain('<script');
  });

  it('nothing for no falls', () => {
    expect(html([])).toBe('');
  });

  it('names each publisher once, from the first high to the last low', () => {
    const markup = html(FALLS).replaceAll('&#x27;', "'");
    const line = markup.match(/<\/table><\/div><p[^>]*>(.*?)<\/p>/)?.[1] ?? '';
    expect(line).toContain('Bitcoinity (Mt. Gox), Bitstamp, Coinbase, and CoinMarketCap intraday highs and lows');
    expect(line).toContain('8 Jun 2011 to 10 Jun 2023');
    for (const publisher of ['Bitstamp', 'Coinbase', 'CoinMarketCap']) {
      expect(line.split(publisher).length - 1, publisher).toBe(1);
    }
    expect(line.endsWith(learn.module.pastPerformance)).toBe(true);
  });
});
