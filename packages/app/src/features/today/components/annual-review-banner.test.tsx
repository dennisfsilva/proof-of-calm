// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { Instant } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, usePathname } from '../../../lib/navigation';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { clearRedDay, createTestServices } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { TodayScreen } from './today-screen';

// The annual review at Today's foot (docs/DOMAIN.md §3.11, §3.12; docs/CONTENT-STYLE.md §3): the fixture plan was
// created on 5 Apr 2026, so it is due from 5 Apr 2027; on 20 Apr 2027 it is in the hold phase, holds BTC and ETH and
// was never exported, so the backup banner waits behind the review.

const profile = await loadProfile('PT');
if (profile === null) throw new Error('no PT profile');
const PORTUGAL = countryRules(profile);

const QUESTION = 'Is it still right? Have the rules changed?';
const BACKUP = /^Your data lives only on this device\./;
const FAILED = 'The review could not be postponed. Try again.';
const at = (date: string) => Date.parse(`${date}T10:00:00Z`);

// jsdom has no `scrollIntoView`: Later's focus move calls it, so it is stubbed and the focus test reads it.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;

const refusing = (snapshot: Snapshot): PlanStore => ({
  ...memoryPlanStore(snapshot),
  update: () => Promise.reject(new Error('disk full')),
});

function Path() {
  return <output data-testid="path">{usePathname()}</output>;
}

async function mount({
  snapshot = fixtureSnapshot(),
  nowMs = at('2027-04-20'),
  planStore = memoryPlanStore(snapshot),
}: {
  snapshot?: Snapshot;
  nowMs?: number;
  planStore?: PlanStore;
} = {}) {
  const created = createTestServices({ planStore, nowMs, rules: async () => PORTUGAL });
  // No episode under way: the foot settles inside the render's act.
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

const prefs = (services: Services) => services.domain.store.getState().snapshot.prefs;
const later = () => fireEvent.click(screen.getByRole('button', { name: 'Later' }));

afterEach(cleanup);

describe('AnnualReviewBanner', () => {
  it('names the day the plan was set up, then asks, with Review the plan and Later', async () => {
    await mount();
    expect(screen.getByRole('status').textContent).toBe(
      `You set up this plan on 5 Apr 2026. ${QUESTION}Review the planLater`,
    );
    expect(screen.queryByText(BACKUP)).toBeNull();
  });

  it('after a review, names the day of the last review', async () => {
    const snapshot = fixtureSnapshot();
    const reviewed = { ...snapshot, prefs: { ...snapshot.prefs, reviewedAt: '2027-11-11T10:00:00Z' as Instant } };
    await mount({ snapshot: reviewed, nowMs: at('2028-11-20') });
    expect(screen.getByText(`You last reviewed this plan on 11 Nov 2027. ${QUESTION}`)).toBeDefined();
    expect(screen.queryByText(/You set up this plan/u)).toBeNull();
  });

  it('Review the plan opens /plan/review and writes nothing', async () => {
    const services = await mount();
    const before = prefs(services);
    const review = screen.getByRole('link', { name: 'Review the plan' });
    expect(review.getAttribute('href')).toBe('/plan/review');
    fireEvent.click(review);
    expect(screen.getByTestId('path').textContent).toBe('/plan/review');
    await act(async () => {});
    expect(prefs(services)).toBe(before);
  });

  it('Later records the day, the backup banner shows on the same visit, and the card’s heading takes the focus', async () => {
    const services = await mount();
    const heading = screen.getByRole('heading', { level: 2 });
    const focus = vi.spyOn(heading, 'focus');
    scrolled.mockClear();
    later();
    expect(await screen.findByText(BACKUP)).toBeDefined();
    expect(screen.queryByText(QUESTION, { exact: false })).toBeNull();
    expect(prefs(services).dismissedBanners).toEqual(['annual-review:2027-04-20']);
    expect(prefs(services).reviewedAt).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.id).toBe('today-action');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrolled.mock.contexts).toEqual([heading]);
  });

  it('a failed Later keeps the banner and says so, and moves no focus', async () => {
    const snapshot = fixtureSnapshot();
    await mount({ snapshot, planStore: refusing(snapshot) });
    scrolled.mockClear();
    later();
    expect(await screen.findByText(FAILED)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Later' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Review the plan' })).toBeDefined();
    expect(scrolled).not.toHaveBeenCalled();
  });
});
