// @vitest-environment jsdom
import { instant } from '@proofofcalm/core/testing';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
// missing, how to bring them back and Hide this line, which writes `set-aside:<n>` and moves focus to the title,
// shown only while a plan is; and the empty text while the plan row is set aside. `hasFocus` is true because jsdom has no system focus.

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

  // A new record gets a new id, so the line stays after it: the two ways back exclude each other, the import first
  // and recording only without a backup, ending in Hide this line.
  it('names the backup first and recording only without one, then the hide', async () => {
    await mount(memoryPlanStore(withSetAside([{ id: 'gone', at: AT }])));
    const text = screen.getByText(LINE).textContent;
    expect(text).toMatch(
      /in Settings with Add missing entries only\. Without one, record it again, then hide this line\.$/,
    );
    expect(text).not.toMatch(/or record it again/);
  });

  it('names them in the plural the same way', async () => {
    await mount(
      memoryPlanStore(
        withSetAside([
          { id: 'gone', at: AT },
          { id: 'lost', at: AT },
        ]),
      ),
    );
    const text = screen.getByText(/^2 saved entries could not be read, so they are not in this list\./).textContent;
    expect(text).toMatch(/To bring them back, import a JSON backup exported before 1\sOct\s2026 in Settings/);
    expect(text).toMatch(/Without one, record them again, then hide this line\.$/);
    expect(text).not.toMatch(/or record them again/);
  });

  // With no plan the Log offers neither recording nor Add missing entries only, so its empty text names the way back.
  it('shows no line while no plan is shown, only the empty text', async () => {
    await mount(memoryPlanStore({ ...withSetAside([{ id: 'gone', at: AT }]), plan: null }));
    expect(screen.queryByText(/saved entry could not be read/)).toBeNull();
    expect(screen.queryByRole('button', { name: HIDE })).toBeNull();
    expect(screen.getByText('No entries yet. Set up a plan or import a file.')).toBeTruthy();
  });

  it('shows no line while the plan row is set aside too', async () => {
    await mount(memoryPlanStore({ ...withSetAside([{ id: 'gone', at: AT }], [{ id: 'plan', at: AT }]), plan: null }));
    expect(screen.queryByText(/saved entry could not be read/)).toBeNull();
    expect(screen.queryByRole('button', { name: HIDE })).toBeNull();
    expect(screen.getByText(/^Your plan could not be read, so no entries are listed\./)).toBeTruthy();
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
  it('says the plan could not be read while live entries are stored, and links to Settings', async () => {
    await mount(memoryPlanStore({ ...withSetAside([], [{ id: 'plan', at: AT }]), plan: null }));
    const text = screen.getByText(
      /^Your plan could not be read, so no entries are listed\. They stay on this device\./,
    );
    expect(text.textContent).toBe(
      'Your plan could not be read, so no entries are listed. They stay on this device. Import a JSON backup in Settings to bring the plan back.',
    );
    expect(within(text).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
  });

  // Entries exist on this device even when every one is set aside, so the text is the plan's, not the no-plan one.
  it('says the plan could not be read while every entry is set aside too, with no line or hide', async () => {
    const snapshot = withSetAside(
      [
        { id: 'gone', at: AT },
        { id: 'lost', at: AT },
      ],
      [{ id: 'plan', at: AT }],
    );
    await mount(memoryPlanStore({ ...snapshot, plan: null, entries: [] }));
    expect(screen.getByText(/^Your plan could not be read, so no entries are listed\./)).toBeTruthy();
    expect(screen.queryByText(/saved entries could not be read/)).toBeNull();
    expect(screen.queryByRole('button', { name: HIDE })).toBeNull();
    expect(screen.queryByText('No entries yet. Set up a plan or import a file.')).toBeNull();
  });

  it('keeps the no-plan text while the plan row is set aside and no entry exists', async () => {
    await mount(memoryPlanStore({ ...withSetAside([], [{ id: 'plan', at: AT }]), plan: null, entries: [] }));
    expect(screen.getByText('No entries yet. Set up a plan or import a file.')).toBeTruthy();
    expect(screen.queryByText(/Your plan could not be read/)).toBeNull();
  });

  it('keeps the no-plan text while no plan row is set aside', async () => {
    await mount(memoryPlanStore({ ...fixtureSnapshot(), plan: null }));
    expect(screen.queryByText(/Your plan could not be read/)).toBeNull();
  });
});
