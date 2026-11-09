// @vitest-environment jsdom
import { loadCycleDrawdowns } from '@proofofcalm/content/cycles';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import { DRAWDOWN_COINS, ModuleChart } from './module-chart';

// The risk module's chart (docs/EDUCATION.md §2): the cycles file's rows through the red-day port, then, inside the
// element, the publishers as text, the source's span and the past-performance line (docs/LEGAL.md §3.4 and §4).

afterEach(cleanup);

const mount = (services = createTestServices()) =>
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ learn }}>
        <ModuleChart chart="drawdowns-bar" />
      </I18nProvider>
    </ServicesProvider>,
  );

describe('ModuleChart', () => {
  it('asks for every coin of the cycles file, in its order', () => {
    const loaded = loadCycleDrawdowns();
    if (!loaded.ok) throw new Error(loaded.error.join('; '));
    expect(DRAWDOWN_COINS).toEqual([...new Set(loaded.value.map(({ coin }) => coin))]);
  });

  it('draws one labelled bar per cycle, with its table', async () => {
    const { container } = mount();
    // Every bar's low is the lowest after its high, LINK's 2021 one included, which has not regained its high.
    const drawing = await screen.findByRole('img', { name: /^Falls from each high to the lowest low after it/ });
    // "for" keeps the list of coins apart from the dates when a screen reader reads the label.
    expect(drawing.getAttribute('aria-label')).toBe(
      'Falls from each high to the lowest low after it for BTC, ETH, LINK, and SOL, 8\u00a0Jun\u00a02011 to 10\u00a0Jun\u00a02023',
    );
    expect(container.querySelectorAll('[data-slot="bar-chart-bar"]')).toHaveLength(9);
    const values = [...container.querySelectorAll('[data-slot="bar-chart-value"]')].map((value) => value.textContent);
    expect(values.slice(0, 2)).toEqual(['−94%', '−87%']);
    expect(screen.getByText('BTC 2011')).toBeTruthy();
    expect(container.querySelectorAll('details tbody tr')).toHaveLength(9);
  });

  it('heads the table columns that hold dates as dates (docs/CONTENT-STYLE.md §1)', async () => {
    const { container } = mount();
    await screen.findByRole('img');
    const headers = [...container.querySelectorAll('details thead th')].map((header) => header.textContent);
    expect(headers).toEqual(['Coin', 'Date of high', 'Date of low', 'Fall']);
  });

  it('sets the sentence directly under the chart, each publisher once, as text with no link', async () => {
    const { container } = mount();
    await screen.findByRole('img');
    const figure = container.querySelector('[data-slot="bar-chart"]');
    const line = figure?.nextElementSibling;
    expect(line?.tagName).toBe('P');
    // One row's publisher is "Bitcoinity (Mt. Gox) and CoinMarketCap": split, CoinMarketCap is named once.
    expect(line?.textContent).toBe(
      'Bitcoinity (Mt. Gox), Bitstamp, Coinbase, and CoinMarketCap intraday highs and lows in US dollars, ' +
        "8\u00a0Jun\u00a02011 to 10\u00a0Jun\u00a02023; the falls are Proof of Calm's own computation. " +
        'Past performance is not a reliable indicator of future results. Risk disclosure',
    );
    // The one link is the Risk page's: no publisher links to an exchange (docs/LEGAL.md §3.4).
    const links = container.querySelectorAll('a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual(['/risk']);
    expect(container.contains(line ?? null)).toBe(true);
  });

  it('says so when the rows cannot be read', async () => {
    const services = createTestServices();
    const failing = { ...services, redDay: { ...services.redDay, pastFalls: () => Promise.reject(new Error('x')) } };
    mount(failing);
    expect(
      await screen.findByText('The earlier falls could not be loaded. Open this page again to retry.'),
    ).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws nothing for a chart it has no renderer for', () => {
    const { container } = render(
      <ServicesProvider services={createTestServices()}>
        <I18nProvider messages={{ learn }}>
          <ModuleChart chart="halvings-line" />
        </I18nProvider>
      </ServicesProvider>,
    );
    expect(container.innerHTML).toBe('');
  });
});
