// @vitest-environment jsdom
import { type CalendarDate, endBuying, type Instant, type Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { PlanScreen } from '../../plan';
import { PlanTab } from './plan-tab';

// Settings' Plan tab on a plan whose buying was ended (docs/DOMAIN.md §2, §6 "Edit the plan"): a save that moves
// the last buy day clears the end, so buying runs to the new day and the Plan screen offers a pause again.

vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

// A namespace the screen reads but the provider lacks is reported on the console, not thrown: every test fails on it.
const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});
await preloadLazyModules();

const ENDED_ON = '2026-10-20' as CalendarDate;

async function mountEnded(): Promise<Services> {
  const snapshot = fixtureSnapshot();
  const ended = endBuying(snapshot.plan as Plan, ENDED_ON, '2026-10-20T09:00:00.000Z' as Instant);
  if (!ended.ok) throw new Error(ended.error.code);
  const services = createTestServices({ snapshot: { ...snapshot, plan: ended.value }, nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, plan, errors, shell, today }}>
          <PlanTab />
          <PlanScreen />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;

describe('PlanTab on a plan whose buying was ended', () => {
  it('clears the end when a later last buy is saved, and the Plan screen offers a pause again', async () => {
    const services = await mountEnded();
    const lastBuy = screen.getByLabelText<HTMLInputElement>('Last buy');
    expect(lastBuy.value).toBe(ENDED_ON);
    expect(screen.queryByRole('button', { name: 'Pause from today' })).toBeNull();
    fireEvent.change(lastBuy, { target: { value: '2027-03-05' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(stored(services)).toMatchObject({ lastBuy: '2027-03-05', endedBuyingOn: null });
    expect(screen.getByRole('button', { name: 'Pause from today' })).toBeDefined();
    services.dispose();
  });
});
