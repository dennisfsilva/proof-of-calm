// @vitest-environment jsdom
import { instant } from '@proofofcalm/core/testing';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import shell from '../../../messages/en/shell.json';
import { LogScreen } from './log-screen';

// The Log's set-aside line (ADR-0019 Readings, 2026-11-26): saved entries that could not be read and are still
// missing, how to bring them back and Hide this line, which writes `set-aside:<n>` and moves focus to the title;
// and the empty text while the plan row is set aside. `hasFocus` is true because jsdom has no system focus.

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
await preloadLazyModules();

const AT = instant('2026-10-01T08:00:00.000Z');
const LINE = /^1 saved entry could not be read, so it is not in this list\. To bring it back, import a JSON backup/;
const HIDE = 'Hide this line';

function withSetAside(entries: Snapshot['setAside']['entries'], plans: Snapshot['setAside']['plans'] = []): Snapshot {
  return { ...fixtureSnapshot(), quarantined: entries.length + plans.length, setAside: { plans, entries } };
}

async function mount(planStore: PlanStore) {
  const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log, shell }}>
        <Toaster closeLabel="Close" toastManager={services.toasts}>
          <LogScreen />
        </Toaster>
      </I18nProvider>
    </ServicesProvider>,
  );
  return services;
}

describe('LogScreen: the set-aside line', () => {
  it('shows nothing while no entry is set aside', async () => {
    await mount(memoryPlanStore(fixtureSnapshot()));
    expect(screen.queryByText(/could not be read/)).toBeNull();
    expect(screen.queryByRole('button', { name: HIDE })).toBeNull();
  });

  it('shows nothing once the set-aside entry is stored again', async () => {
    const back = fixtureSnapshot().entries[0];
    await mount(memoryPlanStore(withSetAside([{ id: back?.id ?? '', at: AT }])));
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('says how to bring a missing entry back, with the day it was set aside and a link to Settings', async () => {
    await mount(memoryPlanStore(withSetAside([{ id: 'gone', at: AT }])));
    const line = screen.getByText(LINE);
    expect(line.textContent).toMatch(/exported before 1\sOct\s2026 in Settings with Add missing entries only/);
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('button', { name: HIDE })).toBeTruthy();
  });

  it('hides the line by writing set-aside:<n> and moves focus to the title', async () => {
    const snapshot = withSetAside([{ id: 'gone', at: AT }]);
    const services = await mount(
      memoryPlanStore({ ...snapshot, prefs: { ...snapshot.prefs, dismissedBanners: ['set-aside:3'] } }),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: HIDE })));
    expect(services.domain.store.getState().snapshot.prefs.dismissedBanners).toStrictEqual(['set-aside:1']);
    expect(screen.queryByText(LINE)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Log', level: 1 }));
  });

  it('keeps the line and focus on the button and says so when the write fails', async () => {
    const store = memoryPlanStore(withSetAside([{ id: 'gone', at: AT }]));
    const services = await mount({
      ...store,
      write: async () => {
        throw new Error('QuotaExceededError');
      },
    });
    const button = screen.getByRole('button', { name: HIDE });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(services.domain.store.getState().snapshot.prefs.dismissedBanners).toStrictEqual([]);
    expect(document.activeElement).toBe(button);
    expect(screen.getByText(LINE)).toBeTruthy();
    expect(screen.getByText('The line could not be hidden. Try again.')).toBeTruthy();
  });
});

describe('LogScreen: the plan row set aside', () => {
  it('says the plan could not be read while live entries are stored', async () => {
    await mount(memoryPlanStore({ ...withSetAside([], [{ id: 'plan', at: AT }]), plan: null }));
    expect(
      screen.getByText('Your plan could not be read, so no entries are listed. They stay on this device.'),
    ).toBeTruthy();
  });

  it('keeps the no-plan text while no plan row is set aside', async () => {
    await mount(memoryPlanStore({ ...fixtureSnapshot(), plan: null }));
    expect(screen.queryByText(/Your plan could not be read/)).toBeNull();
  });
});
