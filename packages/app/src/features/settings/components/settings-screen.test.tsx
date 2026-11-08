// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import today from '../../../messages/en/today.json';
import { AppRoutes } from '../../shell';
import { SettingsScreen } from './settings-screen';

// Settings' four tabs over packages/ui's Tabs (docs/DESIGN.md §8): Plan, Coins & split, Hold & sell, Currency &
// data, in that order, one tab stop with the arrow keys between them. The screen mounts once the services are ready,
// as the shell's first-boot gate mounts it: on Plan with a plan, on Currency & data without one.

// Under Vitest each import() is a round trip to the main process, even for a module already loaded, and
// under load it outlasted a findBy (2026-10-26): the profiles and the namespaces load once, here, and
// answer from memory (lib/services/testing-modules.ts). Registering a namespace still waits for the route.
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
vi.mock('../../../lib/i18n/namespaces', async (original) =>
  (await import('../../../lib/services/testing-modules')).namespacesInMemory(
    await original<typeof import('../../../lib/i18n/namespaces')>(),
  ),
);

afterEach(cleanup);
// The settings module behind the route, the profiles and the namespaces load while the file loads, outside
// any test's timeout, so a findBy waits on renders, not on Vite's first transform (seconds under load). It
// registers no namespace: the cold mount below still starts from an empty registry.
await preloadLazyModules([() => import('../index')]);

async function started(snapshot: Snapshot = fixtureSnapshot()): Promise<Services> {
  const services = createTestServices({ snapshot });
  await services.start();
  return services;
}

const tabs = () => screen.getAllByRole('tab').map((tab) => tab.textContent);
const selected = () => screen.getByRole('tab', { selected: true }).textContent;

describe('SettingsScreen', () => {
  // First, while the registry holds no lazy namespace: the route loads the Plan editors' messages with the
  // screen (ADR-0045 §8), so a cold /settings never shows a bare key.
  it('a cold mount of /settings shows the Plan tab with its messages, no bare keys', async () => {
    const services = await started();
    render(
      <NavigationProvider location="memory" initialPath="/settings">
        <ServicesProvider services={services}>
          <I18nProvider messages={{ today }}>
            <AppRoutes />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
    expect(await screen.findByRole('group', { name: 'Amounts and dates' })).toBeDefined();
    expect(document.body.textContent).not.toMatch(/\b(plan|settings|errors)\.[a-zA-Z]/);
    services.dispose();
  });

  // The empty state's "import a file" leads to /settings, where the person already is: on these tabs it
  // opens Currency & data instead, with the focus on its tab, and "Set up a plan" still leads to onboarding.
  it.each(['Plan', 'Coins & split', 'Hold & sell'])(
    'opens Currency & data from the empty state on %s',
    async (name) => {
      const services = await started({ ...fixtureSnapshot(), plan: null, entries: [] });
      render(
        <NavigationProvider location="memory" initialPath="/settings">
          <ServicesProvider services={services}>
            <I18nProvider messages={{ today }}>
              <AppRoutes />
            </I18nProvider>
          </ServicesProvider>
        </NavigationProvider>,
      );
      const user = userEvent.setup({ document });
      await user.click(await screen.findByRole('tab', { name }));
      expect(screen.getByRole('link', { name: 'Set up a plan' }).getAttribute('href')).toBe('/onboarding');
      await user.click(screen.getByRole('button', { name: 'import a file' }));
      expect(selected()).toBe('Currency & data');
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Currency & data' }));
      expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeDefined();
      services.dispose();
    },
  );

  async function mount(snapshot?: Snapshot, location: 'memory' | 'hash' = 'memory') {
    const services = await started(snapshot);
    render(
      <NavigationProvider location={location} initialPath="/settings">
        <ServicesProvider services={services}>
          <I18nProvider messages={{ settings, plan, errors, today }}>
            <SettingsScreen />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
    await act(() => Promise.resolve());
    return services;
  }

  it('shows the four tabs in order and opens on Plan when there is a plan', async () => {
    await mount();
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeDefined();
    expect(tabs()).toEqual(['Plan', 'Coins & split', 'Hold & sell', 'Currency & data']);
    expect(selected()).toBe('Plan');
    expect(screen.getByRole('group', { name: 'Amounts and dates' })).toBeDefined();
  });

  it('opens on Currency & data without a plan, where a backup can be imported', async () => {
    await mount({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(selected()).toBe('Currency & data');
    expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeDefined();
  });

  it('moves along the tabs with the arrow keys and opens one with Enter', async () => {
    await mount();
    const user = userEvent.setup({ document });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Plan' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Coins & split' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Hold & sell' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Currency & data' }));
    await user.keyboard('{Enter}');
    expect(selected()).toBe('Currency & data');
    expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeDefined();
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(screen.getByRole('group', { name: 'Holding rule' })).toBeDefined();
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(screen.getByRole('group', { name: 'Coins & split' })).toBeDefined();
  });

  // Settings → About (docs/LEGAL.md §5, ADR-0047): the site line with its Risk link and the other legal pages, at
  // the foot of the screen below the tabs, so the installed app reaches every legal page.
  const SITE_LINE = 'Data and tools, not advice. Crypto-assets can lose all their value.';
  const LEGAL = [
    ['Risk disclosure', '/risk'],
    ['Terms of use', '/terms'],
    ['Privacy notice', '/privacy'],
    ['Cookie-free statement', '/cookies'],
    ['Contact', '/contact'],
  ];
  const about = () => screen.getByRole('region', { name: 'About' });
  const links = () =>
    within(about())
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')]);

  it('ends with About below the tabs: the site line, the Risk link and the four other legal pages', async () => {
    await mount();
    const block = about();
    expect(block.textContent).toContain(SITE_LINE);
    expect(links()).toEqual(LEGAL);
    const tablist = screen.getByRole('tablist', { name: 'Settings' });
    expect(tablist.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(block).queryByRole('tab')).toBeNull();
  });

  it('shows About without a plan as well', async () => {
    await mount({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(links()).toEqual(LEGAL);
  });

  // Like every Risk link in the app, plain anchors to the site pages, never the navigation adapter: on the
  // static-export host's hash location they keep the site path (the Capacitor host's links are M3's).
  it('keeps the site paths on the hash location of the static-export host', async () => {
    await mount(undefined, 'hash');
    expect(links()).toEqual(LEGAL);
  });
});
