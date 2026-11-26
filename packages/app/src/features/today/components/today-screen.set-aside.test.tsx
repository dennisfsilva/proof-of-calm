// @vitest-environment jsdom
import { instant } from '@proofofcalm/core/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { TodayScreen } from './today-screen';

// Today's set-aside line under the title (ADR-0019 Readings, 2026-11-26): saved entries that could not be read
// and are still missing, with a link to the Log; and NoPlan's words while the plan row is set aside.

afterEach(cleanup);
Element.prototype.scrollIntoView = vi.fn();

const AT = instant('2026-10-01T08:00:00.000Z');
const ROWS = [
  { id: 'gone-1', at: AT },
  { id: 'gone-2', at: AT },
];
const LINE = /saved entr(y|ies) could not be read/;

const setAside = (snapshot: Snapshot, plans: Snapshot['setAside']['plans'], entries = ROWS): Snapshot => ({
  ...snapshot,
  quarantined: plans.length + entries.length,
  setAside: { plans, entries },
});

async function mount(snapshot: Snapshot) {
  const services = createTestServices({ snapshot, nowMs: Date.parse('2026-10-20T10:00:00Z') });
  await act(() => services.start());
  await act(async () =>
    render(
      <NavigationProvider location="memory" initialPath="/today">
        <ServicesProvider services={services}>
          <I18nProvider messages={{ shell, today }}>
            <TodayScreen />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    ),
  );
}

describe('TodayScreen: the set-aside line', () => {
  it('shows nothing while no entry is set aside', async () => {
    await mount(fixtureSnapshot());
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('says how many saved entries are left out, with a link to the Log, under the title', async () => {
    await mount(setAside(fixtureSnapshot(), []));
    const line = screen.getByText(LINE);
    expect(line.textContent).toBe(
      '2 saved entries could not be read, so Today and Portfolio leave them out. The Log says how to bring them back.',
    );
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('href')).toBe('/log');
    expect(screen.getByRole('heading', { level: 1, name: 'Today' }).nextElementSibling).toBe(line);
  });

  it('shows nothing once the line is hidden for this many set-aside rows', async () => {
    const snapshot = setAside(fixtureSnapshot(), []);
    await mount({ ...snapshot, prefs: { ...snapshot.prefs, dismissedBanners: ['set-aside:2'] } });
    expect(screen.queryByText(LINE)).toBeNull();
  });
});

describe('NoPlan: the plan row set aside', () => {
  it('says the plan could not be read and how to bring it back', async () => {
    await mount(setAside(EMPTY_SNAPSHOT, [{ id: 'plan', at: AT, currency: null }], []));
    expect(screen.getByText('Your plan could not be read')).toBeTruthy();
    expect(screen.queryByText('No plan yet')).toBeNull();
    expect(screen.getByRole('link', { name: 'Import a JSON backup' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('link', { name: 'set up a plan' }).getAttribute('href')).toBe('/onboarding');
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('keeps No plan yet while no plan row is set aside', async () => {
    await mount(EMPTY_SNAPSHOT);
    expect(screen.getByText('No plan yet')).toBeTruthy();
  });
});
