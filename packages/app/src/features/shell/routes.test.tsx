// @vitest-environment jsdom
import type { Instant, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../lib/i18n';
import { NavigationProvider, usePathname } from '../../lib/navigation';
import { ServicesProvider } from '../../lib/services';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../lib/services/testing';
import errors from '../../messages/en/errors.json';
import today from '../../messages/en/today.json';
import { AppRoutes } from './index';

// Under Vitest each import() is a round trip to the main process, even for a module already loaded, and
// under load it outlasted a findBy (2026-10-26): the profiles and the namespaces load once, here, and
// answer from memory (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
vi.mock('../../lib/i18n/namespaces', async (original) =>
  (await import('../../lib/services/testing-modules')).namespacesInMemory(
    await original<typeof import('../../lib/i18n/namespaces')>(),
  ),
);

afterEach(cleanup);

// The screens' modules and namespaces load while the file loads, outside any test's or hook's timeout,
// so a findBy below waits on renders, not on Vite's first transform of a chunk (seconds under load);
// React still resolves each lazy component on its first visit.
await preloadLazyModules([
  () => import('../learn').then((m) => m.loadLearnScreen()),
  () => import('../log'),
  () => import('../onboarding'),
  () => import('../plan'),
  () => import('../portfolio'),
  () => import('../settings'),
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_BODIES['start-here']?.()),
]);

const Path = () => <output data-testid="path">{usePathname()}</output>;

const shell = (initialPath: string) =>
  render(
    <NavigationProvider location="memory" initialPath={initialPath}>
      {/* The screens that read the plan need the services; not started, so the snapshot stays empty. */}
      <ServicesProvider services={createTestServices()}>
        <I18nProvider messages={{ today }}>
          <AppRoutes />
          <Path />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );

const screens: [string, string][] = [
  ['/today', 'Today'],
  ['/portfolio', 'Portfolio'],
  ['/log', 'Log'],
  ['/plan', 'Plan'],
  ['/settings', 'Settings'],
  ['/learn', 'Learn'],
  ['/onboarding', 'Set up a plan'],
];

describe('AppRoutes', () => {
  // First, before any test below resolves a chunk: React caches a lazy component once it has loaded,
  // so only the first visit to a lazy route in this file shows the fallback (ADR-0045 §9). The one
  // `main` is the shell's ScreenFrame, so the fallback and the screens render none.
  it('renders nothing while a lazy screen loads', async () => {
    shell('/portfolio');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Portfolio' })).toBeDefined();
  });

  it.each(screens)('%s renders its heading and no main', async (path, name) => {
    shell(path);
    expect(await screen.findByRole('heading', { level: 1, name })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe(path);
    expect(screen.queryByRole('main')).toBeNull();
  });

  // Today imports the feature for its link, so the feature's index must not pull the screen in with it.
  it('Learn still loads through `loadLearnScreen`', async () => {
    const learn = await import('../learn');
    expect(Object.keys(learn).sort()).toEqual([
      'ConditionLines',
      'CountryDateLine',
      'HoldingConditions',
      'WhyLink',
      'loadLearnScreen',
    ]);
    expect((await learn.loadLearnScreen()).default).toBeTypeOf('function');
    shell('/learn');
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
  });

  it('redirects any other path to /today', async () => {
    shell('/somewhere/else');
    expect(screen.getByTestId('path').textContent).toBe('/today');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeDefined();
  });

  // Learn nests its own routes: the unit project's virtual module holds start-here, risk-honestly and when-the-market-drops.
  it('/learn/start-here opens the module', async () => {
    shell('/learn/start-here');
    expect(await screen.findByRole('heading', { level: 1, name: 'Start here' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'A section' })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/learn/start-here');
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('a row of the index opens its module', async () => {
    shell('/learn');
    fireEvent.click(await screen.findByRole('link', { name: /^Start here/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Start here' })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/learn/start-here');
  });

  it('an unknown slug lands on /learn', async () => {
    shell('/learn/not-a-module');
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/learn');
  });

  it('a path below a module lands on /learn', async () => {
    shell('/learn/start-here/more');
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/learn');
  });

  it('the back link from a module returns to /learn', async () => {
    shell('/learn/start-here');
    fireEvent.click(await screen.findByRole('link', { name: 'Back to Learn' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/learn');
  });

  describe('the re-ask of the risk text (docs/DOMAIN.md §2.1)', () => {
    const fixture = fixtureSnapshot();
    const recorded = {
      ...fixture.plan,
      riskAcknowledgedAt: '2026-05-10T09:00:00.000Z' as Instant,
      riskWordingVersion: 1,
    } as Plan;

    /** The table over a plan that recorded version 1, with the current version as `riskWording`. */
    async function withPlan(initialPath: string, riskWording: number) {
      const services = createTestServices({ snapshot: { ...fixture, plan: recorded } });
      await services.start();
      const view = render(
        <NavigationProvider location="memory" initialPath={initialPath}>
          <ServicesProvider services={services}>
            <I18nProvider messages={{ errors, today }}>
              <AppRoutes riskWording={riskWording} />
              <Path />
            </I18nProvider>
          </ServicesProvider>
        </NavigationProvider>,
      );
      return () => {
        view.unmount();
        services.dispose();
      };
    }

    it('Today shows the re-ask when due, and Log stays open', async () => {
      const leave = await withPlan('/today', 2);
      expect(await screen.findByRole('heading', { level: 1, name: 'The risk text has changed' })).toBeDefined();
      expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).toBeNull();
      expect(screen.getByTestId('path').textContent).toBe('/today');
      leave();

      const leaveLog = await withPlan('/log', 2);
      expect(await screen.findByRole('heading', { level: 1, name: 'Log' })).toBeDefined();
      expect(screen.queryByRole('heading', { level: 1, name: 'The risk text has changed' })).toBeNull();
      leaveLog();
    });

    it('Today stays at the recorded version', async () => {
      const leave = await withPlan('/today', 1);
      await act(async () => undefined);
      expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeDefined();
      expect(screen.queryByRole('heading', { level: 1, name: 'The risk text has changed' })).toBeNull();
      leave();
    });
  });
});
