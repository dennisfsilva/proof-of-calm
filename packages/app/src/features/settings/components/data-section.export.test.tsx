// @vitest-environment jsdom
import { exportBackup } from '@proofofcalm/core';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { recordingPlatform } from '../../../lib/services/testing';
import { choose, mount, NOW } from './data-section.testing';

afterEach(cleanup);

// An export the platform did not save (the port's contract: the native adapter answers false).
const NOT_SAVED = 'The file was not saved. Export again to keep a copy.';

describe('DataSection, an export that was not saved', () => {
  it('says so inside the replace dialog when the platform did not save the copy', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const platform = { ...recordingPlatform(), download: async () => false };
    await mount(snapshot, memoryPlanStore(snapshot), { platform });
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Export a copy first' })));
    expect(within(dialog).getByRole('alert').textContent).toBe(NOT_SAVED);
  });

  it('keeps saying so when the replace dialog opens after an export that was not saved', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const platform = { ...recordingPlatform(), download: async () => false };
    await mount(snapshot, memoryPlanStore(snapshot), { platform });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export JSON backup' })));
    expect(screen.getByRole('alert').textContent).toBe(NOT_SAVED);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toBe(NOT_SAVED);
  });

  it('says so when either export was not saved, and clears it when a later export is', async () => {
    let saved = false;
    const platform = { ...recordingPlatform(), download: async () => saved };
    for (const name of ['Export CSV log', 'Export JSON backup']) {
      cleanup();
      await mount(fixtureSnapshot(), undefined, { platform });
      await act(async () => fireEvent.click(screen.getByRole('button', { name })));
      expect(screen.getByRole('alert').textContent).toBe(NOT_SAVED);
    }
    saved = true;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export CSV log' })));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// docs/DOMAIN.md §3.13: an export holds what this build reads, and the section says what stayed out.
describe('DataSection, an export beside entries from a newer version', () => {
  it('the export line names the entries left out', async () => {
    await mount({ ...fixtureSnapshot(), newer: { plans: 0, entries: 2 } });
    expect(
      screen.getByText(
        'Exports leave out 2 entries saved by a newer version of Proof of Calm. Reload the page, then export to include them.',
      ),
    ).toBeTruthy();
  });

  it('counts one entry, or many as a grouped figure', async () => {
    await mount({ ...fixtureSnapshot(), newer: { plans: 0, entries: 1 } });
    expect(
      screen.getByText(
        'Exports leave out 1 entry saved by a newer version of Proof of Calm. Reload the page, then export to include it.',
      ),
    ).toBeTruthy();
    cleanup();
    await mount({ ...fixtureSnapshot(), newer: { plans: 0, entries: 1234 } });
    expect(screen.getByText(/^Exports leave out 1,234 entries saved by a newer version/)).toBeTruthy();
  });

  it('shows no such line without newer entries', async () => {
    await mount(fixtureSnapshot());
    expect(screen.queryByText(/^Exports leave out/)).toBeNull();
  });

  it('shows no such line beside newer tombstones alone: a tombstone holds nothing a person would lose', async () => {
    await mount({ ...fixtureSnapshot(), newerTombstones: 2 });
    expect(screen.queryByText(/^Exports leave out/)).toBeNull();
  });
});
