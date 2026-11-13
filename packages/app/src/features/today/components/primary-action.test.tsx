// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  type Action,
  type CalendarDate,
  EntityIdSchema,
  type Entry,
  MAX_ENTRIES,
  type Money,
  type MonthKey,
  type Pause,
  type Phase,
} from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES, preloadLazyModules, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { PrimaryAction, type PrimaryActionProps } from './primary-action';

// The primary action by status and phase (docs/DOMAIN.md §3.3, §3.5), over the fixture plan on
// 20 October 2026: its sell window opens on 1 September 2029, closes on 31 August 2030, and the plan
// is out by 31 December 2030. The copy is CONTENT-STYLE §3's and the copy review's on issue #96.
// The one tap (§3.4, §6 "One-tap") records October's late buy, 100 € split 70/30 over BTC and ETH.

// Under Vitest each import() is a round trip to the main process, even for a module already loaded, and
// under load it outlasted a findBy (2026-10-26). The tap loads the log namespace and every mount Portugal's
// profile: both load once, here, and answer from memory (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
vi.mock('../../../lib/i18n/namespaces', async (original) =>
  (await import('../../../lib/services/testing-modules')).namespacesInMemory(
    await original<typeof import('../../../lib/i18n/namespaces')>(),
  ),
);

afterEach(cleanup);
// The log feature behind the Edit and Log sheets, its namespace and the profiles load while the file
// loads, outside any timeout, so a findBy on a sheet waits on renders, not on Vite's first transform.
await preloadLazyModules([() => import('../../log')]);

async function mount(props: PrimaryActionProps, snapshot: Snapshot = fixtureSnapshot()) {
  const services = createTestServices({
    snapshot,
    nowMs: fixtureNowMs('buy'),
    rules: async (code: string) => {
      const profile = await loadProfile(code);
      return profile === null ? null : countryRules(profile);
    },
  });
  await act(() => services.start());
  render(
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ errors, shell, today }}>
          <Toaster closeLabel="Close" toastManager={services.toasts}>
            <PrimaryAction {...props} />
          </Toaster>
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

const phase = (kind: Phase['kind'], pause: Pause | null = null): Phase => ({ kind, openEnded: false, pause });
const october = (status: Action['status']): Action => ({
  kind: 'dca',
  slot: '2026-10' as MonthKey,
  due: '2026-10-05' as CalendarDate,
  status,
  plannedAmount: '100' as Money,
  loggedAmount: (status === 'done' ? '100' : '0') as Money,
});
const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const late = { action: october('late'), handled: null, phase: phase('buy') };
const priced = (): Snapshot => ({ ...fixtureSnapshot(), prices: FIXTURE_PRICES });
const oneTaps = (services: { domain: { store: { getState(): { snapshot: Snapshot } } } }) =>
  services.domain.store.getState().snapshot.entries.filter((entry) => entry.source === 'one-tap');
const paid = (coin: string) =>
  (screen.getByRole('textbox', { name: `${coin} cost before fees (EUR)` }) as HTMLInputElement).value;

describe('PrimaryAction', () => {
  it('the starting amount, late: the heading of the pending row and how long ago it was due', async () => {
    const starting: Action = { ...october('late'), kind: 'lump', slot: null, plannedAmount: '1000' as Money };
    await mount({ action: { ...starting, due: '2026-10-01' as CalendarDate }, handled: null, phase: phase('buy') });
    expect(heading()).toBe('Starting amount: due 1\u00a0Oct\u00a02026');
    expect(screen.getByText('It was due on 1 Oct 2026, 19 days ago.')).toBeDefined();
    expect(document.querySelectorAll('[data-slot="coin-chip"]')).toHaveLength(2);
  });

  it('a recorded month: handled, with the next buy day and no chips', async () => {
    await mount({ action: null, handled: october('done'), phase: phase('buy') });
    expect(heading()).toBe('October\u00a02026 is recorded');
    expect(screen.getByText('Next buy day: 5 Nov 2026.')).toBeDefined();
    expect(document.querySelector('[data-slot="coin-chip"]')).toBeNull();
  });

  it('a skipped month reads as a recorded one: the next buy day', async () => {
    await mount({ action: null, handled: october('skipped'), phase: phase('buy') });
    expect(heading()).toBe('October\u00a02026 is skipped');
    expect(screen.getByText('Next buy day: 5 Nov 2026.')).toBeDefined();
  });

  it('paused: until the pause ends, never as the thing to do', async () => {
    const pause = { id: 'p', from: '2026-10-01', until: '2026-12-31', note: '' } as Pause;
    await mount({ action: null, handled: october('paused'), phase: phase('buy', pause) });
    expect(heading()).toBe('Paused until 31\u00a0Dec\u00a02026');
    expect(screen.queryByText('Record a purchase')).toBeNull();
  });

  it('paused with no end: the day it began, and Resume ends the pause on yesterday and gives the focus to the heading', async () => {
    // A stored pause: its id is a UUID, since the store validates the plan it writes.
    const pause = { id: '00000000-0000-4000-8000-000000003000', from: '2026-10-01', until: null, note: '' } as Pause;
    const snapshot = fixtureSnapshot();
    const services = await mount(
      { action: null, handled: october('paused'), phase: phase('buy', pause) },
      { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, pauses: [pause] } },
    );
    expect(heading()).toBe('Paused since 1\u00a0Oct\u00a02026');
    expect(screen.queryByRole('button', { name: 'Bought as planned' })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume' })));
    expect(services.domain.store.getState().snapshot.plan?.pauses).toMatchObject([{ until: '2026-10-19' }]);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
  });

  it('a late month with a pause from today: the month leads, with no Resume', async () => {
    const pause = { id: 'p', from: '2026-10-20', until: null, note: '' } as Pause;
    await mount({ ...late, phase: phase('buy', pause) });
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
  });

  it('hold: the phase in Plan’s term and the day the sell window opens', async () => {
    await mount({ action: null, handled: null, phase: phase('hold') });
    expect(heading()).toBe('In the hold phase');
    expect(screen.getByText('The sell window opens on 1 Sept 2029.')).toBeDefined();
  });

  describe('the "Why?" link (docs/CONTENT-STYLE.md §3)', () => {
    const why = () => screen.queryByRole('button', { name: 'Why? The hold phase' });
    const openEnded = (): Snapshot => {
      const fixture = fixtureSnapshot();
      return { ...fixture, plan: fixture.plan && { ...fixture.plan, sellWindow: null } };
    };

    it('the hold phase shows Why? on its line', async () => {
      await mount({ action: null, handled: null, phase: phase('hold') });
      const line = screen.getByText('The sell window opens on 1 Sept 2029.');
      expect(why()?.parentElement).toBe(line);
      expect(why()?.className).not.toContain('min-h-target');
    });

    it.each(['hold', 'done'] as const)('an open-ended hold shows it on a line of its own (%s)', async (kind) => {
      await mount({ action: null, handled: null, phase: phase(kind) }, openEnded());
      expect(heading()).toBe('In the hold phase');
      expect(why()?.parentElement?.textContent).toBe('Why?');
      expect(why()?.className).toContain('min-h-target');
    });

    it('the buy and sell phases show none', async () => {
      await mount(late);
      expect(why()).toBeNull();
      cleanup();
      await mount({ action: null, handled: null, phase: phase('sell') });
      expect(why()).toBeNull();
      cleanup();
      await mount({ action: null, handled: null, phase: phase('done') });
      expect(why()).toBeNull();
    });
  });

  it('sell: the window and the day it closes', async () => {
    await mount({ action: null, handled: null, phase: phase('sell') });
    expect(heading()).toBe('In the sell window');
    expect(screen.getByText('It closes on 31 Aug 2030.')).toBeDefined();
  });

  it('ended: the plan’s exit date, and nothing to record', async () => {
    await mount({ action: null, handled: null, phase: phase('done') });
    expect(heading()).toBe('The plan ended on 31\u00a0Dec\u00a02030');
    expect(screen.queryByText('Record a purchase')).toBeNull();
  });

  it('a late month: "Bought as planned" and "Bought a different amount" in place of the Log link', async () => {
    await mount(late);
    expect(heading()).toBe('October\u00a02026 is still open');
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Bought a different amount' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Record a purchase' })).toBeNull();
  });

  it('a due month gets the tap too; an upcoming one keeps the link to the Log', async () => {
    await mount({ ...late, action: october('due') });
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    cleanup();
    await mount({ ...late, action: { ...october('upcoming'), due: '2026-11-05' as CalendarDate } });
    expect(screen.queryByRole('button', { name: 'Bought as planned' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Record a purchase' })).toBeDefined();
  });

  it('the tap records the planned split, says so, and Edit opens the new entries', async () => {
    const services = await mount(late, priced());
    fireEvent.click(screen.getByRole('button', { name: 'Bought as planned' }));
    expect(await screen.findByText(/^Recorded: 100,00\s€ on 20 Oct 2026\.$/u)).toBeDefined();
    expect(oneTaps(services).map((entry) => entry.amount)).toEqual(expect.arrayContaining(['70', '30']));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit the entry' })).toBeDefined();
    expect([paid('BTC'), paid('ETH')]).toEqual(['70,00', '30,00']);
  });

  it('a coin with no price: the tap writes nothing and opens the form with the planned amounts', async () => {
    const services = await mount(late, { ...fixtureSnapshot(), prices: TEST_PRICES });
    const before = services.domain.store.getState().snapshot.entries;
    fireEvent.click(screen.getByRole('button', { name: 'Bought as planned' }));
    expect(await screen.findByRole('dialog', { name: 'Log the monthly buy' })).toBeDefined();
    expect(services.domain.store.getState().snapshot.entries).toBe(before);
    expect([paid('BTC'), paid('ETH')]).toEqual(['70,00', '30,00']);
  });

  it('a plan changed in another tab since the card rendered: the tap writes nothing, says so and keeps the form shut', async () => {
    // The card shows 90 € (63/27) while the plan as stored now asks for 100 € (70/30).
    const services = await mount({ ...late, action: { ...october('late'), plannedAmount: '90' as Money } }, priced());
    const before = services.domain.store.getState().snapshot.entries;
    fireEvent.click(screen.getByRole('button', { name: 'Bought as planned' }));
    expect(await screen.findByText(errors.action['plan-changed'])).toBeDefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 })));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(services.domain.store.getState().snapshot.entries).toBe(before);
  });

  it.each([
    ['priced', priced],
    ['with no prices', fixtureSnapshot],
  ])(
    'a plan at 10,000 live entries, %s: the tap writes nothing, names the cap and keeps the form shut',
    async (_, at) => {
      const snapshot = at();
      const [first] = snapshot.entries as [Entry];
      const extras = Array.from({ length: MAX_ENTRIES - snapshot.entries.length }, () => ({
        ...first,
        id: EntityIdSchema.parse(crypto.randomUUID()),
        kind: 'extra' as const,
        slot: null,
      }));
      const services = await mount(late, { ...snapshot, entries: [...snapshot.entries, ...extras] });
      const before = services.domain.store.getState().snapshot.entries;
      fireEvent.click(screen.getByRole('button', { name: 'Bought as planned' }));
      expect(
        await screen.findByText(
          /^Recording this would take the plan past 10[\s.,]000 entries, the most a plan holds\. Delete entries in the Log to make room\.$/,
        ),
      ).toBeDefined();
      await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 })));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(services.domain.store.getState().snapshot.entries).toBe(before);
    },
  );

  // A count in copy is the figure of the plan's number locale (docs/CONTENT-STYLE.md §4).
  it("groups the days since a late buy day, and a late starting amount's, in a German plan", async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const german: Snapshot = { ...snapshot, plan: { ...snapshot.plan, country: 'DE' as typeof snapshot.plan.country } };
    const due = '2023-06-04' as CalendarDate;
    await mount({ ...late, action: { ...october('late'), due } }, german);
    expect(
      await screen.findByText('Buy day was 4 Jun 2023, 1.234 days ago. Record it or skip the month.'),
    ).toBeDefined();
    cleanup();
    const starting: Action = { ...october('late'), kind: 'lump', slot: null, plannedAmount: '1000' as Money, due };
    await mount({ action: starting, handled: null, phase: phase('buy') }, german);
    expect(await screen.findByText('It was due on 4 Jun 2023, 1.234 days ago.')).toBeDefined();
  });

  it('a late month says it can be recorded or skipped, and "Skip October 2026" skips it with Undo', async () => {
    const services = await mount(late);
    expect(screen.getByText('Buy day was 5 Oct 2026, 15 days ago. Record it or skip the month.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    const sheet = await screen.findByRole('dialog', { name: 'Skip October\u00a02026' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Skip October\u00a02026' }));
    expect(await screen.findByText('October 2026 skipped.')).toBeDefined();
    expect(services.domain.store.getState().snapshot.plan?.skips.map((skip) => skip.slot)).toContain('2026-10');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 })));
    expect(services.domain.store.getState().snapshot.plan?.skips.map((skip) => skip.slot)).not.toContain('2026-10');
  });

  it('the starting amount cannot be skipped', async () => {
    const starting: Action = { ...october('late'), kind: 'lump', slot: null, plannedAmount: '1000' as Money };
    await mount({ ...late, action: starting });
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Skip/u })).toBeNull();
  });

  // The fixture holds coins, yet a buy button never offers the choice of kinds (the Log's Record a purchase does).
  it('"Bought a different amount" opens the form for the month, with no choice of a sale', async () => {
    await mount(late, priced());
    fireEvent.click(screen.getByRole('button', { name: 'Bought a different amount' }));
    expect(await screen.findByRole('dialog', { name: 'Log the monthly buy' })).toBeDefined();
    expect(screen.getByText('For October 2026')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Type of transaction' })).toBeNull();
  });
});
