// @vitest-environment jsdom
import { type Entry, exportBackup, IMPORT_MAX_BYTES } from '@proofofcalm/core';
import { FIXTURE_RULES, type FixtureCountry } from '@proofofcalm/core/testing/country-change';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import twoCoins from '../../../../../core/test/golden/two-coins.json';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { choose, mount, NOW } from './data-section.testing';

// The import's limits: a plan holds at most 10,000 live entries (docs/DOMAIN.md §3.13 and §9), and an import that
// would leave more writes nothing and names the fix.

vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);

const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;

describe('DataSection, an import past the entry cap', () => {
  const snapshot = fixtureSnapshot();
  const [base] = snapshot.entries;
  if (snapshot.plan === null || base === undefined) throw new Error('the fixture has a plan and entries');
  const plan = snapshot.plan;
  const extras = (count: number, from: number): Entry[] =>
    Array.from({ length: count }, (_, index) => ({
      ...base,
      id: `10000000-0000-4000-8000-${String(from + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      deletedAt: null,
    }));

  /**
   * Add missing entries only from a backup that would leave 12,000 live entries; with a `country`, in a plan of
   * that country with its rules loaded, so its figures are in its locale (with none, in the UI language's).
   */
  const overCap = async (country?: FixtureCountry) => {
    const here = snapshot.entries.filter((entry) => entry.deletedAt === null).length;
    const entries = [...snapshot.entries, ...extras(6_000 - here, 0)];
    const { services } = await (country === undefined
      ? mount({ ...snapshot, entries })
      : mount({ ...snapshot, plan: { ...plan, country: country as typeof plan.country }, entries }, undefined, {
          rules,
        }));
    const before = services.domain.store.getState().snapshot;
    await choose(JSON.stringify(exportBackup(plan, extras(6_000, 100_000), NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    return { services, before, alert: screen.getByRole('alert') };
  };

  it('Add missing that would leave more than 10,000 entries adds nothing, and the alert says what to do', async () => {
    const { services, before, alert } = await overCap();
    expect(alert.textContent).toBe(
      'Adding these entries would leave 12,000 entries in this plan, more than the 10,000 a plan holds, so nothing ' +
        "was added. Delete entries in the Log, then import again. To keep only the file's entries, import again " +
        'with Replace everything.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });

  // docs/CONTENT-STYLE.md §4: the counts are grouped by the plan's country's locale, never hand-built.
  it.each([
    ['DE', '12.000', '10.000'],
    ['PT', '12\u00a0000', '10\u00a0000'],
  ] as const)('in a plan of %s the counts are grouped as its locale groups them', async (country, entries, max) => {
    const { alert } = await overCap(country);
    expect(alert.textContent).toContain(`would leave ${entries} `);
    expect(alert.textContent).toContain(`more than the ${max} a plan holds`);
  });

  it('a DCA plan page file of more purchases than a plan holds imports nothing, and the alert says where to fix it', async () => {
    const { services } = await mount(snapshot, undefined, { rules });
    const before = services.domain.store.getState().snapshot;
    const [purchase] = twoCoins.state.purchases;
    await choose(JSON.stringify({ ...twoCoins.state, purchases: Array.from({ length: 10_001 }, () => purchase) }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    expect(screen.getByRole('alert').textContent).toBe(
      'This export from the DCA plan page holds 10\u00a0001 purchases, more than the 10\u00a0000 entries a plan holds, so ' +
        'nothing was imported. Delete purchases there, export again, then import the new file.',
    );
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });
});

// docs/SECURITY.md §2, "Malicious import file": Settings reads no file over IMPORT_MAX_BYTES (docs/DOMAIN.md §9).
describe('DataSection, a file over the byte cap', () => {
  /** A file that says it weighs `size` bytes, with its reading watched. */
  const weighing = (size: number) => {
    const file = new File([JSON.stringify(exportBackup(plan(), [], NOW))], 'backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: size });
    return { file, text: vi.spyOn(file, 'text') };
  };
  const plan = () => {
    const { plan } = fixtureSnapshot();
    if (plan === null) throw new Error('the fixture has a plan');
    return plan;
  };
  const pick = async (file: File) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Choose a file'), { target: { files: [file] } });
    });
  };

  it('is refused without being read, and the alert takes the focus and names the fix', async () => {
    await mount(fixtureSnapshot());
    const { file, text } = weighing(IMPORT_MAX_BYTES + 1);
    await pick(file);
    expect(text).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      "This file is larger than 50\u00a0MB, so it was not read. For an exchange's export, export a shorter period " +
        'there, then import that file.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.queryByRole('button', { name: 'Add missing entries only' })).toBeNull();
  });

  it('a file of exactly the cap is read as any other', async () => {
    await mount(fixtureSnapshot());
    const { file, text } = weighing(IMPORT_MAX_BYTES);
    await pick(file);
    expect(text).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add missing entries only' })).toBeDefined();
  });
});
