// @vitest-environment jsdom
import type { Plan } from '@proofofcalm/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import type { UiLanguage } from '../../../lib/i18n/locale';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import type { PastFall, RedDayModel } from '../../../lib/services/red-day-types';
import { createTestServices } from '../../../lib/services/testing';
import learnDe from '../../../messages/de/learn.json';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { ThisFallView } from './this-fall-page';

// The fall page's line for each earlier fall ends with the row's publisher (docs/CONTENT-STYLE.md §3); a row drawn
// from two series names both, joined in the page's language (§1 rule 9): English keeps its "and", pt-PT and German
// their own word.

afterEach(cleanup);

// Synthetic rows: dates no row of the cycles file holds.
const FALLS = [
  {
    coin: 'BTC',
    high: '2011-06-09',
    low: '2011-11-21',
    fall: '93',
    publisher: 'Bitcoinity (Mt. Gox) and CoinMarketCap',
  },
  { coin: 'BTC', high: '2017-12-18', low: '2018-12-16', fall: '83', publisher: 'Bitstamp' },
] as unknown as readonly PastFall[];

// No figure, so the page shows its failure line, then the held coin's earlier falls.
const MODEL = {
  state: 'failed',
  held: [{ coin: 'BTC', name: 'Bitcoin' }],
  figure: null,
  episode: null,
  lastRed: null,
  nextBuy: null,
  buyDayToday: false,
} as unknown as RedDayModel;

const MESSAGES = { en: learn, 'pt-PT': learnPt, de: learnDe } as const;

function rows(language: UiLanguage) {
  const plan = { ...(fixtureSnapshot().plan as Plan), why: '' };
  render(
    <NavigationProvider location="memory" initialPath="/learn/fall-under-way">
      <ServicesProvider services={createTestServices({ language })}>
        <I18nProvider locale={language} messages={{ learn: MESSAGES[language] }}>
          <ThisFallView plan={plan} model={MODEL} falls={FALLS} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return screen.getAllByRole('listitem').map(({ textContent }) => (textContent ?? '').replaceAll(/[  ]/g, ' '));
}

describe('ThisFallView: the publisher of each earlier fall', () => {
  it.each([
    ['en', 'Bitcoinity (Mt. Gox) and CoinMarketCap'],
    ['pt-PT', 'Bitcoinity (Mt. Gox) e CoinMarketCap'],
    ['de', 'Bitcoinity (Mt. Gox) und CoinMarketCap'],
  ] as const)('a compound publisher in %s joins its names in that language', (language, compound) => {
    const [first, second] = rows(language);
    expect(first).toMatch(new RegExp(` · ${compound.replaceAll(/[().]/g, '\\$&')}$`));
    expect(second).toMatch(/ · Bitstamp$/);
  });
});
