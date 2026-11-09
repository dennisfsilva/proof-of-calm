// @vitest-environment jsdom
import { type CalendarDate, type EntityId, type Entry, liveEntries, type Plan } from '@proofofcalm/core';
import { FIXTURE_RULES, type FixtureCountry } from '@proofofcalm/core/testing/country-change';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, type TestServicesOptions } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { EndBuying } from './end-buying';
import { PlanScreen } from './plan-screen';

// End buying today on the Plan screen (docs/DOMAIN.md §6 "End buying today"; CONTENT-STYLE §3 "End buying";
// docs/DESIGN.md §6 "Focus after an action") over the fixture plan on 20 October 2026, whose buying runs from
// 5 April 2026 to 5 March 2027.

// The undo's focus move brings the button into view; jsdom has no `scrollIntoView`.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
// A namespace the screen reads but the provider lacks is reported on the console, not thrown: every test fails on it.
const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

const ENDED = 'Buying ended on 20 Oct 2026.';
const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;

function withPlan(change: Partial<Plan>, snapshot: Snapshot = fixtureSnapshot()): Snapshot {
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, ...change } };
}

async function mount(
  snapshot: Snapshot = fixtureSnapshot(),
  { phase = 'buy', planStore = memoryPlanStore(snapshot), screen: content = <PlanScreen />, rules }: Mount = {},
): Promise<Services> {
  const services = createTestServices({ planStore, nowMs: fixtureNowMs(phase), ...(rules && { rules }) });
  await act(() => services.start());
  render(
    <NavigationProvider location="memory" initialPath="/plan">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ errors, plan, shell, today }}>
          <Toaster closeLabel="Close" toastManager={services.toasts}>
            {content}
          </Toaster>
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

type Mount = { phase?: FixturePhase; planStore?: PlanStore; screen?: ReactNode; rules?: TestServicesOptions['rules'] };

const stored = (services: Services) => services.domain.store.getState().snapshot.plan;
const endButton = () => screen.queryByRole('button', { name: 'End buying' });
/** The Plan line, not the toast that carries the same words. */
const endedLine = () =>
  screen.getAllByText(ENDED).find((element) => element.tagName === 'P' && element.getAttribute('tabindex') === '-1');

async function openDialog() {
  const button = endButton();
  if (button === null) throw new Error('no End buying button');
  // A click focuses the button in a browser; jsdom's fireEvent does not.
  button.focus();
  fireEvent.click(button);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(document.activeElement?.textContent).toBe('Keep the plan as it is'));
  return dialog;
}

async function confirm(dialog: HTMLElement) {
  const button = within(dialog).getByRole('button', { name: 'End buying today' });
  button.focus();
  await act(async () => fireEvent.click(button));
}

/** A store whose `update` waits, once `hold` has armed it after the mount, until `release`. */
function gated() {
  const store = memoryPlanStore(fixtureSnapshot());
  let gate: Promise<void> | null = null;
  let open = () => {};
  const planStore = {
    ...store,
    update: async (build: Parameters<typeof store.update>[0]) => {
      if (gate !== null) await gate;
      return store.update.call(planStore, build);
    },
  };
  const hold = () => {
    gate = new Promise((resolve) => {
      open = resolve;
    });
  };
  const release = () => {
    gate = null;
    open();
  };
  return { planStore, hold, release };
}

describe('EndBuying', () => {
  it('offers End buying only while buying lasts: not before the first buy day, not past the last', async () => {
    await mount(withPlan({ firstBuy: '2026-11-05' as CalendarDate }));
    expect(endButton()).toBeNull();
    cleanup();
    await mount(fixtureSnapshot(), { phase: 'sell' });
    expect(endButton()).toBeNull();
  });

  it('offers End buying while paused', async () => {
    const pause = { id: '00000000-0000-4000-8000-000000003000' as EntityId, from: '2026-10-01', until: null };
    await mount(withPlan({ pauses: [{ ...pause, from: pause.from as CalendarDate, note: '' }] }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(endButton()).not.toBeNull();
  });

  it('an ended plan shows the ended line and no button', async () => {
    const day = '2026-10-10' as CalendarDate;
    await mount(withPlan({ lastBuy: day, endedBuyingOn: day }));
    expect(screen.getByText('Buying ended on 10 Oct 2026.').getAttribute('tabindex')).toBe('-1');
    expect(endButton()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Pause the plan' })).toBeNull();
  });

  it('opens on Keep the plan as it is, with Keep the plan as it is before End buying today', async () => {
    await mount();
    const dialog = await openDialog();
    expect(within(dialog).getByRole('heading').textContent).toBe('End buying');
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Keep the plan as it is', 'End buying today']);
    // Ending buying is the destructive action, not the accent fill (docs/DESIGN.md §3 and §8).
    const classes = within(dialog).getByRole('button', { name: 'End buying today' }).className.split(' ');
    expect(classes).toContain('text-negative');
    expect(classes).not.toContain('bg-primary');
  });

  it('Keep the plan as it is writes nothing and puts the focus back on End buying', async () => {
    const services = await mount();
    const before = stored(services);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the plan as it is' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(endButton()));
    expect(stored(services)).toBe(before);
  });

  it('End buying today ends buying, focuses the ended line and offers Undo; the Pause section is gone', async () => {
    const services = await mount();
    await confirm(await openDialog());
    expect(stored(services)).toMatchObject({ lastBuy: '2026-10-20', endedBuyingOn: '2026-10-20' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Pause the plan' })).toBeNull();
    expect(endButton()).toBeNull();
  });

  it('another tab ended first: no toast, no alert, and the focus on the ended line', async () => {
    const services = await mount();
    const dialog = await openDialog();
    const button = within(dialog).getByRole('button', { name: 'End buying today' });
    button.focus();
    const day = '2026-10-20' as CalendarDate;
    await act(async () => {
      void services.domain.write(({ plan: theirs }) => ({
        plan: { ...(theirs as Plan), lastBuy: day, endedBuyingOn: day },
      }));
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
  });

  it('another tab moved the first buy day past today: the alert in the dialog, then Keep the plan as it is focuses the h1', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const services = await mount(fixtureSnapshot(), { planStore });
    const dialog = await openDialog();
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), firstBuy: '2026-11-05' as CalendarDate } });
    await confirm(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'The plan has not started yet, so there is no buying to end.',
    );
    // A form's refusal line (docs/DESIGN.md §5).
    expect(within(dialog).getByRole('alert').className.split(' ')).toEqual(
      expect.arrayContaining(['text-13', 'text-negative']),
    );
    expect(document.activeElement?.textContent).toBe('End buying today');
    expect(stored(services)?.endedBuyingOn).toBeNull();
    expect(endButton()).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the plan as it is' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Plan' })));
  });

  it('Undo restores buying and puts the focus on End buying', async () => {
    const services = await mount();
    const before = stored(services);
    await confirm(await openDialog());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await waitFor(() => expect(document.activeElement).toBe(endButton()));
    expect(stored(services)).toEqual({ ...before, updatedAt: stored(services)?.updatedAt });
  });

  // Tab reaches Undo from the element before the toast (the Learn link in the app): the toast's closing leaves the
  // focus to the Undo, which puts it on End buying, never back on that element (docs/DESIGN.md §6).
  it('Undo reached by Tab puts the focus on End buying, not on the element Tab came from', async () => {
    await mount();
    await confirm(await openDialog());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    const undo = screen.getByRole('button', { name: 'Undo' });
    screen.getByRole('link', { name: 'Edit plan' }).focus();
    undo.focus();
    await act(async () => fireEvent.click(undo));
    await waitFor(() => expect(endButton()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(endButton()));
  });

  it('a refused Undo reached by Tab gives the focus back where it came from', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    await mount(fixtureSnapshot(), { planStore });
    await confirm(await openDialog());
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), lastBuy: '2026-12-05' as CalendarDate } });
    const undo = screen.getByRole('button', { name: 'Undo' });
    const edit = screen.getByRole('link', { name: 'Edit plan' });
    edit.focus();
    undo.focus();
    await act(async () => fireEvent.click(undo));
    await screen.findByText('Your plan changed after you ended buying, so the earlier last buy was not put back.');
    expect(document.activeElement).toBe(edit);
  });

  it('Undo leaves the focus where the person moved it while the undo ran', async () => {
    await mount();
    await confirm(await openDialog());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    const edit = screen.getByRole('link', { name: 'Edit plan' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      edit.focus();
    });
    await waitFor(() => expect(endButton()).not.toBeNull());
    expect(document.activeElement).toBe(edit);
  });

  it('Escape while the end runs leaves the dialog open; the end then focuses the ended line and offers Undo', async () => {
    const { planStore, hold, release } = gated();
    await mount(fixtureSnapshot(), { planStore });
    const dialog = await openDialog();
    hold();
    await confirm(dialog);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeNull();
    await act(async () => release());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  it('Keep the plan as it is does nothing while the end runs, and keeps the focus', async () => {
    const { planStore, hold, release } = gated();
    await mount(fixtureSnapshot(), { planStore });
    const dialog = await openDialog();
    hold();
    await confirm(dialog);
    const keep = within(dialog).getByRole('button', { name: 'Keep the plan as it is' });
    expect(keep.getAttribute('aria-disabled')).toBe('true');
    keep.focus();
    fireEvent.click(keep);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(document.activeElement).toBe(keep);
    await act(async () => release());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
  });

  it('after an end through an Escape and its Undo, Keep the plan as it is gives the focus to End buying', async () => {
    const { planStore, hold, release } = gated();
    await mount(fixtureSnapshot(), { planStore });
    hold();
    await confirm(await openDialog());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await act(async () => release());
    await waitFor(() => expect(document.activeElement).toBe(endedLine()));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await waitFor(() => expect(document.activeElement).toBe(endButton()));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the plan as it is' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(endButton()));
  });

  it('a refusal while the end runs, after an Escape, shows in the dialog that stayed open', async () => {
    const { planStore, hold, release } = gated();
    await mount(fixtureSnapshot(), { planStore });
    const dialog = await openDialog();
    hold();
    await confirm(dialog);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), firstBuy: '2026-11-05' as CalendarDate } });
    await act(async () => release());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The plan has not started yet, so there is no buying to end.',
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.activeElement?.textContent).toBe('End buying today');
  });

  it('a refused Undo says the plan changed since the end and moves nothing', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const services = await mount(fixtureSnapshot(), { planStore });
    await confirm(await openDialog());
    const theirs = { ...(planStore.current().plan as Plan), lastBuy: '2026-12-05' as CalendarDate };
    await planStore.write({ plan: theirs });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await screen.findByText('Your plan changed after you ended buying, so the earlier last buy was not put back.');
    expect(stored(services)).toEqual(theirs);
  });
});

describe('EndBuying, the dialog body', () => {
  const fixture = fixtureSnapshot();
  const many = (count: number): Entry[] => {
    const first = fixture.entries[0] as Entry;
    return Array.from({ length: count }, (_, index) => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as EntityId,
    }));
  };
  const body = async (snapshot: Snapshot, options: Pick<Mount, 'rules'> = {}) => {
    await mount(snapshot, { screen: <EndBuying />, ...options });
    const dialog = await openDialog();
    return within(dialog)
      .getByText(/^No buy days after today/)
      .textContent?.replace(/\s/gu, ' ');
  };

  it('names the entries and the sell window, which stay', async () => {
    const count = liveEntries(fixture.entries).length;
    expect(await body(fixture)).toBe(
      `No buy days after today, 20 Oct 2026. Your ${count} entries and your sell window stay. A calendar file you added keeps its events.`,
    );
  });

  it('without a sell window, names the entries alone', async () => {
    expect(await body(withPlan({ sellWindow: null }, { ...fixture, entries: many(1) }))).toBe(
      'No buy days after today, 20 Oct 2026. Your 1 entry stays. A calendar file you added keeps its events.',
    );
  });

  it('with no entries, names the sell window alone, or nothing past the first sentence', async () => {
    expect(await body({ ...fixture, entries: [] })).toBe(
      'No buy days after today, 20 Oct 2026. Your sell window stays. A calendar file you added keeps its events.',
    );
    cleanup();
    expect(await body(withPlan({ sellWindow: null }, { ...fixture, entries: [] }))).toBe(
      'No buy days after today, 20 Oct 2026. A calendar file you added keeps its events.',
    );
  });

  it('groups a large count', async () => {
    expect(await body({ ...fixture, entries: many(1234) })).toBe(
      'No buy days after today, 20 Oct 2026. Your 1,234 entries and your sell window stay. A calendar file you added keeps its events.',
    );
  });

  // docs/CONTENT-STYLE.md §4: the count is grouped by the plan's country's locale, as the import's counts are.
  it("groups a large count as the plan's country groups it", async () => {
    const german = withPlan({ country: 'DE' as Plan['country'] }, { ...fixture, entries: many(1234) });
    expect(await body(german, { rules })).toMatch(/ Your 1\.234 entries and your sell window stay\. /);
  });
});
