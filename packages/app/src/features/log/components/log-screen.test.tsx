// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CalendarDate, type Entry, heldUnits, liveEntries, MAX_ENTRIES, type MonthKey } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import shell from '../../../messages/en/shell.json';
import { logActions } from '../actions';
import { EntrySheet } from './entry-sheet';
import { LogScreen } from './log-screen';

// The Log screen (docs/DOMAIN.md §3.9 and §6): the last 12 transactions, then all of them; a deletion that the
// toast's Undo restores; the one "Computed from your dates" line; the empty states of
// docs/CONTENT-STYLE.md §3. `hasFocus` is true because jsdom has no system focus (see toast.test).

// jsdom has no `scrollIntoView`: the focus moves call it, so it is stubbed and the tests that care read it.
const scrolled = vi.fn();
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
// Under Vitest each import() of a profile is a round trip to the main process, which under load outlasted a
// findBy (2026-10-26): the profiles load once, here (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
// The jurisdiction profiles behind `portugal` load while the file loads, outside any test's timeout, so a
// findBy waits on renders, not on Vite's first transform (seconds under load).
await preloadLazyModules();

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

/** The fixture with four more buys, and any `extra` dates: 12 transactions and July's skip, plus those. */
function withMoreBuys(...extra: string[]): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const more = ['2026-04-20', '2026-05-25', '2026-08-20', '2026-10-12', ...extra].map(
    (date, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}` as Entry['id'],
      kind: 'extra',
      date: date as CalendarDate,
      amount: '50' as Entry['amount'],
      units: '0.0008' as Entry['units'],
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
}

async function mount(snapshot: Snapshot, content: ReactNode = <LogScreen />) {
  const services: Services = createTestServices({ snapshot, nowMs: fixtureNowMs('buy'), rules: portugal });
  await act(() => services.start());
  view(services, content);
  return services;
}

function view(services: Services, content: ReactNode = <LogScreen />) {
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log, shell }}>
        <Toaster closeLabel="Close" toastManager={services.toasts}>
          {content}
        </Toaster>
      </I18nProvider>
    </ServicesProvider>,
  );
}

const rows = () => document.querySelectorAll('tbody [data-slot="table-row"]');
const NOTE = 'Computed from your dates, not tax advice';
/** The matching elements outside a closed detail row. */
const shown = (text: string | RegExp) =>
  screen.queryAllByText(text).filter((element) => element.closest('[hidden]') === null);

describe('LogScreen', () => {
  it('shows 12 transactions and the skip among them without a Show all button', async () => {
    await mount(withMoreBuys());
    expect(rows()).toHaveLength(13);
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('shows the last 12 transactions under their month headers, a skip not counted, then all 13', async () => {
    await mount(withMoreBuys('2026-07-20'));
    expect(rows()).toHaveLength(13);
    expect(screen.getByRole('columnheader', { name: /^October\u00a02026 · bought / })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^September\u00a02026 · bought .* · sold / })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^July\u00a02026 · bought / })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show all 13 entries' })));
    expect(rows()).toHaveLength(14);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('writes Show all to the device preference, so the Log opens with all rows after a remount', async () => {
    const services = await mount(withMoreBuys('2026-07-20'));
    expect(services.domain.store.getState().snapshot.prefs.logShowAll).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show all 13 entries' })));
    expect(services.domain.store.getState().snapshot.prefs.logShowAll).toBe(true);
    cleanup();
    view(services);
    expect(rows()).toHaveLength(14);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('keeps a preference written just before Show all, still on its way to storage', async () => {
    const store = memoryPlanStore(withMoreBuys('2026-07-20'));
    let land: () => void = () => undefined;
    const landed = new Promise<void>((resolve) => {
      land = resolve;
    });
    const planStore = {
      ...store,
      write: async (changes: Parameters<typeof store.write>[0]) => {
        if (changes.prefs?.theme === 'dark') await landed;
        return store.write(changes);
      },
    };
    const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy'), rules: portugal });
    await act(() => services.start());
    view(services);
    const theme = services.domain.write({
      prefs: { ...services.domain.store.getState().snapshot.prefs, theme: 'dark' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show all 13 entries' }));
    await act(async () => {
      land();
      await theme;
    });
    await vi.waitFor(() => expect(services.domain.store.getState().snapshot.prefs.logShowAll).toBe(true));
    expect(services.domain.store.getState().snapshot.prefs.theme).toBe('dark');
    expect(store.current().prefs).toEqual(expect.objectContaining({ theme: 'dark', logShowAll: true }));
  });

  it('moves focus from Show all to the first newly revealed row, so the keyboard continues there', async () => {
    await mount(withMoreBuys('2026-07-20'));
    const button = screen.getByRole('button', { name: 'Show all 13 entries' });
    button.focus();
    await act(async () => fireEvent.click(button));
    // Newest first: the starting buy of 5 Apr 2026, the oldest, is the one row Show all reveals.
    const toggles = screen.getAllByRole('button', { expanded: false });
    expect(toggles).toHaveLength(13);
    expect(document.activeElement).toBe(toggles[12]);
    expect(document.activeElement?.textContent).toContain('5\u00a0Apr\u00a02026');
    // Scrolled into view within the scroll padding, so the row clears the tab bar (docs/DESIGN.md §6).
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  it("lands on the 13th row's toggle with the conditions' control open above it", async () => {
    await mount(withMoreBuys('2026-07-20'));
    const [newest] = screen.getAllByRole('button', { name: /Extra buy/ }) as [HTMLElement];
    fireEvent.click(newest);
    expect(screen.getByRole('button', { name: 'Show 3 more conditions' })).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show all 13 entries' })));
    // A skip's row has no toggle, and the control in an open detail is not a row's.
    const toggles = [...rows()].flatMap((row) => row.querySelector('button') ?? []);
    expect(toggles).toHaveLength(13);
    expect(document.activeElement).toBe(toggles[12]);
  });

  it('keeps Show all and says the change was not saved when the preference write fails', async () => {
    const store = memoryPlanStore(withMoreBuys('2026-07-20'));
    let writes = 0;
    const planStore = {
      ...store,
      write: async (changes: Parameters<typeof store.write>[0]) => {
        writes += 1;
        if (writes === 1) throw new Error('QuotaExceededError');
        return store.write(changes);
      },
    };
    const services = createTestServices({ planStore, nowMs: fixtureNowMs('buy'), rules: portugal });
    await act(() => services.start());
    view(services);
    const button = screen.getByRole('button', { name: 'Show all 13 entries' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(document.activeElement).toBe(button);
    expect(writes).toBe(1);
    expect(services.domain.store.getState().snapshot.prefs.logShowAll).toBe(false);
    expect(rows()).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'Show all 13 entries' })).toBeTruthy();
    expect(screen.getByText('The change could not be saved. Try again.')).toBeTruthy();
  });

  it('opens with all rows when the device preference says so', async () => {
    const snapshot = withMoreBuys('2026-07-20');
    await mount({ ...snapshot, prefs: { ...snapshot.prefs, logShowAll: true } });
    expect(rows()).toHaveLength(14);
  });

  it('shows a skipped month under its month header as "Skipped", the month not repeated', async () => {
    await mount(fixtureSnapshot());
    const header = screen.getByRole('columnheader', { name: 'July\u00a02026' });
    const skip = screen.getByText('Skipped');
    expect(header.closest('tr')?.nextElementSibling?.contains(skip)).toBe(true);
    expect(screen.queryByText(/July 2026 · skipped/)).toBeNull();
  });

  it('shows the holding note once, in the topmost open row with a holding date', async () => {
    await mount(fixtureSnapshot());
    // Newest first: the sale (no holding date), then the September and August buys.
    const [, september, august] = screen.getAllByRole('button', { expanded: false }) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    const detail = (toggle: HTMLElement) => toggle.closest('tr')?.nextElementSibling;
    fireEvent.click(august);
    expect(shown(NOTE)).toHaveLength(1);
    expect(detail(august)?.contains(shown(NOTE)[0] ?? null)).toBe(true);
    fireEvent.click(september);
    expect(shown(/^Tax-free from /)).toHaveLength(2);
    expect(shown(NOTE)).toHaveLength(1);
    expect(detail(september)?.contains(shown(NOTE)[0] ?? null)).toBe(true);
  });

  it('puts the holding note beside the first holding date only', async () => {
    await mount(fixtureSnapshot());
    for (const toggle of screen.getAllByRole('button', { expanded: false })) fireEvent.click(toggle);
    expect(screen.getAllByText(/^Tax-free from /).length).toBeGreaterThan(1);
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
  });

  it('shows no holding date while the rules of a new country load, and shows it again once they have', async () => {
    let arrive: () => void = () => undefined;
    const rules = (country: string) =>
      country === 'PT' ? portugal() : new Promise<null>((resolve) => (arrive = () => resolve(null))).then(portugal);
    const services = createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy'), rules });
    await act(() => services.start());
    view(services);
    for (const toggle of screen.getAllByRole('button', { expanded: false })) fireEvent.click(toggle);
    expect(shown(/^Tax-free from /).length).toBeGreaterThan(0);
    await act(() =>
      services.domain.write((snapshot) => ({ plan: snapshot.plan && { ...snapshot.plan, country: 'DE' } })),
    );
    expect(shown(/^Tax-free from /)).toHaveLength(0);
    expect(shown(NOTE)).toHaveLength(0);
    await act(async () => arrive());
    await vi.waitFor(() => expect(shown(/^Tax-free from /).length).toBeGreaterThan(0));
    expect(shown(NOTE)).toHaveLength(1);
  });

  it('deletes a transaction, and Undo restores it', async () => {
    const services = await mount(withMoreBuys());
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    expect(rows()).toHaveLength(12);
    expect(screen.getByRole('status').textContent).toContain('Entry deleted.');
    const deleted = services.domain.store.getState().snapshot.entries.filter((entry) => entry.deletedAt !== null);
    expect(deleted.map((entry) => entry.date)).toEqual(['2026-10-12']);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    expect(rows()).toHaveLength(13);
    expect(services.domain.store.getState().snapshot.entries.every((entry) => entry.deletedAt === null)).toBe(true);
  });

  it('keeps a monthly buy deleted and says why when its month was skipped before the Undo', async () => {
    const snapshot = fixtureSnapshot();
    const [first] = snapshot.entries as [Entry];
    const october: Entry = {
      ...first,
      id: '00000000-0000-4000-8000-000000000200' as Entry['id'],
      kind: 'dca',
      date: '2026-10-05' as CalendarDate,
      slot: '2026-10' as Entry['slot'],
    };
    const services = await mount({ ...snapshot, entries: [...snapshot.entries, october] });
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    // Another tab, or the Record sheet, skips October while the toast still offers the Undo.
    await act(() => logActions(services).skipMonthAction(october.slot as MonthKey, ''));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'October\u00a02026 was skipped after you deleted this entry, so it stays deleted.',
      ),
    );
    const stored = services.domain.store.getState().snapshot.entries.find((entry) => entry.id === october.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it('keeps an entry deleted and says why when a backup replaced the plan before the Undo', async () => {
    const services = await mount(withMoreBuys());
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    // Another tab's "Replace everything" writes the tombstone again, a minute after the delete.
    await act(() =>
      services.domain.write(({ entries }) => ({
        entries: entries
          .filter((entry) => entry.deletedAt !== null)
          .map((entry) => ({ ...entry, updatedAt: '2026-10-20T10:01:00.000Z' as Entry['updatedAt'] })),
      })),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'A backup replaced your plan after you deleted this entry, so it stays deleted.',
      ),
    );
    expect(rows()).toHaveLength(12);
  });

  // #136 (docs/DOMAIN.md §3.7): every write leaves each sale covered by purchases dated on or before it.
  const withSaleOfAll = () => {
    const snapshot = withMoreBuys();
    const [first] = snapshot.entries as [Entry];
    const sale: Entry = {
      ...first,
      id: '00000000-0000-4000-8000-000000000300' as Entry['id'],
      kind: 'sell',
      slot: null,
      date: '2026-10-14' as CalendarDate,
      units: heldUnits(snapshot.entries, first.coin),
    };
    return { snapshot: { ...snapshot, entries: [...snapshot.entries, sale] }, sale };
  };

  it('keeps a purchase that covers a later sale and says why', async () => {
    const { snapshot } = withSaleOfAll();
    const services = await mount(snapshot);
    // The newest row is the sale; the next one is the purchase of 12 October that covers it.
    const [, purchase] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement, HTMLElement];
    fireEvent.click(purchase);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    expect(screen.getByRole('status').textContent).toContain(
      'This purchase covers a later BTC sale, so it stays. Change or delete the sale first.',
    );
    expect(services.domain.store.getState().snapshot.entries.every((entry) => entry.deletedAt === null)).toBe(true);
  });

  it('keeps a sale deleted and says why when its units were sold again before the Undo', async () => {
    const { snapshot, sale } = withSaleOfAll();
    const services = await mount(snapshot);
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    // Another tab records a sale of the same units while the toast still offers the Undo.
    const again = { ...sale, id: '00000000-0000-4000-8000-000000000301' as Entry['id'], deletedAt: null };
    await act(() => services.domain.write(() => ({ entries: [again] })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Your BTC entries changed after you deleted this sale, so it stays deleted.',
      ),
    );
    const stored = services.domain.store.getState().snapshot.entries.find((entry) => entry.id === sale.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  // docs/DOMAIN.md §6, §9: a plan holds at most MAX_ENTRIES live entries, the most a backup restores.
  const extraBuys = (count: number, from: number): Entry[] => {
    const [first] = fixtureSnapshot().entries as [Entry];
    return Array.from({ length: count }, (_, index) => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(from + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      date: '2026-02-10' as CalendarDate,
      deletedAt: null,
    }));
  };
  const toTheCap = (snapshot: Snapshot) => extraBuys(MAX_ENTRIES - liveEntries(snapshot.entries).length, 500_000);
  /** The sheet as the Log's Record a purchase opens it on October's monthly buy, open until it closes itself. */
  function RecordSheet({ slot }: { readonly slot: MonthKey }) {
    const [open, setOpen] = useState(true);
    return (
      <EntrySheet
        kind="dca"
        slot={slot}
        editing={[]}
        offerKinds
        open={open}
        onOpenChange={setOpen}
        onDone={() => undefined}
      />
    );
  }
  const FULL =
    /Recording this would take the plan past 10[\s.,]000 entries, the most a plan holds\. Delete entries in the Log to make room\./;

  it('refuses a new purchase by Save once the plan holds 10,000 live entries, and records nothing', async () => {
    // The sheet that Record a purchase opens (the tests below open it from the Log), on the same store, without the
    // Log around it: each render of the Log recomputes its rows over the 10,000 entries, and the whole screen
    // outlasted CI's 5 s timeout (2026-10-28).
    const snapshot = fixtureSnapshot();
    const services = await mount(
      { ...snapshot, entries: [...snapshot.entries, ...toTheCap(snapshot)] },
      <RecordSheet slot={'2026-10' as MonthKey} />,
    );
    await screen.findByRole('dialog', { name: 'Log the monthly buy' });
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0.0012' } });
    fireEvent.change(screen.getByLabelText('ETH received (units)'), { target: { value: '0.012' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect((await screen.findByRole('alert')).textContent).toMatch(FULL);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(liveEntries(services.domain.store.getState().snapshot.entries)).toHaveLength(MAX_ENTRIES);
  });

  // The Log renders the 10,000 entries' rows twice in jsdom (2.6 s here under the whole suite's load, over 5 s on CI).
  it('keeps an entry deleted and says why when the plan reached 10,000 entries before the Undo', {
    timeout: 8_000,
  }, async () => {
    const snapshot = withMoreBuys();
    const services = await mount(snapshot);
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    // Another tab fills the plan to the cap while the toast still offers the Undo.
    const more = extraBuys(MAX_ENTRIES - liveEntries(snapshot.entries).length + 1, 600_000);
    await act(() => services.domain.write(() => ({ entries: more })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /Restoring this entry would take the plan past the 10[\s.,]000 entries a plan holds, so it stays deleted\./,
      ),
    );
    expect(liveEntries(services.domain.store.getState().snapshot.entries)).toHaveLength(MAX_ENTRIES);
  });

  it('moves focus to the toggle of the row Undo restores', async () => {
    await mount(withMoreBuys());
    const [newest] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement];
    fireEvent.click(newest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Log' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    const restored = document.activeElement;
    expect(restored?.getAttribute('aria-expanded')).not.toBeNull();
    expect(restored?.textContent).toContain('12\u00a0Oct\u00a02026');
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  it("records October's open monthly buy from the Record button and gives the focus back to it", async () => {
    const services = await mount(fixtureSnapshot());
    const button = screen.getByRole('button', { name: 'Record a purchase' });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Log the monthly buy')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0.0012' } });
    fireEvent.change(screen.getByLabelText('ETH received (units)'), { target: { value: '0.012' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Two coins, so the toast names the total and not a coin; Portugal formats the money.
    expect(screen.getByRole('status').textContent).toMatch(/Recorded: 100,00\s€ on 20\sOct\s2026\./);
    // The store keeps entries in id order, as IndexedDB does, and fresh ids are random: compare by coin.
    const october = services.domain.store.getState().snapshot.entries.filter((entry) => entry.slot === '2026-10');
    expect(october.map((entry) => [entry.coin, entry.amount]).sort()).toEqual([
      ['BTC', '70'],
      ['ETH', '30'],
    ]);
    await vi.waitFor(() => expect(document.activeElement).toBe(button));
  });

  // CONTENT-STYLE §3, Record on the Log: coins already held have their own way in, with no choice of kinds.
  it('logs coins already held from their own button, and the toast names the units without a cost', async () => {
    const services = await mount(fixtureSnapshot());
    const button = screen.getByRole('button', { name: 'Add coins you already have' });
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Log coins you already have' });
    expect(within(dialog).queryByRole('button', { name: 'Sale' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } });
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0,5' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/^Recorded: 0,5\sBTC added on 15\sMar\s2024\.$/);
    const added = services.domain.store.getState().snapshot.entries.filter((entry) => entry.kind === 'held');
    expect(added.map((entry) => [entry.coin, entry.units, entry.amount])).toEqual([['BTC', '0.5', null]]);
    await vi.waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('names the cost of coins added when one was typed, 0 included', async () => {
    await mount(fixtureSnapshot());
    fireEvent.click(screen.getByRole('button', { name: 'Add coins you already have' }));
    await screen.findByRole('dialog', { name: 'Log coins you already have' });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } });
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0,5' } });
    fireEvent.change(screen.getByLabelText('BTC cost (EUR, if known)'), { target: { value: '0' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/^Recorded: 0,5\sBTC added for 0,00\s€ on 15\sMar\s2024\.$/);
  });

  // CONTENT-STYLE §1 rule 2: the toast of a new sale says it was a sale.
  it('records a sale from the Record button and says it sold', async () => {
    const services = await mount(fixtureSnapshot());
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    await screen.findByRole('dialog', { name: 'Log the monthly buy' });
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }));
    await screen.findByRole('dialog', { name: 'Log a sale' });
    fireEvent.change(screen.getByLabelText('BTC sold (units)'), { target: { value: '0,001' } });
    fireEvent.change(screen.getByLabelText('Received for BTC (EUR)'), { target: { value: '60,00' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/^Recorded: sold 60,00\s€ of BTC on 20\sOct\s2026\.$/);
    const sales = services.domain.store.getState().snapshot.entries.filter((entry) => entry.date === '2026-10-20');
    expect(sales.map((entry) => [entry.kind, entry.coin, entry.amount])).toEqual([['sell', 'BTC', '60']]);
  });

  // CONTENT-STYLE §3, Record on the Log: an extra buy made while a month is open leaves the month open.
  it('records an extra buy while a month is open, and the next Record opens the monthly buy again', async () => {
    const services = await mount(fixtureSnapshot());
    const before = services.domain.store.getState().snapshot.entries.map((entry) => entry.id);
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    await screen.findByRole('dialog', { name: 'Log the monthly buy' });
    const monthly = screen.getByRole('button', { name: 'Monthly buy' });
    expect(monthly.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Extra buy' }));
    await screen.findByRole('dialog', { name: 'Log an extra buy' });
    fireEvent.change(screen.getByLabelText('BTC paid (EUR)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0.0008' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toMatch(/^Recorded: 50,00\s€ of BTC on 20\sOct\s2026\.$/);
    const { entries } = services.domain.store.getState().snapshot;
    const added = entries.filter((entry) => !before.includes(entry.id));
    expect(added.map((entry) => [entry.kind, entry.slot, entry.coin, entry.amount])).toEqual([
      ['extra', null, 'BTC', '50'],
    ]);
    expect(entries.filter((entry) => entry.deletedAt === null && entry.slot === '2026-10')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    await screen.findByRole('dialog', { name: 'Log the monthly buy' });
    expect(screen.getByRole('button', { name: 'Monthly buy' }).getAttribute('aria-pressed')).toBe('true');
  });

  // #349: coins held before the plan go in as an extra buy before the first buy day.
  it('records an extra buy dated before the first buy day while the starting amount is open', async () => {
    const { plan } = fixtureSnapshot();
    const services = await mount({
      ...EMPTY_SNAPSHOT,
      plan: plan && { ...plan, firstBuy: '2026-11-05' as CalendarDate, skips: [] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    const group = within(await screen.findByRole('dialog', { name: 'Log the starting amount' })).getByRole('group', {
      name: 'Type of transaction',
    });
    expect(
      within(group)
        .getAllByRole('button')
        .map((option) => option.textContent),
    ).toEqual(['Starting amount', 'Extra buy']);
    fireEvent.click(within(group).getByRole('button', { name: 'Extra buy' }));
    await screen.findByRole('dialog', { name: 'Log an extra buy' });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-01' } });
    fireEvent.change(screen.getByLabelText('BTC paid (EUR)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('BTC received (units)'), { target: { value: '0.02' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const { entries } = services.domain.store.getState().snapshot;
    expect(entries.map((entry) => [entry.kind, entry.slot, entry.coin, entry.date])).toEqual([
      ['extra', null, 'BTC', '2025-06-01'],
    ]);
    expect(screen.queryByText(/^No entries yet/)).toBeNull();
  });

  it('skips the open month from the sheet of a new monthly buy, and the Log lists it with its note', async () => {
    await mount(fixtureSnapshot());
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    await screen.findByRole('dialog', { name: 'Log the monthly buy' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    const sheet = await screen.findByRole('dialog', { name: 'Skip October\u00a02026' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: 'car repair' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Skip October\u00a02026' }));
    expect(await screen.findByText('Skipped · car repair')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'October\u00a02026' })).toBeTruthy();
  });

  it("edits a purchase from its row's Edit button and says the entry was saved", async () => {
    const snapshot = fixtureSnapshot();
    const services = await mount({ ...snapshot, entries: snapshot.entries.slice(0, 2) });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    expect(await screen.findByText('Edit the entry')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('BTC paid (EUR)'), { target: { value: '800' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Entry saved.');
    const [btc, eth] = services.domain.store.getState().snapshot.entries;
    expect([btc?.id, btc?.amount, eth?.amount]).toEqual([snapshot.entries[0]?.id, '800', '300']);
  });

  /** Opens the row of `date` (the toggles' text starts with it), edits its date to `to` and saves. */
  async function editDate(date: RegExp, to: string) {
    const toggle = screen.getAllByRole('button', { expanded: false }).find((button) => date.test(button.textContent));
    fireEvent.click(toggle as HTMLElement);
    const edit = screen.getAllByRole('button', { name: 'Edit entry' }).at(-1) as HTMLElement;
    edit.focus();
    fireEvent.click(edit);
    expect(await screen.findByText('Edit the entry')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: to } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }

  // Review round 1: a new date gives the row a new key, so its Edit button was gone and focus fell to the body.
  it("moves focus to the row's toggle under its new date when an edit moves the row", async () => {
    await mount(fixtureSnapshot());
    await editDate(/^5\sApr\s2026Starting amount/, '2026-09-03');
    await vi.waitFor(() => expect(document.activeElement?.textContent).toMatch(/^3\sSept?\s2026Starting amount/));
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
  });

  it("moves focus to the moved row's toggle with the conditions' control open above it", async () => {
    await mount(fixtureSnapshot());
    const [, september] = screen.getAllByRole('button', { expanded: false }) as [HTMLElement, HTMLElement];
    fireEvent.click(september);
    expect(screen.getByRole('button', { name: 'Show 3 more conditions' })).toBeDefined();
    await editDate(/^5\sApr\s2026Starting amount/, '2026-06-03');
    await vi.waitFor(() => expect(document.activeElement?.textContent).toMatch(/^3\sJun\s2026Starting amount/));
  });

  it('moves focus to the row the edited entry joined when the new date merges it into another', async () => {
    const services = await mount(withMoreBuys());
    await editDate(/^20\sApr\s2026Extra buy/, '2026-06-18');
    await vi.waitFor(() => expect(document.activeElement?.textContent).toMatch(/^18\sJun\s2026Extra buy/));
    const june = services.domain.store.getState().snapshot.entries.filter((entry) => entry.date === '2026-06-18');
    expect(june).toHaveLength(2);
  });

  it('says what to do when there is no plan, and when the plan has no entries yet', async () => {
    await mount(EMPTY_SNAPSHOT);
    expect(screen.getByText('No entries yet. Set up a plan or import a file.')).toBeTruthy();
    cleanup();
    const { plan } = fixtureSnapshot();
    await mount({ ...EMPTY_SNAPSHOT, plan: plan && { ...plan, firstBuy: '2026-11-05' as CalendarDate, skips: [] } });
    expect(screen.getByText(/^No entries yet\. Your first buy day is .*2026\.$/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says no entries yet when the plan has only a skip, and lists the skipped month under the line', async () => {
    await mount({ ...fixtureSnapshot(), entries: [] });
    expect(screen.getByText('No entries yet. Your first buy day was 5 Apr 2026.')).toBeTruthy();
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'July\u00a02026' })).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('says no entries yet once the last entry is deleted, and Undo brings its row back', async () => {
    const snapshot = fixtureSnapshot();
    await mount({ ...snapshot, entries: snapshot.entries.slice(0, 1) });
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete entry' })));
    expect(screen.getByText(/^No entries yet\. Your first buy day was /)).toBeTruthy();
    expect(rows()).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText(/^No entries yet/)).toBeNull();
  });
});
