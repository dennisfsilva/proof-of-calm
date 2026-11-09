// @vitest-environment jsdom
import { type EntityId, exportBackup } from '@proofofcalm/core';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { choose, mount, NOW } from './data-section.testing';

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

describe('DataSection, an import with entries that do not read as entries', () => {
  const snapshot = fixtureSnapshot();
  if (snapshot.plan === null) throw new Error('the fixture has a plan');
  const plan = snapshot.plan;

  it.each([
    [['00000000-0000-4000-8000-000000000001'], '1 entry in this import cannot be stored'],
    [
      ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
      '2 entries in this import cannot be stored',
    ],
  ])('imports nothing, and the alert counts them and names the fix', async (ids, count) => {
    refused.ids = ids;
    const { services } = await mount(snapshot);
    const before = services.domain.store.getState().snapshot;
    await choose(JSON.stringify(exportBackup(plan, [], NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      `${count}, so nothing was imported. Export the file again, then import the new file.`,
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });
});
