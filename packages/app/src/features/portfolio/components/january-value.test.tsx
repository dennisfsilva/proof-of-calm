// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  type CalendarDate,
  type CountryRules,
  type CurrencyCode,
  type Decimal,
  type Entry,
  type Instant,
  type Plan,
  type PriceHistories,
  type PriceHistory,
  snapshotValue,
} from '@proofofcalm/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import messages from '../../../messages/en/portfolio.json';
import type { HistoriesState } from '../lib/use-histories';
import { JanuaryValue } from './january-value';

// The Dutch Portfolio line (docs/JURISDICTIONS.md §7.8, docs/DOMAIN.md §3.13): the value at the start of
// 1 January of the current calendar year, which is the end of 31 December before it, from the closes the
// screen already loaded, labelled as an estimate with the closes' date, the coins it covers and the credit.
// The fixture plan seen on 15 March 2030 holds 0.02215 BTC and 0.119 ETH since September 2026.

afterEach(cleanup);

const rulesOf = async (code: string): Promise<CountryRules> => {
  const profile = await loadProfile(code);
  if (profile === null) throw new Error(`no ${code} profile`);
  return countryRules(profile);
};
const NL = await rulesOf('NL');
const EVE = '2029-12-31' as CalendarDate;

const dutch = (fields: Partial<Plan> = {}): Plan => {
  const { plan } = fixtureSnapshot();
  if (plan === null) throw new Error('no fixture plan');
  return { ...plan, country: 'NL' as Plan['country'], countryRuleVersion: 1, holdingRule: { kind: 'none' }, ...fields };
};
const ENTRIES = fixtureSnapshot().entries;

/** Closes dated the eve, the day before and the day after, in `currency`; `without` has none on the eve. */
const histories = (currency = 'EUR', without: string | null = null): HistoriesState => {
  const days = (coin: string, close: string) =>
    [['2029-12-30', '1'], ...(coin === without ? [] : [[EVE, close]]), ['2030-01-01', '2']] as unknown as PriceHistory;
  return {
    status: 'ready',
    histories: {
      currency: currency as CurrencyCode,
      coins: { BTC: days('BTC', '50000'), ETH: days('ETH', '2000') } as PriceHistories['coins'],
    },
    fetchedAt: '2030-03-15T09:00:00.000Z' as Instant,
  };
};

async function mount(
  rules: CountryRules,
  state: HistoriesState = histories(),
  plan: Plan = dutch(),
  entries: readonly Entry[] = ENTRIES,
): Promise<HTMLElement> {
  const services = createTestServices({
    snapshot: { ...fixtureSnapshot(), plan, entries: [...entries] },
    nowMs: fixtureNowMs('sell'),
    rules: async () => NL,
  });
  await act(() => services.start());
  const { container } = render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ portfolio: messages }}>
        <JanuaryValue plan={plan} entries={entries} histories={state} rules={rules} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return container;
}

/** The text with every space one U+0020, as nl-NL spaces its amounts with U+00A0. */
const text = () => (document.body.textContent ?? '').replace(/\s/g, ' ');
const dutchFormat = createFormatters('nl-NL', 'en-GB');
const added = (date: string, deletedAt: string | null = null): Entry => {
  const [first] = ENTRIES;
  if (first === undefined) throw new Error('no fixture entry');
  return {
    ...first,
    id: `00000000-0000-4000-8000-0000000090${date.slice(8)}` as Entry['id'],
    kind: 'held',
    slot: null,
    date: date as CalendarDate,
    amount: null,
    deletedAt: deletedAt as Entry['deletedAt'],
  };
};

describe('JanuaryValue', () => {
  it.each(['PT', 'FR'])('renders nothing for the model of %s', async (code) => {
    const container = await mount(await rulesOf(code));
    expect(container.innerHTML).toBe('');
  });

  it('shows the Dutch value of 1 January as snapshotValue of the eve, an estimate dated and credited', async () => {
    await mount(NL);
    const ready = histories();
    if (ready.status !== 'ready') throw new Error('not ready');
    const expected = snapshotValue(dutch(), ENTRIES, ready.histories, EVE);
    // 0.02215 × 50,000 + 0.119 × 2,000.
    expect(expected.total).toBe('1345.5');
    expect(screen.getByText('Value on 1 January 2030')).toBeDefined();
    expect(text()).toContain(dutchFormat.money(expected.total as Decimal, 'EUR' as CurrencyCode).replace(/\s/g, ' '));
    const estimate = screen.getByText(
      'Estimate from the daily closes of 31 Dec 2029 for BTC and ETH · Price data by CoinGecko',
    );
    expect(estimate.className).toContain('text-14');
    expect(estimate.closest('a')).toBeNull();
    expect(text()).not.toMatch(/wealth|box 3|taxable/i);
  });

  it('names a coin without a close dated the eve, and shows no partial sum', async () => {
    await mount(NL, histories('EUR', 'ETH'));
    expect(
      screen.getByText('The price history has no daily close of 31 Dec 2029 for ETH, so there is no value to show.'),
    ).toBeDefined();
    expect(text()).not.toContain('€');
    expect(text()).not.toContain('Estimate');
  });

  it('counts a coin outside the loaded histories as missing', async () => {
    const state = histories();
    if (state.status !== 'ready') throw new Error('not ready');
    const coins = Object.fromEntries(Object.entries(state.histories.coins).filter(([coin]) => coin !== 'ETH'));
    await mount(NL, { ...state, histories: { ...state.histories, coins: coins as PriceHistories['coins'] } });
    expect(text()).toContain('for ETH, so there is no value to show.');
  });

  it('says it loads while a held coin waits for its closes', async () => {
    await mount(NL, { status: 'loading' });
    expect(screen.getByText('Loading the daily closes of 31 Dec 2029.')).toBeDefined();
  });

  it('names coins added after the eve only while such a live entry exists', async () => {
    await mount(NL, histories(), dutch(), [...ENTRIES, added('2029-12-31'), added('2030-01-02', '2030-01-03')]);
    expect(text()).not.toContain('Coins added');
    cleanup();
    await mount(NL, histories(), dutch(), [...ENTRIES, added('2030-01-02')]);
    expect(
      screen.getByText('Coins added in the Log with a date after 31 Dec 2029 are not in this value: BTC.'),
    ).toBeDefined();
  });

  it('with nothing held on the eve says so only while coins were added after it', async () => {
    const container = await mount(NL, histories(), dutch(), []);
    expect(container.innerHTML).toBe('');
    cleanup();
    await mount(NL, histories(), dutch(), [added('2030-01-02')]);
    expect(screen.getByText('The Log holds no coins at the end of 31 Dec 2029.')).toBeDefined();
    expect(text()).toContain('are not in this value: BTC.');
  });

  it('labels the currency the histories and the plan share', async () => {
    await mount(NL, histories('USD'), dutch({ payCurrency: 'USD' as Plan['payCurrency'] }));
    expect(text()).toContain(dutchFormat.money('1345.5' as never, 'USD' as CurrencyCode).replace(/\s/g, ' '));
    expect(text()).toContain('US$');
    expect(text()).not.toContain('€');
  });
});
