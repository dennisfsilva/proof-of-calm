// @vitest-environment jsdom
import { type CalendarDate, type EntityId, type Pause, type Plan, pauseOn } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import { PauseSection } from './pause-section';

// The pause section of the Plan screen (docs/DOMAIN.md §6 "Pause", "Resume"; CONTENT-STYLE §3 "Pause") over
// the fixture plan on 20 October 2026, whose last buy is 5 March 2027.

afterEach(cleanup);

const OVERLAP = 'The plan was not paused, because a pause still to come would overlap a pause from today.';

const pause = (from: string, until: string | null = null): Pause => ({
  id: '00000000-0000-4000-8000-000000003000' as EntityId,
  from: from as CalendarDate,
  until: until as CalendarDate | null,
  note: '',
});

function withPlan(change: Partial<Plan>): Snapshot {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, ...change } };
}

async function mount(
  snapshot: Snapshot = fixtureSnapshot(),
  phase: 'buy' | 'sell' = 'buy',
  planStore = memoryPlanStore(snapshot),
): Promise<Services> {
  const services = createTestServices({ planStore, nowMs: fixtureNowMs(phase) });
  await act(() => services.start());
  render(
    <NavigationProvider location="memory" initialPath="/plan">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ errors, plan }}>
          <PauseSection />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

const pauses = (services: Services) => services.domain.store.getState().snapshot.plan?.pauses ?? [];

const SWAPS: readonly (readonly [string, Pause[], Pause[], string])[] = [
  ['a pause', [], [pause('2026-10-20')], 'Resume'],
  ['a resume', [pause('2026-10-01')], [pause('2026-10-01', '2026-10-19')], 'Pause from today'],
];

describe('PauseSection', () => {
  it('unpaused: the heading, the body and Pause from today, which pauses from today and becomes Resume', async () => {
    const services = await mount();
    expect(screen.getByRole('heading', { level: 2, name: 'Pause the plan' })).toBeDefined();
    expect(screen.getByText(/^Buy days in the pause are marked paused, not missed\./)).toBeDefined();
    // The body names the date by the Last buy field's own term.
    expect(screen.getByText(/When you resume, the next buy day and the last buy keep their dates\.$/)).toBeDefined();
    const button = screen.getByRole('button', { name: 'Pause from today' });
    // A click focuses the button in a browser; jsdom's fireEvent does not.
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(pauses(services)).toMatchObject([{ from: '2026-10-20', until: null }]);
    expect(screen.getByRole('status').textContent).toBe('Paused since 20 Oct 2026');
    expect(screen.getByRole('button', { name: 'Resume' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole('button', { name: 'Pause from today' })).toBeNull();
  });

  it('paused: the status line in a polite live region, and Resume, which resumes and becomes Pause', async () => {
    const services = await mount(withPlan({ pauses: [pause('2026-10-01')] }));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Paused since 1 Oct 2026');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByText(/^Buy days in the pause/)).toBeNull();
    const button = screen.getByRole('button', { name: 'Resume' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(pauses(services)).toMatchObject([{ from: '2026-10-01', until: '2026-10-19' }]);
    expect(screen.getByRole('button', { name: 'Pause from today' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('a pause still to come (imported): Pause is refused under the button in its own words, and nothing is written', async () => {
    const services = await mount(withPlan({ pauses: [pause('2026-12-01')] }));
    // A click focuses the button in a browser; jsdom's fireEvent does not.
    screen.getByRole('button', { name: 'Pause from today' }).focus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.getByRole('alert').textContent).toBe(OVERLAP);
    expect(pauses(services)).toMatchObject([{ from: '2026-12-01' }]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause from today' }));
  });

  it('a bounded pause still to come: Pause is refused in the same words', async () => {
    await mount(withPlan({ pauses: [pause('2026-12-01', '2026-12-31')] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.getByRole('alert').textContent).toBe(OVERLAP);
  });

  // Integration read finding 2 (#221): another tab paused from today before this tab's press reached the store.
  it('another tab paused first: no refusal, the status reads the pause, and the focus is on Resume', async () => {
    const services = await mount();
    screen.getByRole('button', { name: 'Pause from today' }).focus();
    await act(async () => {
      void services.domain.write(({ plan: stored }) => ({
        plan: { ...(stored as Plan), pauses: [pause('2026-10-20')] },
      }));
      fireEvent.click(screen.getByRole('button', { name: 'Pause from today' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(pauses(services)).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Paused since 20 Oct 2026');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume' }));
  });

  it('another tab paused first and its reload comes after the press: the focus follows to Resume', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const services = await mount(fixtureSnapshot(), 'buy', planStore);
    // The other tab's write reaches the stored rows; this tab shows them only once its broadcast reload runs.
    await planStore.write({ plan: { ...(planStore.current().plan as Plan), pauses: [pause('2026-10-20')] } });
    screen.getByRole('button', { name: 'Pause from today' }).focus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(() => services.domain.hydrate());
    expect(screen.getByRole('status').textContent).toBe('Paused since 20 Oct 2026');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume' }));
  });

  // Review finding 1 (#221, fix round 1): the mirror of the case above, for Resume.
  it('another tab resumed first and its reload comes after the press: no refusal, the focus follows to Pause', async () => {
    const planStore = memoryPlanStore(withPlan({ pauses: [pause('2026-10-01')] }));
    const services = await mount(withPlan({ pauses: [pause('2026-10-01')] }), 'buy', planStore);
    await planStore.write({
      plan: { ...(planStore.current().plan as Plan), pauses: [pause('2026-10-01', '2026-10-19')] },
    });
    screen.getByRole('button', { name: 'Resume' }).focus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume' })));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(() => services.domain.hydrate());
    expect(screen.getByRole('status').textContent).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pause from today' }));
  });

  it('a refusal shows only while the plan is in the state it was refused under', async () => {
    const services = await mount(withPlan({ pauses: [pause('2026-12-01')] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.getByRole('alert').textContent).toBe(OVERLAP);
    await act(() =>
      services.domain.write(({ plan: stored }) => ({
        plan: { ...(stored as Plan), pauses: [pause('2026-10-01')] },
      })),
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Session 30's evaluator on #223: the focus on the button, another tab pauses or resumes, and this tab's
  // broadcast reload swaps the words; the focus stays on the same button, which now has the new name.
  it.each(SWAPS)(
    'the focus on the button, then %s from another tab: the focus stays on it',
    async (_name, start, after, now) => {
      const planStore = memoryPlanStore(withPlan({ pauses: start }));
      const services = await mount(withPlan({ pauses: start }), 'buy', planStore);
      const button = screen.getByRole('button');
      button.focus();
      await planStore.write({ plan: { ...(planStore.current().plan as Plan), pauses: after } });
      await act(() => services.domain.hydrate());
      expect(document.activeElement).toBe(button);
      expect(screen.getByRole('button', { name: now })).toBe(button);
    },
  );

  // Review round 3 (#221), finding 1: a swap another tab brings leaves the focus where the person moved it.
  it('after this tab paused and the person moved on, a resume from another tab leaves the focus where it was', async () => {
    const services = await mount();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    (document.activeElement as HTMLElement).blur();
    await act(() =>
      services.domain.write(({ plan: stored }) => ({
        plan: { ...(stored as Plan), pauses: [pause('2026-10-01', '2026-10-19')] },
      })),
    );
    expect(screen.getByRole('button', { name: 'Pause from today' })).toBeDefined();
    expect(document.activeElement).toBe(document.body);
  });

  // Review round 4 (#221): a press on a plan another tab paused wrote nothing, and that tab resumed before this
  // tab reloaded; no state about the press outlives it, so a later pause from another tab leaves the focus alone.
  it('after a press that wrote nothing and the person moved on, a pause from another tab leaves the focus', async () => {
    const planStore = memoryPlanStore(fixtureSnapshot());
    const services = await mount(fixtureSnapshot(), 'buy', planStore);
    const stored = (pauses: Pause[]) => planStore.write({ plan: { ...(planStore.current().plan as Plan), pauses } });
    await stored([pause('2026-10-20')]);
    screen.getByRole('button', { name: 'Pause from today' }).focus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.queryByRole('alert')).toBeNull();
    await stored([]);
    await act(() => services.domain.hydrate());
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await stored([pause('2026-10-20')]);
    await act(() => services.domain.hydrate());
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(document.activeElement).toBe(document.body);
  });

  // Review round 3 (#221), finding 2: a refusal ends once the plan is paused or resumed, and never comes back.
  it('a refusal hidden by another tab pausing does not return when that tab writes the plan back', async () => {
    const services = await mount(withPlan({ pauses: [pause('2026-12-01')] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause from today' })));
    expect(screen.getByRole('alert').textContent).toBe(OVERLAP);
    const write = (pauses: Pause[]) =>
      act(() => services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan), pauses } })));
    await write([pause('2026-10-01')]);
    expect(screen.queryByRole('alert')).toBeNull();
    await write([pause('2026-12-01')]);
    expect(screen.getByRole('button', { name: 'Pause from today' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('past the last buy, or once buying ended: nothing', async () => {
    await mount(fixtureSnapshot(), 'sell');
    expect(screen.queryByRole('heading', { name: 'Pause the plan' })).toBeNull();
    cleanup();
    await mount(withPlan({ endedBuyingOn: '2026-10-01' as CalendarDate }));
    expect(screen.queryByRole('button', { name: 'Pause from today' })).toBeNull();
  });
});

// Each press in this tab, then each later write from another tab (stored, then shown by its broadcast reload),
// then the plan as it stood after the press written back: where the focus is and whether the refusal shows at
// each step. The focus stays on the pressed button through every swap, which changes only its words; a refusal
// ends with the paused state it was refused under.

const PAUSE = 'Pause from today';
const RESUME = 'Resume';
const TODAY = '2026-10-20' as CalendarDate;

type Press = {
  readonly start: Pause[];
  /** Another tab's write that reaches the stored rows before the press; its reload comes after the press. */
  readonly first?: Pause[];
  /** Another tab's write that lands after the press wrote nothing and before the press reloads the plan. */
  readonly between?: Pause[];
  readonly fails?: boolean;
  readonly press: string;
  readonly shows: string;
  readonly refused: boolean;
};

const PRESSES: Record<string, Press> = {
  'Pause, accepted': { start: [], press: PAUSE, shows: RESUME, refused: false },
  'Resume, accepted': { start: [pause('2026-10-01')], press: RESUME, shows: PAUSE, refused: false },
  'Pause, accepted after another tab paused': {
    start: [],
    first: [pause('2026-10-20')],
    press: PAUSE,
    shows: RESUME,
    refused: false,
  },
  'Resume, accepted after another tab resumed': {
    start: [pause('2026-10-01')],
    first: [pause('2026-10-01', '2026-10-19')],
    press: RESUME,
    shows: PAUSE,
    refused: false,
  },
  'Pause, accepted after another tab paused and resumed (no swap)': {
    start: [],
    first: [pause('2026-10-20')],
    between: [],
    press: PAUSE,
    shows: PAUSE,
    refused: false,
  },
  'Resume, accepted after another tab resumed and paused (no swap)': {
    start: [pause('2026-10-01')],
    first: [pause('2026-10-01', '2026-10-19')],
    between: [pause('2026-10-01')],
    press: RESUME,
    shows: RESUME,
    refused: false,
  },
  'Pause, refused (an overlap)': { start: [pause('2026-12-01')], press: PAUSE, shows: PAUSE, refused: true },
  'Resume, refused (a write that threw)': {
    start: [pause('2026-10-01')],
    fails: true,
    press: RESUME,
    shows: RESUME,
    refused: true,
  },
};

const LATER: Record<string, (plan: Plan) => Plan> = {
  'a pause': (plan) => ({ ...plan, pauses: [pause('2026-10-01')] }),
  'a resume': (plan) => ({ ...plan, pauses: [pause('2026-10-01', '2026-10-19')] }),
  'an unrelated edit': (plan) => ({ ...plan, why: 'Written in another tab.' }),
};

const MATRIX = Object.keys(PRESSES).flatMap((press) => Object.keys(LATER).map((later) => [press, later] as const));

describe('PauseSection: a press here, then a write from another tab', () => {
  it.each(MATRIX)('%s, then %s', async (name, laterName) => {
    const { start, first, between, fails = false, press, shows, refused } = PRESSES[name] as Press;
    const store = memoryPlanStore(withPlan({ pauses: start }));
    let failing = fails;
    let landing = between;
    const planStore = {
      ...store,
      write: async (changes: Parameters<typeof store.write>[0]) => {
        if (failing) throw new Error('QuotaExceededError');
        return store.write(changes);
      },
      update: async (build: Parameters<typeof store.update>[0]) => {
        try {
          // Through this store's own write, as the memory store's update goes, so a failing write fails it.
          return await store.update.call(planStore, build);
        } finally {
          if (landing !== undefined) {
            await store.write({ plan: { ...(store.current().plan as Plan), pauses: landing } });
            landing = undefined;
          }
        }
      },
    };
    const services = await mount(fixtureSnapshot(), 'buy', planStore);
    const reload = () => act(() => services.domain.hydrate());
    const button = screen.getByRole('button', { name: press });
    const expectStep = (name: string, alert: boolean) => {
      expect(document.activeElement).toBe(button);
      expect(screen.getByRole('button', { name })).toBe(button);
      expect(screen.queryByRole('alert') !== null).toBe(alert);
    };

    if (first !== undefined) await store.write({ plan: { ...(store.current().plan as Plan), pauses: first } });
    button.focus();
    await act(async () => fireEvent.click(button));
    failing = false;
    if (first !== undefined) await reload();
    expectStep(shows, refused);

    const pressed = store.current().plan as Plan;
    const later = (LATER[laterName] as (plan: Plan) => Plan)(pressed);
    await store.write({ plan: later });
    expectStep(shows, refused);
    await reload();
    const swapped = (pauseOn(later, TODAY) !== null) !== (shows === RESUME);
    expectStep(swapped ? (shows === RESUME ? PAUSE : RESUME) : shows, refused && !swapped);

    await store.write({ plan: pressed });
    await reload();
    expectStep(shows, refused && !swapped);
  });
});

// A press whose write waits: the button stays focusable while pending and the press moves no focus, so the focus
// ends where the person left it, on the button (now in its new words) or on a control they moved to.
const HELD: readonly (readonly [string, Pause[], string, string, boolean])[] = [
  ['Pause, the focus moved away while pending: it stays there', [], PAUSE, RESUME, true],
  ['Resume, the focus moved away while pending: it stays there', [pause('2026-10-01')], RESUME, PAUSE, true],
  ['Pause, the focus left on the button while pending: it follows', [], PAUSE, RESUME, false],
  ['Resume, the focus left on the button while pending: it follows', [pause('2026-10-01')], RESUME, PAUSE, false],
];

describe('PauseSection: the focus after a press whose write waits', () => {
  it.each(HELD)('%s', async (_name, start, press, shows, moved) => {
    const store = memoryPlanStore(withPlan({ pauses: start }));
    let held: Promise<void> | null = null;
    let release = () => {};
    const planStore = {
      ...store,
      write: async (changes: Parameters<typeof store.write>[0]) => {
        if (held !== null) await held;
        return store.write(changes);
      },
    };
    await mount(fixtureSnapshot(), 'buy', planStore);
    held = new Promise((resolve) => {
      release = resolve;
    });
    // The section has no other control: one beside it stands for wherever the person moves the focus.
    const other = document.createElement('input');
    document.body.append(other);
    try {
      screen.getByRole('button', { name: press }).focus();
      await act(async () => fireEvent.click(screen.getByRole('button', { name: press })));
      // Pending: the pressed button is still shown, disabled and focusable.
      expect(screen.getByRole('button', { name: press }).getAttribute('aria-disabled')).toBe('true');
      if (moved) other.focus();
      await act(async () => release());
      const shown = screen.getByRole('button', { name: shows });
      expect(document.activeElement).toBe(moved ? other : shown);
      expect(document.activeElement === shown).toBe(!moved);
    } finally {
      other.remove();
    }
  });
});
