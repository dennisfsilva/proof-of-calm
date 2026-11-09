// @vitest-environment jsdom
import type { CalendarDate, CoinId, Percent } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, usePathname } from '../../../lib/navigation';
import type { PlanStore } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, episodeRedDay } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { RedDayBanner, type RedDayBannerProps } from './red-day-banner';
import { TodayScreen } from './today-screen';

// The red-day banner at Today's foot (docs/DOMAIN.md §3.11, docs/CONTENT-STYLE.md §3) over the fixture plan
// (BTC and ETH) on 20 October 2026.

afterEach(cleanup);
// jsdom has no `scrollIntoView`: Dismiss's focus move calls it, so it is stubbed and the focus test reads it.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;

const BTC = { coin: 'BTC' as CoinId, name: 'Bitcoin' };
const ETH = { coin: 'ETH' as CoinId, name: 'Ethereum' };
const SOL = { coin: 'SOL' as CoinId, name: 'Solana' };

const lastRed = (sevenDay: string | null, fromHigh90: string): RedDayBannerProps['lastRed'] => ({
  date: '2026-10-19' as CalendarDate,
  sevenDay: sevenDay as Percent | null,
  fromHigh90: fromHigh90 as Percent,
});

function Path() {
  return <output data-testid="path">{usePathname()}</output>;
}

function wrap(services: Services, children: ReactNode) {
  return (
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ shell, today }}>
          {children}
          <Path />
          <Toaster closeLabel="Close" toastManager={services.toasts} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>
  );
}

async function banner(props: Partial<RedDayBannerProps> = {}) {
  const services = createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  const handlers = { onOpen: vi.fn(), onDismiss: vi.fn() };
  render(wrap(services, <RedDayBanner lastRed={lastRed('-16.4', '-12')} coins={[BTC]} {...handlers} {...props} />));
  return handlers;
}

/** The sentence, its no-break spaces (the date's) read as spaces. */
const sentence = () => document.querySelector('[data-slot="banner-description"]')?.textContent?.replace(/ /gu, ' ');

describe('RedDayBanner', () => {
  it('names the seven-day fall of the one coin held, dated', async () => {
    await banner();
    expect(sentence()).toBe('Bitcoin fell 16% in the seven days to 19 Oct 2026.');
  });

  it('the seven-day fall first when both conditions fired', async () => {
    await banner({ lastRed: lastRed('-10', '-33.2') });
    expect(sentence()).toBe('Bitcoin fell 10% in the seven days to 19 Oct 2026.');
  });

  it('the fall from the 90-day high when only that one fired, or the week has no figure', async () => {
    await banner({ lastRed: lastRed('-9.9999', '-33.2') });
    expect(sentence()).toBe('On 19 Oct 2026 Bitcoin was 33% below its 90-day high.');
    cleanup();
    await banner({ lastRed: lastRed(null, '-30') });
    expect(sentence()).toBe('On 19 Oct 2026 Bitcoin was 30% below its 90-day high.');
  });

  it('one coin is named as the model names it, never by a lowercase id', async () => {
    await banner({ coins: [{ coin: 'bitcoin' as CoinId, name: 'Bitcoin' }] });
    expect(sentence()).toBe('Bitcoin fell 16% in the seven days to 19 Oct 2026.');
  });

  it('several coins: named in their order, the figure combined over the amounts held', async () => {
    await banner({ coins: [BTC, ETH] });
    expect(sentence()).toBe(
      'Bitcoin and Ethereum, in the amounts you hold, fell 16% in the seven days to 19 Oct 2026.',
    );
    cleanup();
    await banner({ coins: [BTC, ETH], lastRed: lastRed('-2', '-31') });
    expect(sentence()).toBe(
      'On 19 Oct 2026 Bitcoin and Ethereum, in the amounts you hold, were 31% below their combined 90-day high.',
    );
    cleanup();
    await banner({ coins: [ETH, SOL, BTC] });
    expect(sentence()).toBe(
      'Ethereum, Solana, and Bitcoin, in the amounts you hold, fell 16% in the seven days to 19 Oct 2026.',
    );
  });

  it('the link opens the page about the fall under way, and Dismiss calls back', async () => {
    const { onOpen, onDismiss } = await banner();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('link', { name: 'See the fall under way' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByTestId('path').textContent).toBe('/learn/fall-under-way');
  });
});

describe('the red-day banner on Today', () => {
  const refusing = (): PlanStore => ({
    ...memoryPlanStore(fixtureSnapshot()),
    update: () => Promise.reject(new Error('disk full')),
  });

  async function onToday(planStore: PlanStore) {
    const created = createTestServices({ planStore, nowMs: fixtureNowMs('buy') });
    const services = { ...created, redDay: episodeRedDay(lastRed('-16.4', '-12')) };
    await act(() => services.start());
    render(wrap(services, <TodayScreen />));
    await screen.findByText(/^Bitcoin fell/);
    return services;
  }

  it('records the episode on its first show, and Dismiss hides it with no toast', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    await onToday(planStore);
    await waitFor(() => expect(planStore.current().prefs.dismissedBanners).toEqual(['red-day:2026-10-15']));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/^Bitcoin fell/)).toBeNull();
    expect(screen.queryByText(today.redDay.failed)).toBeNull();
  });

  it('after Dismiss the focus is on Today’s heading once the banner is gone, brought into view by the least scroll', async () => {
    await onToday(memoryPlanStore(fixtureSnapshot()));
    const heading = document.getElementById('today-action');
    if (heading === null) throw new Error('no action card heading');
    const bannerAtFocus: (HTMLElement | null)[] = [];
    const focus = vi.spyOn(heading, 'focus').mockImplementation(function (this: HTMLElement, options) {
      bannerAtFocus.push(screen.queryByText(/^Bitcoin fell/));
      HTMLElement.prototype.focus.call(this, options);
    });
    scrolled.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(bannerAtFocus).toEqual([null]);
    expect(scrolled.mock.contexts).toEqual([heading]);
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('a write that keeps failing: Dismiss hides it and the toast says it may show again', async () => {
    await onToday(refusing());
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/^Bitcoin fell/)).toBeNull();
    expect(await screen.findByText(today.redDay.failed)).toBeDefined();
  });
});
