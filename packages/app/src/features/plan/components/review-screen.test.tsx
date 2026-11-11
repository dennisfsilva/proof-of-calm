// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CountryRules, EntityId, Instant, Pause, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { ReviewScreen } from './review-screen';

// The review page (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page (M2)") over the fixture plan, set
// up on 5 Apr 2026 in Portugal, whose rules were reviewed on 5 Nov 2026 (version 2, next due 2 Nov 2027).

// jsdom has no `scrollIntoView`: the result line comes into view by the script focus move.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

type MemoryStore = ReturnType<typeof memoryPlanStore>;

const rulesOf = (code: string) => async () => {
  const profile = await loadProfile(code);
  return profile === null ? null : countryRules(profile);
};

type Mount = {
  readonly plan?: Partial<Plan> | null;
  readonly snapshot?: Partial<Snapshot>;
  readonly nowMs?: number;
  readonly rules?: () => Promise<CountryRules | null>;
  readonly planStore?: (snapshot: Snapshot) => MemoryStore;
};

async function mount({
  plan: changes = {},
  snapshot: extra = {},
  nowMs,
  rules = rulesOf('PT'),
  planStore,
}: Mount = {}) {
  const fixture = fixtureSnapshot();
  const stored = changes === null ? null : { ...(fixture.plan as Plan), ...changes };
  const snapshot: Snapshot = { ...fixture, plan: stored, ...extra };
  const store = (planStore ?? memoryPlanStore)(snapshot);
  const services = createTestServices({ planStore: store, nowMs: nowMs ?? fixtureNowMs('buy'), rules });
  await act(() => services.start());
  render(
    <NavigationProvider location="memory" initialPath="/plan/review">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ plan, shell, today }}>
          <ReviewScreen />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  // The rules load after the start: let them settle into the page.
  await act(async () => undefined);
  return { services, store };
}

const at = (date: string) => Date.parse(`${date}T10:00:00Z`);
const text = (pattern: RegExp) => screen.getByText(pattern);

describe('ReviewScreen', () => {
  it('names the creation day, the note, the links and the rules held; opening it writes nothing', async () => {
    const write = vi.fn();
    const { store } = await mount({
      plan: { why: '  For the long run.  ' },
      planStore: (snapshot) => {
        const memory = memoryPlanStore(snapshot);
        return {
          ...memory,
          write: (...args) => {
            write(...args);
            return memory.write(...args);
          },
        };
      },
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Review the plan' })).toBeDefined();
    expect(text(/^You set up this plan on 5 Apr 2026\.$/)).toBeDefined();
    expect(text(/^In your words: For the long run\.$/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to Plan' }).getAttribute('href')).toBe('/plan');
    expect(screen.getByRole('link', { name: 'See the plan' }).getAttribute('href')).toBe('/plan');
    expect(screen.getByRole('link', { name: 'Change it in Settings' }).getAttribute('href')).toBe('/settings');
    expect(text(/^Your plan's country: Portugal\.$/)).toBeDefined();
    expect(text(/^Reviewed on 5 Nov 2026 · general information, not advice$/)).toBeDefined();
    const card = screen.getByRole('link', { name: 'See the card for Portugal' });
    expect(card.getAttribute('href')).toBe('/learn/countries/pt');
    expect(screen.queryByText(/Review your plan/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeDefined();
    expect(write).not.toHaveBeenCalled();
    expect(store.current().prefs.reviewedAt).toBeNull();
  });

  it('with no note, leaves the note out and keeps the links', async () => {
    await mount();
    expect(screen.queryByText(/^In your words/)).toBeNull();
    expect(screen.getByRole('link', { name: 'See the plan' })).toBeDefined();
  });

  it('counts from the last review once there is one', async () => {
    const reviewedAt = '2027-11-11T09:00:00.000Z' as Instant;
    await mount({ snapshot: { prefs: { ...fixtureSnapshot().prefs, reviewedAt } }, nowMs: at('2028-01-10') });
    expect(text(/^You last reviewed this plan on 11 Nov 2027\.$/)).toBeDefined();
  });

  it('shows every part with no entries, in a pause, after an end of buying, in the hold phase and when done', async () => {
    const pause: Pause = {
      id: '00000000-0000-4000-8000-000000003000' as EntityId,
      from: '2026-10-01' as CalendarDate,
      until: null,
      note: '',
    };
    const cases: Mount[] = [
      { snapshot: { entries: [] } },
      { plan: { pauses: [pause] } },
      { plan: { lastBuy: '2026-10-20' as CalendarDate, endedBuyingOn: '2026-10-20' as CalendarDate } },
      { nowMs: at('2028-01-10') },
      { nowMs: fixtureNowMs('sell') },
      { nowMs: at('2031-02-01') },
    ];
    for (const one of cases) {
      await mount(one);
      expect(text(/^You set up this plan on 5 Apr 2026\.$/)).toBeDefined();
      expect(text(/^Your plan's country: Portugal\.$/)).toBeDefined();
      expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeDefined();
      cleanup();
    }
  });

  it('without the rules (loading, or not on the device): the heading and the countries link, no country named', async () => {
    await mount({ rules: async () => null });
    expect(screen.getByRole('heading', { level: 2, name: 'Have the rules changed?' })).toBeDefined();
    expect(screen.queryByText(/^Your plan's country/)).toBeNull();
    expect(screen.getByRole('link', { name: 'See the countries' }).getAttribute('href')).toBe('/learn/countries');
  });

  it('under the general profile: its date line, and the countries list', async () => {
    await mount({ plan: { country: 'XX' as Plan['country'] }, rules: rulesOf('XX') });
    expect(text(/the general profile, not a rule for your country/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'See the countries' }).getAttribute('href')).toBe('/learn/countries');
  });

  it('under review: the date line says since when the rules were not reviewed', async () => {
    await mount({ nowMs: at('2028-11-03') });
    expect(text(/^Not reviewed since 5 Nov 2026 · general information, not advice$/)).toBeDefined();
  });

  it('with a rule change not yet seen: the dated sentence', async () => {
    await mount({ plan: { countryRuleVersion: 1 } });
    expect(text(/^5 Nov 2026: /)).toBeDefined();
  });

  it('Mark as reviewed stores the review in the prefs alone and moves the focus to the result line', async () => {
    const changedAt = '2026-10-01T10:00:00.000Z' as Instant;
    const { store } = await mount({ snapshot: { prefs: { ...fixtureSnapshot().prefs, changedAt } } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' })));
    expect(store.current().prefs.reviewedAt).toMatch(/^2026-10-20T10:00:00/);
    expect(store.current().prefs.changedAt).toBe(changedAt);
    const line = text(/^Reviewed on 20 Oct 2026\. Next review on 20 Oct 2027\.$/);
    expect(line.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(line);
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
    expect(text(/^You last reviewed this plan on 20 Oct 2026\.$/)).toBeDefined();
  });

  it('a failed write keeps the button, moves no focus and says so in a toast', async () => {
    const { services } = await mount({
      planStore: (snapshot) => ({
        ...memoryPlanStore(snapshot),
        write: async () => {
          throw new Error('QuotaExceededError');
        },
      }),
    });
    const add = vi.spyOn(services.toasts, 'add');
    const button = screen.getByRole('button', { name: 'Mark as reviewed' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'The review could not be recorded. Try again.' }),
    );
  });

  it('with no plan, the no-plan state', async () => {
    await mount({ plan: null, snapshot: { entries: [] } });
    expect(screen.getByRole('heading', { level: 1, name: 'Review the plan' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
  });
});
