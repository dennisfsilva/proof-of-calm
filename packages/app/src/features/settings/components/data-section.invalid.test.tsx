// @vitest-environment jsdom
import { type EntityId, exportBackup } from '@proofofcalm/core';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { choose, mount, NOW, paste } from './data-section.testing';

// An import whose entries to store do not all read as entries writes nothing (docs/DOMAIN.md §3.13). No file
// readBackup accepts reaches it, so the action's answer is set here, as the core's applyImport gives it.

const refused = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('../actions', async (original) => {
  const actual = await original<typeof import('../actions')>();
  return {
    ...actual,
    dataActions: (...args: Parameters<typeof actual.dataActions>) => ({
      ...actual.dataActions(...args),
      importBackup: async () => ({
        kind: 'refused' as const,
        refusal: { code: 'invalid-entries' as const, ids: refused.ids as EntityId[] },
      }),
    }),
  };
});

afterEach(cleanup);

const one = ['00000000-0000-4000-8000-000000000001'];
const two = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const fix = 'Export a new backup from Proof of Calm on the device that made it, then';

describe('DataSection, an import with entries that do not read as entries', () => {
  const snapshot = fixtureSnapshot();
  if (snapshot.plan === null) throw new Error('the fixture has a plan');
  const plan = snapshot.plan;

  // A pasted backup's refusal names the paste, as its currency refusal does (docs/CONTENT-STYLE.md §3).
  it.each([
    ['a file', choose, one, '1 entry in this import', 'import the new file.'],
    ['a file', choose, two, '2 entries in this import', 'import the new file.'],
    ['a paste', paste, one, '1 entry in the pasted text', 'paste the new text.'],
    ['a paste', paste, two, '2 entries in the pasted text', 'paste the new text.'],
  ])('from %s, imports nothing, and the alert counts them and names the fix', async (_, read, ids, count, then) => {
    refused.ids = ids;
    const { services } = await mount(snapshot);
    const before = services.domain.store.getState().snapshot;
    await read(JSON.stringify(exportBackup(plan, [], NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(`${count} cannot be stored, so nothing was imported. ${fix} ${then}`);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });
});
