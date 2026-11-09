// @vitest-environment jsdom
import { countryRules, GENERIC_COUNTRY, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CountryRules } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, usePathname } from '../../../lib/navigation';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { clearRedDay, createTestServices } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { TodayScreen } from './today-screen';

// The rule-change notice at Today's foot (docs/DOMAIN.md §3.11, §3.12): the fixture plan on 20 October 2026
// has seen no version of Portugal's rules, so the profile's version is news to it. The fixture plan was never
// exported, so the backup banner waits behind the notice.

const profile = await loadProfile('PT');
if (profile === null) throw new Error('no PT profile');
const PORTUGAL = countryRules(profile);

const SENTENCE = 'Portugal updated its rule for 2027. Review your plan.';
const FAILED = 'The notice could not be dismissed. Try again.';
const BACKUP = /^Your data lives only on this device\./;

// jsdom has no `scrollIntoView`: Dismiss's focus move calls it, so it is stubbed and the focus test reads it.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;

const unseen = (): Snapshot => {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, countryRuleVersion: 0 } };
};

const refusing = (): PlanStore => ({
  ...memoryPlanStore(unseen()),
  update: () => Promise.reject(new Error('disk full')),
});

function Path() {
  return <output data-testid="path">{usePathname()}</output>;
}

type Options = {
  readonly changeNotice?: string | null;
  readonly planStore?: PlanStore;
  readonly rules?: CountryRules;
};

async function mount({ changeNotice = null, planStore = memoryPlanStore(unseen()), rules = PORTUGAL }: Options = {}) {
  const changedOn = '2027-01-01' as CalendarDate;
  const created = createTestServices({
    planStore,
    nowMs: fixtureNowMs('buy'),
    rules: async () => ({ ...rules, status: { ...rules.status, changedOn, changeNotice } }),
  });
  // No episode under way: the foot settles on the notice inside the render's act.
  const services = { ...created, redDay: clearRedDay() };
  await act(() => services.start());
  await act(async () =>
    render(
      <NavigationProvider location="memory" initialPath="/today">
        <ServicesProvider services={services}>
          <I18nProvider messages={{ shell, today }}>
            <Toaster closeLabel="Close" toastManager={services.toasts}>
              <TodayScreen />
              <Path />
            </Toaster>
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    ),
  );
  return services;
}

const seen = (services: Services) => services.domain.store.getState().snapshot.plan?.countryRuleVersion;
const dismiss = () => fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

afterEach(cleanup);

describe('RuleChangeBanner', () => {
  it('shows the profile’s sentence with its date', async () => {
    await mount({ changeNotice: SENTENCE });
    expect(screen.getByText(`1 Jan 2027: ${SENTENCE}`)).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
  });

  it('a null sentence gets the generic one', async () => {
    await mount();
    expect(screen.getByText('1 Jan 2027: the rules for Portugal changed. Review your plan.')).toBeDefined();
  });

  it('the generic profile is named as the general profile, never as a country', async () => {
    const generic = await loadProfile(GENERIC_COUNTRY);
    if (generic === null) throw new Error('no generic profile');
    const snapshot = unseen();
    const plan = snapshot.plan && { ...snapshot.plan, country: GENERIC_COUNTRY };
    await mount({ planStore: memoryPlanStore({ ...snapshot, plan }), rules: countryRules(generic) });
    expect(screen.getByText('1 Jan 2027: the general profile changed. Review your plan.')).toBeDefined();
  });

  it('Dismiss gives way to the next banner', async () => {
    const services = await mount();
    dismiss();
    expect(await screen.findByText(BACKUP)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(seen(services)).toBe(PORTUGAL.status.version);
  });

  it('Review opens Plan and records the notice', async () => {
    const services = await mount();
    const review = screen.getByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe('/plan');
    fireEvent.click(review);
    expect(screen.getByTestId('path').textContent).toBe('/plan');
    await waitFor(() => expect(seen(services)).toBe(PORTUGAL.status.version));
    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull();
  });

  it('a failed write keeps the banner and says so', async () => {
    await mount({ planStore: refusing() });
    dismiss();
    expect(await screen.findByText(FAILED)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Review' })).toBeDefined();
  });

  it('a failed write under Review says so as well, and the notice comes back', async () => {
    await mount({ planStore: refusing() });
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(screen.getByTestId('path').textContent).toBe('/plan');
    expect(await screen.findByText(FAILED)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Review' })).toBeDefined();
  });

  it('after Dismiss the focus is on Today’s heading, brought into view by the least scroll', async () => {
    await mount();
    const heading = screen.getByRole('heading', { level: 2 });
    const focus = vi.spyOn(heading, 'focus');
    scrolled.mockClear();
    dismiss();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrolled.mock.contexts).toEqual([heading]);
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('Review moves no focus and scrolls nothing', async () => {
    await mount();
    scrolled.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Review' }));
    expect(screen.getByTestId('path').textContent).toBe('/plan');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Review' })).toBeNull());
    expect(scrolled).not.toHaveBeenCalled();
  });
});
