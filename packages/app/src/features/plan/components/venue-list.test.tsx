// @vitest-environment jsdom
import type { CalendarDate, CoinId, Units } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import type { CoinVenues } from '../lib/venues';
import { VenueList } from './venue-list';

// The review page's third part (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page (M2)"): the units the Log
// shows at each venue at the end of the day, one line per venue at the coin's decimals, the count of one-tap
// estimates, and the way to the Log. It writes nothing.

afterEach(cleanup);

const today = '2026-10-20' as CalendarDate;
const line = (venue: string | null, units: string) => ({ venue, units: units as Units });
const coin = (id: string, decimals: number, venues: CoinVenues['venues'], estimated = 0): CoinVenues => ({
  coin: id as CoinId,
  decimals,
  venues,
  estimated,
});

async function mount(venues: readonly CoinVenues[]) {
  const write = vi.fn();
  const services = createTestServices({
    planStore: (() => {
      const memory = memoryPlanStore(fixtureSnapshot());
      return {
        ...memory,
        write: (...args: Parameters<typeof memory.write>) => {
          write(...args);
          return memory.write(...args);
        },
      };
    })(),
  });
  await act(() => services.start());
  const draft = vi.spyOn(services.drafts, 'write');
  render(
    <NavigationProvider location="memory" initialPath="/plan/review">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ plan, shell }}>
          <VenueList venues={venues} today={today} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return { write, draft };
}

const flat = (element: HTMLElement) => element.textContent?.replace(/\s+/gu, ' ').trim();

describe('VenueList', () => {
  it('names the day, then one line per venue at the coin decimals, in order', async () => {
    await mount([
      coin('BTC', 8, [line('Kraken', '0.01'), line('Ledger', '0.0099'), line(null, '0.001')]),
      coin('SOL', 8, [line('kraken', '2')]),
      coin('ETH', 6, [line('Kraken', '0.5')]),
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Where your coins are' })).toBeDefined();
    expect(
      screen.getByText(
        'At the end of 20 Oct 2026, after the sales and moves dated on or before it, the Log shows these units at each venue.',
      ),
    ).toBeDefined();
    const coins = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(coins).toEqual(['BTC', 'SOL', 'ETH']);
    const lists = screen.getAllByRole('list');
    expect(
      within(lists[0] as HTMLElement)
        .getAllByRole('listitem')
        .map(flat),
    ).toEqual(['Kraken 0.01000000 BTC', 'Ledger 0.00990000 BTC', 'With no venue 0.00100000 BTC']);
    expect(
      within(lists[1] as HTMLElement)
        .getAllByRole('listitem')
        .map(flat),
    ).toEqual(['kraken 2.00000000 SOL']);
    expect(
      within(lists[2] as HTMLElement)
        .getAllByRole('listitem')
        .map(flat),
    ).toEqual(['Kraken 0.500000 ETH']);
    expect(screen.queryByText(/The Log shows no coins/)).toBeNull();
  });

  it('spaces one coin from the next wider than the lines inside a coin (docs/DESIGN.md §6)', async () => {
    await mount([coin('BTC', 8, [line('Kraken', '0.01')]), coin('ETH', 6, [line('Kraken', '0.5')])]);
    const groups = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.parentElement);
    const wrapper = groups[0]?.parentElement;
    expect(groups[1]?.parentElement).toBe(wrapper);
    expect(wrapper?.tagName).toBe('DIV');
    expect(wrapper?.classList.contains('gap-stack-md')).toBe(true);
    expect(groups[0]?.classList.contains('gap-stack-xs')).toBe(true);
  });

  it('gives the estimate line only for a count above 0, the count as a figure', async () => {
    await mount([coin('BTC', 8, [line(null, '0.014')], 1234), coin('ETH', 6, [line(null, '0.5')], 0)]);
    expect(
      screen.getByText(
        "Bought as planned estimated the units of 1,234 BTC entries from the day's price. Your exchange's confirmations have the exact units.",
      ),
    ).toBeDefined();
    expect(screen.getAllByText(/^Bought as planned estimated/)).toHaveLength(1);
    cleanup();
    await mount([coin('BTC', 8, [line(null, '0.001')], 1)]);
    expect(
      screen.getByText(
        "Bought as planned estimated the units of 1 BTC entry from the day's price. Your exchange's confirmation has the exact units.",
      ),
    ).toBeDefined();
  });

  it('with nothing held, one line says so with the date, and the way to the Log stays', async () => {
    await mount([]);
    expect(screen.getByText('The Log shows no coins held at the end of 20 Oct 2026.')).toBeDefined();
    expect(screen.queryByText(/^At the end of/)).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the Log' })).toBeDefined();
  });

  it('a figure that differs leads to the Log through Open the Log', async () => {
    await mount([coin('BTC', 8, [line(null, '0.001')])]);
    expect(
      screen.getByText(
        "Where your exchange or wallet shows other units, log the missing purchase, sale, move, or coins received, or correct an entry's units, venue, or date.",
      ),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open the Log' }).getAttribute('href')).toBe('/log');
  });

  it('writes nothing to the store or the session drafts, and offers no field', async () => {
    const { write, draft } = await mount([coin('BTC', 8, [line('Kraken', '0.01'), line(null, '0.001')], 2)]);
    fireEvent.click(screen.getByRole('link', { name: 'Open the Log' }));
    expect(write).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
