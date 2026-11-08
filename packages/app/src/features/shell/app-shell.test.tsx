// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CountryRules, DEFAULT_PREFS, err, ok, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { aPlan } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore, pricesLine } from '../../lib/adapters';
import { I18nProvider } from '../../lib/i18n';
import { Link, NavigationProvider, Redirect, usePathname } from '../../lib/navigation';
import type { PriceSource } from '../../lib/ports';
import type { UpdatePrompt } from '../../lib/pwa';
import { type Services, ServicesProvider, useClock, usePrices, useRules, useServices } from '../../lib/services';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES, pricesAt, TEST_NOW_MS } from '../../lib/services/testing';
import { APPEARANCE_STORAGE_KEY } from '../../lib/theme';
import errors from '../../messages/en/errors.json';
import shell from '../../messages/en/shell.json';
import { AppShell } from './index';
import { ScreenPending } from './screen-frame';

// The shell (ADR-0045 §9, §14; docs/DESIGN.md §7): the header, the tab bar and the toast viewport around
// the screen area, which waits for the services to start, and the effects a host used to hold. Fake
// timers stand in for the clock; `hasFocus` is true because jsdom has no system focus (see toast.test).

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-motion');
});

type Options = { path?: string; registerUpdates?: (onUpdateReady: (update: UpdatePrompt) => () => void) => void };

function renderShell(services: Services, { path = '/today', registerUpdates }: Options = {}) {
  return render(
    <ServicesProvider services={services}>
      <NavigationProvider location="memory" initialPath={path}>
        <I18nProvider messages={{ errors, shell }}>
          <AppShell registerUpdates={registerUpdates}>
            <div>
              <h1>The screen</h1>
            </div>
          </AppShell>
        </I18nProvider>
      </NavigationProvider>
    </ServicesProvider>,
  );
}

const start = (services: Services) => act(() => services.start());
const passTime = (ms: number) => act(() => vi.advanceTimersByTime(ms));
/** The toast on screen, or null: a closed toast stays in the document, hidden, while it fades out. */
const shown = () => document.querySelector<HTMLElement>('[data-slot="toast"]:not([hidden])');
const links = (name: string) => screen.getAllByRole('link', { name });

describe('AppShell', () => {
  it('renders the wordmark, the destinations in the header and the tab bar, and the gear', async () => {
    const services = createTestServices();
    renderShell(services, { path: '/log' });
    await start(services);
    expect(screen.getByRole('link', { name: 'Proof of Calm' }).getAttribute('href')).toBe('/today');
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(2);
    for (const name of ['Today', 'Portfolio', 'Log', 'Learn']) expect(links(name)).toHaveLength(2);
    for (const link of links('Log')) expect(link.getAttribute('aria-current')).toBe('page');
    for (const link of links('Today')) expect(link.getAttribute('aria-current')).toBeNull();
    const gear = screen.getByRole('link', { name: 'Settings' });
    expect(gear.getAttribute('href')).toBe('/settings');
    expect(gear.getAttribute('aria-current')).toBeNull();
  });

  it('marks the gear current on Settings and scrolls to the top on every new pathname', async () => {
    const services = createTestServices();
    renderShell(services, { path: '/settings' });
    await start(services);
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    const [log] = links('Log');
    if (log === undefined) throw new Error('no Log link');
    fireEvent.click(log);
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("moves focus to the new screen's heading on a route change, never on the first screen", async () => {
    const services = createTestServices();
    let resolve: (module: { default: () => ReactNode }) => void = () => undefined;
    const Learn = lazy(() => new Promise<{ default: () => ReactNode }>((done) => (resolve = done)));
    function Screens() {
      const pathname = usePathname();
      if (pathname === '/') return <Redirect to="/plan" replace />;
      if (pathname === '/learn') return <Learn />;
      return (
        <div>
          <h1>{pathname === '/settings' ? 'Settings' : 'Plan'}</h1>
          <Link href={pathname === '/settings' ? '/learn' : '/settings'}>Next</Link>
        </div>
      );
    }
    render(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell>
              <Suspense fallback={<ScreenPending />}>
                <Screens />
              </Suspense>
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    await start(services);
    // The first screen, also after the redirect from "/", keeps the focus where the page starts.
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeDefined();
    expect(document.activeElement).toBe(document.body);
    // "Edit plan" and the like: the heading of the screen it opens takes the focus.
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));
    const settings = screen.getByRole('heading', { level: 1, name: 'Settings' });
    expect(document.activeElement).toBe(settings);
    expect(settings.getAttribute('tabindex')).toBe('-1');
    // A screen whose chunk is still loading takes it once its heading is there.
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));
    await act(async () => resolve({ default: () => <h1>Learn</h1> }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Learn' }));
  });

  it('keeps the screen area busy until the services have started, then shows the screen', async () => {
    const services = createTestServices();
    renderShell(services);
    const main = document.getElementById('main');
    expect(main?.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'The screen' })).toBeNull();
    await start(services);
    expect(document.getElementById('main')?.getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('heading', { name: 'The screen' })).toBeDefined();
  });

  it('waits for the plan’s rules on the first boot only: a write of another country keeps the screen', async () => {
    const answers = new Map<string, (rules: null) => void>();
    const rules = (country: string) => new Promise<null>((resolve) => answers.set(country, resolve));
    const services = createTestServices({ snapshot: { ...EMPTY_SNAPSHOT, plan: aPlan() }, rules });
    function Screen() {
      const { domain } = useServices();
      const [moves, setMoves] = useState(0);
      const move = () => {
        setMoves(moves + 1);
        void domain.write((snapshot) => ({ plan: snapshot.plan && { ...snapshot.plan, country: 'DE' } }));
      };
      return (
        <div>
          <input aria-label="Amount" />
          <button type="button" onClick={move}>
            Move {moves}
          </button>
        </div>
      );
    }
    render(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/plan">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell>
              <Screen />
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    const busy = () => document.getElementById('main')?.getAttribute('aria-busy') ?? null;
    const started = services.start();
    await act(async () => vi.waitFor(() => expect(answers.has('PT')).toBe(true)));
    expect(busy()).toBe('true');
    expect(screen.queryByRole('textbox', { name: 'Amount' })).toBeNull();
    await act(async () => {
      answers.get('PT')?.(null);
      await started;
    });
    expect(busy()).toBeNull();
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' });
    input.focus();
    fireEvent.change(input, { target: { value: '42' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Move 0' }));
      await vi.waitFor(() => expect(services.domain.store.getState().snapshot.plan?.country).toBe('DE'));
    });
    expect(answers.has('DE')).toBe(true);
    expect(busy()).toBeNull();
    expect(screen.getByRole('button', { name: 'Move 1' })).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Amount' })).toBe(input);
    expect(input.value).toBe('42');
    expect(document.activeElement).toBe(input);
    await act(async () => answers.get('DE')?.(null));
    expect(busy()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('after onboarding’s first plan write, keeps the screen while the rules load, without a holding date (#101)', async () => {
    let answer: (rules: CountryRules | null) => void = () => undefined;
    const rules = () => new Promise<CountryRules | null>((resolve) => (answer = resolve));
    const services = createTestServices({ planStore: memoryPlanStore(EMPTY_SNAPSHOT), rules });
    function Today() {
      const { domain } = useServices();
      const loaded = useRules() !== null;
      return (
        <div>
          <h1>Today</h1>
          <p>{loaded ? 'Holding date' : 'No holding date yet'}</p>
          <button type="button" onClick={() => void domain.write(() => ({ plan: aPlan() }))}>
            Start
          </button>
        </div>
      );
    }
    render(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/today">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell>
              <Today />
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    await start(services);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await vi.waitFor(() => expect(services.domain.store.getState().snapshot.plan).not.toBeNull());
    });
    expect(document.getElementById('main')?.getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeDefined();
    expect(screen.getByText('No holding date yet')).toBeDefined();
    const profile = await loadProfile(aPlan().country);
    if (profile === null) throw new Error('the plan’s country has a profile');
    await act(async () => answer(countryRules(profile)));
    expect(screen.getByText('Holding date')).toBeDefined();
  });

  it('keeps one busy main while a lazy screen loads, and the same one, idle, once it has', async () => {
    const services = createTestServices();
    let resolve: (module: { default: () => ReactNode }) => void = () => undefined;
    const Lazy = lazy(() => new Promise<{ default: () => ReactNode }>((done) => (resolve = done)));
    render(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/log">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell>
              <Suspense fallback={<ScreenPending />}>
                <Lazy />
              </Suspense>
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    const mains = () => screen.getAllByRole('main', { hidden: true });
    expect(mains()).toHaveLength(1);
    expect(mains()[0]?.getAttribute('aria-busy')).toBe('true');
    await start(services);
    expect(mains()).toHaveLength(1);
    expect(mains()[0]?.id).toBe('main');
    expect(mains()[0]?.getAttribute('aria-busy')).toBe('true');
    await act(async () => resolve({ default: () => <h1>The lazy screen</h1> }));
    expect(screen.getByRole('heading', { name: 'The lazy screen' })).toBeDefined();
    expect(mains()).toHaveLength(1);
    expect(mains()[0]?.getAttribute('aria-busy')).toBeNull();
  });

  it('starts with a skip link that focuses main without changing the location', async () => {
    const services = createTestServices();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    renderShell(services);
    await start(services);
    const tabbable = document.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]:not([tabindex="-1"])');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(tabbable[0]).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#main');
    const before = window.location.href;
    fireEvent.click(skip);
    expect(document.activeElement).toBe(document.getElementById('main'));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(before);
  });

  it('shows the failure screen when the plan store cannot be opened, and tries again from its button', async () => {
    let attempts = 0;
    const planStore = {
      ...memoryPlanStore(),
      load: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('IndexedDB is not available');
        return EMPTY_SNAPSHOT;
      },
    };
    const services = createTestServices({ planStore });
    const again = vi.spyOn(services, 'start');
    renderShell(services);
    await start(services);
    expect(screen.getByRole('heading', { name: 'Your data could not be opened.' })).toBeDefined();
    expect(screen.queryByText('IndexedDB is not available')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'The screen' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(again).toHaveBeenCalledTimes(2);
    expect(attempts).toBe(2);
    expect(screen.getByRole('heading', { name: 'The screen' })).toBeDefined();
  });

  it('holds an undo toast while its action has focus, and closes it a window after focus leaves', async () => {
    const services = createTestServices();
    renderShell(services);
    await start(services);
    const undo = vi.fn();
    act(() => {
      services.toasts.add({
        title: 'Entry deleted',
        timeout: UNDO_WINDOW_MS,
        actionProps: { children: 'Undo', onClick: undo },
      });
    });
    expect(shown()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    passTime(20_000);
    expect(shown()).not.toBeNull();
    act(() => screen.getByRole('link', { name: 'Settings' }).focus());
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('applies the stored appearance once the snapshot is ready and rewrites the mirror from it', async () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: 'light', motion: 'system' }));
    document.documentElement.setAttribute('data-theme', 'light');
    const services = createTestServices({
      snapshot: { ...EMPTY_SNAPSHOT, prefs: { ...DEFAULT_PREFS, theme: 'dark', motion: 'reduce' } },
    });
    renderShell(services);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await start(services);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-motion')).toBe('reduce');
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual({
      theme: 'dark',
      motion: 'reduce',
    });
  });

  it('registers for updates once, with a handler that shows the update toast through the manager', async () => {
    const services = createTestServices();
    const registerUpdates = vi.fn();
    const { rerender } = renderShell(services, { registerUpdates });
    await start(services);
    rerender(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/today">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell registerUpdates={registerUpdates}>
              <div />
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    expect(registerUpdates).toHaveBeenCalledTimes(1);
    const onUpdateReady = registerUpdates.mock.calls[0]?.[0] as (update: UpdatePrompt) => () => void;
    const update = { accept: vi.fn(), dismiss: vi.fn() };
    act(() => void onUpdateReady(update));
    expect(screen.getByText('A new version is ready.')).toBeDefined();
    passTime(60_000);
    expect(shown()).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    });
    expect(update.accept).toHaveBeenCalledTimes(1);
  });

  it('hands the update handler over only after the first boot and the first prices refresh settle', async () => {
    const services = createTestServices();
    let answer = () => undefined as void;
    const refresh = vi.spyOn(services.prices, 'refresh').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    const registerUpdates = vi.fn();
    renderShell(services, { registerUpdates });
    expect(registerUpdates).not.toHaveBeenCalled();
    await start(services);
    expect(refresh).toHaveBeenCalled();
    expect(registerUpdates).not.toHaveBeenCalled();
    await act(async () => answer());
    expect(registerUpdates).toHaveBeenCalledTimes(1);
  });

  it('ticks and refreshes the prices once ready, and again when the page becomes visible', async () => {
    const services = createTestServices();
    const refresh = vi.spyOn(services.prices, 'refresh');
    const tick = vi.spyOn(services, 'tick');
    renderShell(services);
    expect(refresh).not.toHaveBeenCalled();
    await start(services);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    passTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(refresh).toHaveBeenCalledTimes(2);
    passTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('refreshes the prices when the network comes back, so a failed offline refresh does not keep the line offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    let reachable = false;
    const priceSource: PriceSource = {
      latest: async (currency) =>
        reachable ? ok({ ...pricesAt(FIXTURE_PRICES, TEST_NOW_MS), currency }) : err({ kind: 'network' }),
    };
    // Stored prices older than the client TTL, so every refresh asks the source.
    const snapshot = { ...fixtureSnapshot(), prices: pricesAt(FIXTURE_PRICES, TEST_NOW_MS - 5 * 60_000) };
    const services = createTestServices({ snapshot, priceSource });
    const refresh = vi.spyOn(services.prices, 'refresh');
    function Line() {
      const { state, failure } = usePrices();
      const clock = useClock();
      const line = pricesLine(state, { now: clock.now(), timeZone: clock.timeZone, online: navigator.onLine, failure });
      return <p data-testid="line">{line.code}</p>;
    }
    render(
      <ServicesProvider services={services}>
        <NavigationProvider location="memory" initialPath="/today">
          <I18nProvider messages={{ errors, shell }}>
            <AppShell>
              <Line />
            </AppShell>
          </I18nProvider>
        </NavigationProvider>
      </ServicesProvider>,
    );
    await start(services);
    await act(() => refresh.mock.results.at(-1)?.value);
    expect(services.ui.getState().pricesFailure).toEqual({ kind: 'network' });
    expect(screen.getByTestId('line').textContent).toBe('offline');

    const before = refresh.mock.calls.length;
    onLine.mockReturnValue(true);
    reachable = true;
    act(() => void window.dispatchEvent(new Event('online')));
    expect(refresh).toHaveBeenCalledTimes(before + 1);
    await act(() => refresh.mock.results.at(-1)?.value);
    expect(services.ui.getState().pricesFailure).toBeNull();
    expect(screen.getByTestId('line').textContent).toBe('live');
  });
});
