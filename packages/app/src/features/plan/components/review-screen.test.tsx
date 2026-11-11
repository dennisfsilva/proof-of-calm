// @vitest-environment jsdom
import { countryRules, holdingRuleSource, loadProfile } from '@proofofcalm/content';
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
  it('names the creation day, the plan, the note, the link and the rules held; opening it writes nothing', async () => {
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
    // The plan in the Plan screen's own words, then the note quoted as the person's, as the fall page shows it.
    expect(text(/^Your plan buys until /)).toBeDefined();
    expect(text(/ a month on day \d+: BTC /)).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Your note to yourself' })).toBeDefined();
    // The label and its quote stay together, as the fall page groups them.
    const quote = text(/^5 Apr 2026: “For the long run\.”$/);
    expect(screen.getByRole('heading', { level: 3, name: 'Your note to yourself' }).parentElement).toBe(
      quote.parentElement,
    );
    expect(quote.parentElement?.tagName).toBe('DIV');
    expect(screen.queryByText(/In your words/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Plan' }).getAttribute('href')).toBe('/plan');
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit plan' }).getAttribute('href')).toBe('/settings');
    expect(text(/^Your plan's country: Portugal\.$/)).toBeDefined();
    // The date line takes its Sources form once the profile is read, as the country card's does (LEGAL §4).
    const profile = await loadProfile('PT');
    const sources = await screen.findByRole('link', { name: 'Sources' });
    expect(sources.parentElement?.textContent?.replace(/\s+/g, ' ')).toBe(
      'Reviewed on 5 Nov 2026 · general information, not advice · Sources',
    );
    expect(sources.getAttribute('href')).toBe(profile === null ? null : holdingRuleSource(profile));
    const card = screen.getByRole('link', { name: 'See the card for Portugal' });
    expect(card.getAttribute('href')).toBe('/learn/countries/pt');
    expect(screen.queryByText(/Review your plan/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeDefined();
    expect(write).not.toHaveBeenCalled();
    expect(store.current().prefs.reviewedAt).toBeNull();
  });

  it('lists where the coins are between the rules and the button: the fixture names no venue', async () => {
    await mount();
    const rules = screen.getByRole('heading', { level: 2, name: 'Have the rules changed?' });
    const where = screen.getByRole('heading', { level: 2, name: 'Where your coins are' });
    const button = screen.getByRole('button', { name: 'Mark as reviewed' });
    expect(rules.compareDocumentPosition(where)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(where.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The units held at the end of 20 Oct 2026, the fixture's clock.
    expect(text(/^At the end of 20 Oct 2026, /)).toBeDefined();
    expect(screen.getAllByText('With no venue')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Open the Log' }).getAttribute('href')).toBe('/log');
  });

  it('with no entries, the where part says nothing is held, with the date', async () => {
    await mount({ snapshot: { entries: [] } });
    expect(text(/^The Log shows no coins held at the end of 20 Oct 2026\.$/)).toBeDefined();
  });

  it('with no note, leaves the note out and keeps the plan and the link', async () => {
    await mount();
    expect(screen.queryByRole('heading', { name: 'Your note to yourself' })).toBeNull();
    expect(text(/^Your plan buys until /)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Edit plan' })).toBeDefined();
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

  it('under the general profile: its date line with no country line, and the countries list', async () => {
    await mount({ plan: { country: 'XX' as Plan['country'] }, rules: rulesOf('XX') });
    expect(text(/the general profile, not a rule for your country/)).toBeDefined();
    expect(screen.queryByText(/^Your plan's country/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.getByRole('link', { name: 'See the countries' }).getAttribute('href')).toBe('/learn/countries');
  });

  it('under review: the date line says since when the rules were not reviewed', async () => {
    await mount({ nowMs: at('2028-11-03') });
    expect(text(/^Not reviewed since 5 Nov 2026 · general information, not advice$/)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it("with a rule change not yet seen: the dated sentence alone, without Today's call to review", async () => {
    await mount({ plan: { countryRuleVersion: 1 } });
    const notice = text(/^5 Nov 2026: Portugal /);
    // The dated sentence leads the section, before the country line (CONTENT-STYLE §1 rule 10).
    expect(notice.compareDocumentPosition(text(/^Your plan's country: Portugal\.$/))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText(/Review your plan/)).toBeNull();
    cleanup();
    // A profile with no sentence of its own: the generic form, cut before Today's `Review your plan.`
    await mount({ plan: { country: 'XX' as Plan['country'], countryRuleVersion: 0 }, rules: rulesOf('XX') });
    expect(text(/^17 Oct 2026: the general profile changed\.$/)).toBeDefined();
  });

  it('Mark as reviewed stores the review in the prefs alone and moves the focus to the result line', async () => {
    const changedAt = '2026-10-01T10:00:00.000Z' as Instant;
    const { store } = await mount({ snapshot: { prefs: { ...fixtureSnapshot().prefs, changedAt } } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' })));
    expect(store.current().prefs.reviewedAt).toMatch(/^2026-10-20T10:00:00/);
    expect(store.current().prefs.changedAt).toBe(changedAt);
    const line = text(/^You reviewed this plan on 20 Oct 2026\. Next review from 20 Oct 2027\.$/);
    expect(line.getAttribute('tabindex')).toBe('-1');
    expect(line.classList.contains('scroll-mt-result')).toBe(true);
    expect(document.activeElement).toBe(line);
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
    // The first line keeps its words from when the page opened, so the page names the review's day once.
    expect(text(/^You set up this plan on 5 Apr 2026\.$/)).toBeDefined();
    expect(screen.queryByText(/You last reviewed/)).toBeNull();
  });

  it('a plan that replaces this one while the page is open: its own first line and the button again', async () => {
    const { services } = await mount();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' })));
    const createdAt = '2026-06-01T10:00:00.000Z' as Instant;
    const id = '00000000-0000-4000-8000-000000009000' as EntityId;
    await act(() =>
      services.domain.write((snapshot) => ({
        plan: { ...(snapshot.plan as Plan), id, createdAt },
        prefs: { ...snapshot.prefs, reviewedAt: null },
      })),
    );
    expect(text(/^You set up this plan on 1 Jun 2026\.$/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeDefined();
  });

  it('an overdue review, marked, counts the next one from the day it was marked', async () => {
    await mount({ nowMs: at('2028-01-10') });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' })));
    expect(text(/^You reviewed this plan on 10 Jan 2028\. Next review from 10 Jan 2029\.$/)).toBeDefined();
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

  it('a Mark refused because another tab stored another plan records nothing, re-opens on it and says so', async () => {
    const { services, store } = await mount();
    const id = '00000000-0000-4000-8000-000000009000' as EntityId;
    const createdAt = '2026-06-01T10:00:00.000Z' as Instant;
    // Written straight to the store, as another tab's import is before this tab's reload.
    await store.write({
      plan: { ...(store.current().plan as Plan), id, createdAt },
      prefs: { ...store.current().prefs, reviewedAt: null },
    });
    const add = vi.spyOn(services.toasts, 'add');
    const button = screen.getByRole('button', { name: 'Mark as reviewed' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(store.current().prefs.reviewedAt).toBeNull();
    expect(text(/^You set up this plan on 1 Jun 2026\.$/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).not.toBe(button);
    expect(screen.queryByText(/^You reviewed this plan/)).toBeNull();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'The review could not be recorded. Try again.' }),
    );
    // The pressed button went with the old page: the re-opened page's heading takes the focus, never `body`.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Review the plan' }));
  });

  it('a Mark refused because another tab deleted everything: the no-plan state, the heading focused', async () => {
    const { services, store } = await mount();
    // Wiped straight in the store, as another tab's Delete everything is before this tab's reload.
    await store.wipe();
    const add = vi.spyOn(services.toasts, 'add');
    const button = screen.getByRole('button', { name: 'Mark as reviewed' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(store.current().plan).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'The review could not be recorded. Try again.' }),
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Review the plan' }));
  });

  it('with no plan, the no-plan state', async () => {
    await mount({ plan: null, snapshot: { entries: [] } });
    expect(screen.getByRole('heading', { level: 1, name: 'Review the plan' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
  });
});
