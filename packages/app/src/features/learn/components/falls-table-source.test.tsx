// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { localesFor, type UiLanguage } from '../../../lib/i18n/locale';
import type { PastFall } from '../../../lib/services/red-day-types';
import learnDe from '../../../messages/de/learn.json';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { DrawdownBars } from './module-chart';

// Learn's "Show the falls as a table" names each row's publisher in a Source column once the rows mix intraday falls
// with falls between daily closes (docs/CONTENT-STYLE.md §1 rules 1 and 2), and stays as it was with rows of one basis.

afterEach(cleanup);

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

const MESSAGES = { en: learn, 'pt-PT': learnPt, de: learnDe } as const;

const table = (rows: readonly PastFall[], language: UiLanguage = 'en') => {
  const locales = localesFor(language, null);
  const f = createFormatters(locales.numbers, locales.ui);
  const { container } = render(
    <I18nProvider locale={language} messages={{ learn: MESSAGES[language] }}>
      <DrawdownBars falls={rows} f={f} />
    </I18nProvider>,
  );
  const text = (element: Element) => (element.textContent ?? '').replace(/\s/gu, ' ');
  return {
    container,
    headers: [...container.querySelectorAll('details thead th')],
    body: [...container.querySelectorAll('details tbody tr')].map((row) => [...row.children].map(text)),
    text,
  };
};

describe('DrawdownBars: the Source column', () => {
  const { columns } = learn.chart;

  it('a mixed set names each row its publisher, last, in row order', () => {
    const { container, headers, body, text } = table(falls(BITSTAMP, KRAKEN, BITCOINITY));
    expect(headers.map(text)).toEqual([columns.coin, columns.high, columns.low, columns.fall, columns.source]);
    expect(columns.source).toBe('Source');
    // A real column header, as the other four are.
    expect(headers.map((header) => header.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col', 'col']);
    expect(body.map((row) => row[0])).toEqual(['BTC', 'ETH', 'BTC']);
    expect(body.map((row) => row.at(-1))).toEqual(['Bitstamp', 'Kraken', 'Bitcoinity (Mt. Gox) and CoinMarketCap']);
    expect(body[0]).toEqual(['BTC', '18 Dec 2017', '16 Dec 2018', '−83%', 'Bitstamp']);
    // The fall stays the numeric column; the publisher reads as text.
    const [first] = container.querySelectorAll('details tbody tr');
    expect(first?.children[3]?.className).toContain('text-right');
    expect(first?.children[4]?.className).not.toContain('text-right');
    expect(container.querySelector('details summary')?.textContent).toBe(learn.chart.summary);
  });

  it('rows of one basis keep the four columns, intraday or on daily closes', () => {
    for (const set of [falls(BITSTAMP, BITCOINITY), falls(KRAKEN)]) {
      const { headers, body, text } = table(set);
      expect(headers.map(text)).toEqual([columns.coin, columns.high, columns.low, columns.fall]);
      expect(body.every((row) => row.length === 4)).toBe(true);
      cleanup();
    }
  });

  // A row drawn from two series names both, joined in the page's language (docs/CONTENT-STYLE.md §1 rule 9, §3):
  // English keeps its "and", pt-PT and German their own word.
  it.each([
    ['pt-PT', 'Fonte', 'Bitcoinity (Mt. Gox) e CoinMarketCap'],
    ['de', 'Quelle', 'Bitcoinity (Mt. Gox) und CoinMarketCap'],
  ] as const)('a compound publisher in %s joins its names in that language', (language, source, compound) => {
    const { headers, body, text } = table(falls(BITSTAMP, KRAKEN, BITCOINITY), language);
    expect(headers.map(text).at(-1)).toBe(source);
    expect(body.map((row) => row.at(-1))).toEqual(['Bitstamp', 'Kraken', compound]);
  });

  // Stacked, each Source cell shows the column's name above the publisher from a custom property the chart's wrapper
  // carries, which the stylesheet draws (docs/DESIGN.md §8), so the cell's text stays the publisher alone.
  it.each([
    ['en', '"Source"'],
    ['pt-PT', '"Fonte"'],
    ['de', '"Quelle"'],
  ] as const)('a mixed set gives the chart the Source label in %s, and no cell an attribute', (language, label) => {
    const { container, body } = table(falls(BITSTAMP, KRAKEN), language);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.querySelector('details table')).not.toBeNull();
    expect(wrapper.style.getPropertyValue('--source-label')).toBe(label);
    expect(container.querySelector('[data-label]')).toBeNull();
    expect(body.map((row) => row.at(-1))).toEqual(['Bitstamp', 'Kraken']);
  });

  it('rows of one basis set no Source label', () => {
    const { container } = table(falls(BITSTAMP, BITCOINITY));
    const elements = [...container.querySelectorAll<HTMLElement>('*')];
    expect(elements.filter((element) => element.style.getPropertyValue('--source-label') !== '')).toEqual([]);
    expect(container.querySelector('[data-label]')).toBeNull();
  });

  // The public Learn page prerenders the chart and never hydrates it, so a style attribute there would meet the
  // hashed style-src (apps/web/vercel.json); the label is set after mount, never in the markup.
  it('the prerendered markup of a mixed set holds no style attribute', () => {
    const locales = localesFor('en', null);
    const f = createFormatters(locales.numbers, locales.ui);
    const html = renderToStaticMarkup(
      <I18nProvider locale="en" messages={{ learn }}>
        <DrawdownBars falls={falls(BITSTAMP, KRAKEN)} f={f} />
      </I18nProvider>,
    );
    expect(html).toContain('Kraken');
    expect(html).not.toContain('style=');
  });
});
