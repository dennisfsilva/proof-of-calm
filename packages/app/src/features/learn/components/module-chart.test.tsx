// @vitest-environment jsdom
import { loadCycleDrawdowns } from '@proofofcalm/content/cycles';
import { cleanup, render, screen } from '@testing-library/react';
import { countryLocales } from '@proofofcalm/content';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { localesFor } from '../../../lib/i18n/locale';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import learnDe from '../../../messages/de/learn.json';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { DRAWDOWN_COINS, DrawdownBars, fallPercent, ModuleChart } from './module-chart';

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

  it("marks the failed line with the UI's language on a pt-PT screen, inside an English body (ADR-0057)", async () => {
    const services = createTestServices();
    const failing = { ...services, redDay: { ...services.redDay, pastFalls: () => Promise.reject(new Error('x')) } };
    render(
      <ServicesProvider services={failing}>
        <I18nProvider locale="pt-PT" messages={{ learn: learnPt }}>
          <div lang="en">
            <ModuleChart chart="drawdowns-bar" />
          </div>
        </I18nProvider>
      </ServicesProvider>,
    );
    const line = await screen.findByText(learnPt.chart.failed);
    expect(line.tagName).toBe('P');
    expect(line.closest('[lang]')?.getAttribute('lang')).toBe('pt-PT');
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

// A chart's percentages take the page's formatters (ADR-0023's Decision, docs/CONTENT-STYLE.md §4 and §10): the stored
// plan's country's number locale, or the UI language's with no plan. So on a German screen the same fall reads
// `−94 %` with no plan and `−94%` under a plan in Portugal. The language is passed, never read from the device, and a
// percentage holds no date, so neither this machine's time zone nor CI's changes what these tests see.
describe("DrawdownBars: the page's number locale", () => {
  const barsIn = async (rules: Parameters<typeof localesFor>[1]) => {
    const locales = localesFor('de', rules);
    const f = createFormatters(locales.numbers, locales.ui);
    const services = createTestServices({ language: 'de' });
    const falls = await services.redDay.pastFalls(DRAWDOWN_COINS);
    const { container } = render(
      <ServicesProvider services={services}>
        <I18nProvider locale="de" messages={{ learn: learnDe }}>
          <DrawdownBars falls={falls} f={f} />
        </I18nProvider>
      </ServicesProvider>,
    );
    // The first bar, Bitcoin's from its 2011 high, the `−94 %` the German route showed (#502).
    const [first] = falls;
    if (first === undefined) throw new Error('no falls');
    const values = [...container.querySelectorAll('[data-slot="bar-chart-value"]')].map((value) => value.textContent);
    const cells = [...container.querySelectorAll('details tbody tr')].map((row) => row.lastElementChild?.textContent);
    return { written: fallPercent(f, first.fall), first, values, cells };
  };

  it('a German screen with no plan writes the first fall as de-DE does, a no-break space before the sign', async () => {
    const { written, first, values, cells } = await barsIn(null);
    expect([first.coin, first.high.slice(0, 4), first.fall]).toEqual(['BTC', '2011', '94']);
    // U+2212 for the sign (lib/format), U+00A0 between the numeral and `%`, as de-DE's percent format writes it.
    expect(written).toBe('−94 %');
    expect(values[0]).toBe(written);
    expect(cells[0]).toBe(written);
  });

  it('a German screen under a plan in Portugal writes the first fall as pt-PT does, with no space', async () => {
    const { written, values, cells } = await barsIn(countryLocales('PT'));
    expect(written).toBe('−94%');
    expect(values[0]).toBe(written);
    expect(cells[0]).toBe(written);
  });
});
