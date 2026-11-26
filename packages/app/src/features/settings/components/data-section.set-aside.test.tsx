// @vitest-environment jsdom
import { exportBackup, liveEntries } from '@proofofcalm/core';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters/memory-store';
import type { Snapshot } from '../../../lib/ports';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { keptQuestion } from '../../../lib/store';
import { choose, type Mounted, mount, NOW } from './data-section.testing';

// Settings → Currency & data → Your data: how many saved items were set aside as unreadable, while any is
// (ADR-0019 Readings, 2026-11-26); it ends only with Delete everything.

afterEach(cleanup);

const LINE = /saved items? could not be read/;

describe('DataSection: the set-aside count', () => {
  it('shows nothing while nothing is set aside', async () => {
    await mount(fixtureSnapshot());
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('says how many saved items were set aside and that exports leave them out, after the export lines', async () => {
    await mount({
      ...fixtureSnapshot(),
      quarantined: 3,
      setAside: { plans: [], entries: [{ id: 'gone', at: NOW }] },
    });
    const line = screen.getByText(LINE);
    expect(line.textContent).toBe(
      '3 saved items could not be read, so Proof of Calm set them aside. They stay on this device as they were saved, and exports leave them out.',
    );
    expect(line.className.split(' ')).toContain('text-ink-2');
  });

  it('shows the count after Nothing to export yet while no plan shows', async () => {
    await mount({
      ...EMPTY_SNAPSHOT,
      quarantined: 1,
      setAside: { plans: [{ id: 'plan', at: NOW, currency: null }], entries: [] },
    });
    const none = screen.getByText('Nothing to export yet. Set up a plan or import a file.');
    expect(none.nextElementSibling?.textContent).toBe(
      '1 saved item could not be read, so Proof of Calm set it aside. It stays on this device as it was saved, and exports leave it out.',
    );
  });
});

// ADR-0019 Readings, 2026-11-26: the count stays until Delete everything, so once an import brings a set-aside
// entry or the plan back, the line says what is back and, while any is not, how many exports still leave out.
describe('DataSection: the set-aside count after a recovery', () => {
  const snapshot = fixtureSnapshot();
  const gone = liveEntries(snapshot.entries)[0];
  if (snapshot.plan === null || gone === undefined) throw new Error('the fixture has a plan and a live entry');
  const plan = snapshot.plan;
  const BACK = /back in your data and exports/;

  it('after Add missing entries only brings an entry back, the line says it is back', async () => {
    await mount({
      ...snapshot,
      entries: snapshot.entries.filter((entry) => entry.id !== gone.id),
      quarantined: 1,
      setAside: { plans: [], entries: [{ id: gone.id, at: NOW }] },
    });
    expect(screen.getByText(LINE).textContent).toMatch(/exports leave it out\.$/);
    await choose(JSON.stringify(exportBackup(plan, snapshot.entries, NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    await waitFor(() =>
      expect(screen.getByText(LINE).textContent).toBe(
        '1 saved item could not be read, so Proof of Calm set it aside. It is back in your data and exports, ' +
          'and only its unreadable copy stays set aside on this device.',
      ),
    );
  });

  it('counts the plan back too, and keeps the count of everything set aside', async () => {
    await mount({
      ...snapshot,
      quarantined: 3,
      setAside: { plans: [{ id: plan.id, at: NOW, currency: 'EUR' }], entries: [{ id: gone.id, at: NOW }] },
    });
    expect(screen.getByText(LINE).textContent).toBe(
      '3 saved items could not be read, so Proof of Calm set them aside. 2 of them are back in your data and ' +
        'exports. The other 1 stays on this device as it was saved, and exports leave it out.',
    );
  });

  it('when some items are back, the line names the rest and says exports leave them out', async () => {
    await mount({ ...snapshot, quarantined: 3, setAside: { plans: [], entries: [{ id: gone.id, at: NOW }] } });
    expect(screen.getByText(LINE).textContent).toBe(
      '3 saved items could not be read, so Proof of Calm set them aside. 1 of them is back in your data and ' +
        'exports. The other 2 stay on this device as they were saved, and exports leave them out.',
    );
  });

  it('when every item is back, the line says only the unreadable copies stay set aside', async () => {
    await mount({
      ...snapshot,
      quarantined: 2,
      setAside: { plans: [{ id: plan.id, at: NOW, currency: 'EUR' }], entries: [{ id: gone.id, at: NOW }] },
    });
    expect(screen.getByText(LINE).textContent).toBe(
      '2 saved items could not be read, so Proof of Calm set them aside. All of them are back in your data and ' +
        'exports, and only the unreadable copies stay set aside on this device.',
    );
  });

  it('at zero, nothing', async () => {
    await mount({ ...snapshot, quarantined: 0, setAside: { plans: [], entries: [{ id: gone.id, at: NOW }] } });
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();
    await mount({ ...snapshot, quarantined: 2, setAside: { plans: [], entries: [{ id: 'gone', at: NOW }] } });
    expect(screen.getByText(LINE).textContent).toMatch(/exports leave them out\.$/);
    expect(screen.queryByText(BACK)).toBeNull();
  });
});

// ADR-0053 Readings, 2026-11-26: an import with no plan over entries kept in another currency asks first. The plan
// row set aside named EUR; the file's plan is in GBP. Nothing is converted either way.
describe('DataSection: the kept entries before an import in another currency', () => {
  const fixture = fixtureSnapshot();
  if (fixture.plan === null) throw new Error('the fixture has a plan');
  const plan = fixture.plan;
  const kept: Snapshot = {
    ...fixture,
    plan: null,
    quarantined: 1,
    setAside: { plans: [{ id: 'plan', at: NOW, currency: 'EUR' }], entries: [] },
  };
  const question = keptQuestion(kept, 'GBP');
  if (question === null) throw new Error('the fixture entries hold amounts in EUR');
  const gbp = JSON.stringify(exportBackup({ ...plan, payCurrency: 'GBP', displayCurrency: 'GBP' }, [], NOW));
  const live = (services: Mounted['services']) => services.domain.store.getState().snapshot;

  async function ask() {
    const mounted = await mount(kept);
    await choose(gbp);
    const opener = screen.getByRole('button', { name: 'Import this backup' });
    opener.focus();
    await act(async () => fireEvent.click(opener));
    return { ...mounted, opener, dialog: await screen.findByRole('dialog') };
  }

  it('asks before a GBP backup is imported over entries kept in EUR, with Do not import focused', async () => {
    const { dialog, services } = await ask();
    expect(within(dialog).getByRole('heading').textContent).toBe(`Show ${question.count} saved entries in GBP?`);
    expect(within(dialog).getByText(/^They were saved with a plan that could not be read/).textContent).toBe(
      "They were saved with a plan that could not be read. That plan was in EUR. This file's plan is in GBP. " +
        'A plan holds one currency, and nothing is converted. To keep them in EUR, import a backup in EUR or set up a plan.',
    );
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Do not import'));
    // The import relabels the kept entries: the destructive variant (docs/DESIGN.md §8).
    expect(within(dialog).getByRole('button', { name: 'Import in GBP' }).className.split(' ')).toContain(
      'text-negative',
    );
    expect(live(services).plan).toBeNull();
  });

  it('words the body for entries whose currency could not be read', async () => {
    await mount({ ...kept, setAside: { plans: [{ id: 'plan', at: NOW, currency: null }], entries: [] } });
    await choose(gbp);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import this backup' })));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/^The currency of the plan they were saved with/).textContent).toBe(
      "The currency of the plan they were saved with could not be read. This file's plan is in GBP. A plan holds " +
        'one currency, and nothing is converted. To choose their currency, set up a plan.',
    );
  });

  it('Do not import writes nothing, keeps the file chosen and gives the focus back to the button that asked', async () => {
    const { dialog, opener, services } = await ask();
    const before = live(services);
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Do not import' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(live(services)).toBe(before);
    expect(screen.getByRole('button', { name: 'Import this backup' })).toBe(opener);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('Import in GBP holds the dialog until the plan is written, then moves the focus to the result', async () => {
    const { dialog, services } = await ask();
    let open = (): void => undefined;
    const held = new Promise<void>((resolve) => (open = resolve));
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementation(async (change) => {
      await held;
      return write(change);
    });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Import in GBP' })));
    expect(screen.getByRole('dialog')).toBe(dialog);
    await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    await act(async () => open());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(`Plan imported. Entries now: ${liveEntries(kept.entries).length}.`);
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect(live(services).plan?.payCurrency).toBe('GBP');
    vi.restoreAllMocks();
  });

  it('refuses with changed when another tab stored a plan after the screen showed none, focusing the alert', async () => {
    const { dialog, services } = await ask();
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementationOnce(async (change) => {
      await write(() => ({ plan }));
      return write(change);
    });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Import in GBP' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'The plan or entries on this device changed in another browser tab, so nothing was imported. Choose the file again.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(live(services).plan?.payCurrency).toBe('EUR');
    vi.restoreAllMocks();
  });
});
