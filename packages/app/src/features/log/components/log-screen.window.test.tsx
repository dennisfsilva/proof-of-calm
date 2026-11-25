// @vitest-environment jsdom
import { type CalendarDate, type Entry, LOG_WINDOW, MAX_ENTRIES, PrefsSchema } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import shell from '../../../messages/en/shell.json';
import { LogScreen } from './log-screen';

// The Log past LOG_WINDOW transactions (docs/DOMAIN.md §3.9): Show all shows a window of LOG_WINDOW at a time, with
// Show newer entries, Show older entries and Go to year, and moves the focus as docs/DESIGN.md §6 says. The fixture's
// 8 transactions and `count` extra buys, one a day before its first buy day: 258 at 250, with 102 of them in 2026.

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
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
await preloadLazyModules();

function withBuys(count: number, showAll = false): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const dayBefore = Date.UTC(2026, 3, 4);
  const more = Array.from(
    { length: count },
    (_, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(800_000 + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      date: new Date(dayBefore - index * 86_400_000).toISOString().slice(0, 10) as CalendarDate,
      deletedAt: null,
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more], prefs: { ...snapshot.prefs, logShowAll: showAll } };
}

async function mount(snapshot: Snapshot) {
  const services: Services = createTestServices({ snapshot, nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log, shell }}>
        <Toaster closeLabel="Close" toastManager={services.toasts}>
          <LogScreen />
        </Toaster>
      </I18nProvider>
    </ServicesProvider>,
  );
  return services;
}

const toggles = () => screen.getAllByRole('button', { expanded: false });
const caption = () => screen.getByText(/^Entries \d+ to \d+ of /);
const press = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })));

describe('LogScreen past LOG_WINDOW transactions', () => {
  // At the cap: Show all mounted 10,000 rows in one render of 17 to 20 s at 6x (docs/ENGINEERING.md §4).
  it('shows all 10,000 entries 48 at a time, the 13th row focused', { timeout: 15_000 }, async () => {
    await mount(withBuys(MAX_ENTRIES - fixtureSnapshot().entries.length));
    const button = screen.getByRole('button', { name: /^Show all 9[\s.,]?9\d\d entries, 48 at a time$/ });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(toggles()).toHaveLength(LOG_WINDOW);
    expect(caption().textContent).toMatch(/^Entries 1 to 48 of 9[\s.,]?9\d\d$/);
    expect(document.activeElement).toBe(toggles()[12]);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('opens on the first window when the stored preference says Show all, as a build before the window wrote it', async () => {
    await mount(withBuys(250, true));
    expect(toggles()).toHaveLength(LOG_WINDOW);
    expect(caption().textContent).toBe('Entries 1 to 48 of 258');
  });

  it('writes the preference a build before the window reads, and moves through the windows', async () => {
    const services = await mount(withBuys(250));
    await press('Show all 258 entries, 48 at a time');
    const prefs = services.domain.store.getState().snapshot.prefs;
    expect(z.object(PrefsSchema.shape).safeParse(prefs).success).toBe(true);
    expect(screen.queryByRole('button', { name: 'Show newer entries' })).toBeNull();
    await press('Show older entries');
    expect(caption().textContent).toBe('Entries 49 to 96 of 258');
    expect(document.activeElement).toBe(toggles()[0]);
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'start' });
    expect(scrolled.mock.contexts.at(-1)).toBe(caption());
    for (const _ of [97, 145, 193, 241]) await press('Show older entries');
    expect(caption().textContent).toBe('Entries 241 to 258 of 258');
    expect(toggles()).toHaveLength(18);
    expect(screen.queryByRole('button', { name: 'Show older entries' })).toBeNull();
    await press('Show newer entries');
    expect(caption().textContent).toBe('Entries 193 to 240 of 258');
    expect(document.activeElement).toBe(toggles()[0]);
  });

  it("goes to a year's newest entry and keeps the focus on the choice", async () => {
    await mount(withBuys(250, true));
    const user = userEvent.setup({ document });
    const year = screen.getByRole('combobox', { name: 'Go to year' });
    expect(year.textContent).toContain('2026');
    await user.click(year);
    await user.click(await screen.findByRole('option', { name: '2025' }));
    await vi.waitFor(() => expect(caption().textContent).toBe('Entries 103 to 150 of 258'));
    expect(toggles()[0]?.textContent).toMatch(/^31\sDec\s2025Extra buy/);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Go to year' }));
  });

  it('slides the next row into a window whose last row was deleted, and focuses it', async () => {
    await mount(withBuys(250, true));
    const last = toggles()[LOG_WINDOW - 1] as HTMLElement;
    const lastText = last.textContent;
    fireEvent.click(last);
    await press('Delete entry');
    expect(toggles()).toHaveLength(LOG_WINDOW);
    expect(caption().textContent).toBe('Entries 1 to 48 of 257');
    expect(document.activeElement).toBe(toggles()[LOG_WINDOW - 1]);
    expect(document.activeElement?.textContent).not.toBe(lastText);
  });

  it('moves no focus later for an Undo pressed after the window moved away', async () => {
    const services = await mount(withBuys(250, true));
    fireEvent.click(toggles()[5] as HTMLElement);
    await press('Delete entry');
    await press('Show older entries');
    // The restored row is in the window before: the shown rows shift by one, and the focus stays on its row.
    const first = toggles()[0];
    await press('Undo');
    expect(document.activeElement).toBe(first);
    await press('Show newer entries');
    expect(document.activeElement).toBe(toggles()[0]);
    // Another tab's write renders the rows again: the restored row, now shown, takes no focus.
    const [entry] = services.domain.store.getState().snapshot.entries as [Entry];
    await act(() => services.domain.write(() => ({ entries: [{ ...entry, note: 'From another tab' }] })));
    expect(document.activeElement).toBe(toggles()[0]);
  });

  it('moves focus to the heading when an edit moves the row out of the window', async () => {
    await mount(withBuys(250, true));
    const toggle = toggles().find((button) => /^4\sApr\s2026Extra buy/.test(button.textContent)) as HTMLElement;
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    expect(await screen.findByText('Edit the entry')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-01-01' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Log' })));
  });
});
