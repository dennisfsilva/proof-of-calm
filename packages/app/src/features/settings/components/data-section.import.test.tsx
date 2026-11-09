// @vitest-environment jsdom
import { backupNeeded, type EntityId, type Entry, exportBackup, liveEntries, type Plan } from '@proofofcalm/core';
import { FIXTURE_RULES, type FixtureCountry } from '@proofofcalm/core/testing/country-change';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import twoCoins from '../../../../../core/test/golden/two-coins.json';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters/memory-store';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import errors from '../../../messages/en/errors.json';
import settings from '../../../messages/en/settings.json';
import { choose, type Mounted, mount, NOW, paste } from './data-section.testing';

// The profiles and the lazy namespaces load once, in memory, as in data-section.test.tsx: the country step of a
// file from the DCA plan page loads the profiles and onboarding's words with import(), each a round trip to the
// main process that under parallel load outlasted a findBy. Each factory loads its files while this file loads,
// outside any test's timeout (lib/services/testing-modules.ts).
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
// The counts of a result, stubbed onto the core's own result so a test needs no thousand entries; null passes
// the result through.
const counts = vi.hoisted(() => ({ value: null as null | Record<'added' | 'skipped' | 'deleted' | 'taken', number> }));
vi.mock('@proofofcalm/core', async (original) => {
  const core = await original<typeof import('@proofofcalm/core')>();
  const applyImport: typeof core.applyImport = (...args) => {
    const result = core.applyImport(...args);
    return counts.value === null || result.refused !== null ? result : { ...result, ...counts.value };
  };
  return { ...core, applyImport };
});

afterEach(() => {
  cleanup();
  counts.value = null;
});

describe('DataSection, an import that changes nothing', () => {
  // DOMAIN §3.11: the backup banner shows only when nothing was exported after the last change.
  it('Add missing entries only that adds nothing writes nothing, so the backup stays current', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot);
    const state = () => services.domain.store.getState().snapshot;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export JSON backup' })));
    expect(backupNeeded(state().entries, state().prefs, false)).toBe(false);

    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries, NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    expect(
      screen.getByText(`Entries added: 0. Already in this plan, not added: ${snapshot.entries.length}.`),
    ).toBeDefined();
    const after = state();
    expect(after.prefs.changedAt).toBe(snapshot.prefs.changedAt);
    expect(backupNeeded(after.entries, after.prefs, false)).toBe(false);
  });
});

describe('DataSection, the result of an import', () => {
  it('names the monthly buys not added because their month is recorded here, and moves focus to the result', async () => {
    const snapshot = fixtureSnapshot();
    const buy = snapshot.entries.find((entry) => entry.kind === 'dca' && entry.deletedAt === null);
    if (snapshot.plan === null || buy === undefined) throw new Error('the fixture has a plan and a monthly buy');
    await mount(snapshot);
    // The same month recorded on another device: a row of its own, under another id.
    const elsewhere = { ...buy, id: '00000000-0000-4000-8000-000000000300' as EntityId };
    await choose(JSON.stringify(exportBackup(snapshot.plan, [...snapshot.entries, elsewhere], NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(
      `Entries added: 0. Already in this plan, not added: ${snapshot.entries.length}. ` +
        'Month already recorded or skipped on this device, not added: 1.',
    );
    expect(document.activeElement).toBe(status);
  });

  it('moves focus to the result when the Replace everything dialog closes after the replace', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    await mount(snapshot);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Plan replaced. Entries now: 2.');
    await waitFor(() => expect(document.activeElement).toBe(status));
  });
});

describe('DataSection, one import at a time', () => {
  // DESIGN §6: a second press while an import writes does nothing, and the busy button keeps the focus.
  it('a double press of Add missing entries only starts one import, and the busy button stays focusable', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries, NOW)));
    const write = vi.spyOn(services.domain, 'write');
    const add = screen.getByRole('button', { name: 'Add missing entries only' });
    await act(async () => {
      fireEvent.click(add);
      await Promise.resolve();
      expect(add.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(add);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('a double press of the dialog’s Replace everything starts one import', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    const write = vi.spyOn(services.domain, 'write');
    const replace = within(dialog).getByRole('button', { name: 'Replace everything' });
    await act(async () => {
      fireEvent.click(replace);
      fireEvent.click(replace);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

/** A gate the test opens: `hold()` arms it, `release()` lets what waits on it go on. */
function gate() {
  let open = (): void => undefined;
  let held: Promise<void> | null = null;
  return {
    hold: () => {
      held = new Promise((resolve) => (open = resolve));
    },
    wait: () => held ?? Promise.resolve(),
    release: async () => {
      await act(async () => open());
    },
  };
}

describe('DataSection, the dialog while its replace writes (docs/DESIGN.md §6)', () => {
  const live = (services: Mounted['services']) => liveEntries(services.domain.store.getState().snapshot.entries).length;

  // Keep this plan, Escape and an outside press are refused until the replace is written, so it never runs unseen.
  async function replaceHeld(release: () => Promise<void>) {
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
    const keep = within(dialog).getByRole('button', { name: 'Keep this plan' });
    expect(keep.getAttribute('aria-disabled')).toBe('true');
    await act(async () => fireEvent.click(keep));
    await act(async () => fireEvent.keyDown(dialog, { key: 'Escape' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    await release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const status = screen.getByRole('status');
    await waitFor(() => expect(document.activeElement).toBe(status));
    return status;
  }

  it('a file from the DCA plan page: the dialog stays open until the plan is replaced', async () => {
    const rules = gate();
    const { services } = await mount(fixtureSnapshot(), undefined, {
      rules: async (code) => {
        await rules.wait();
        return FIXTURE_RULES[code as FixtureCountry] ?? null;
      },
    });
    await choose(JSON.stringify(twoCoins.state));
    rules.hold();
    const status = await replaceHeld(rules.release);
    expect(status.textContent).toBe(`Plan replaced. Entries now: ${twoCoins.state.purchases.length}.`);
    expect(live(services)).toBe(twoCoins.state.purchases.length);
  });

  it('a backup: the dialog stays open until the plan is replaced', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    const writes = gate();
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementation(async (change) => {
      await writes.wait();
      return write(change);
    });
    writes.hold();
    const status = await replaceHeld(writes.release);
    expect(status.textContent).toBe('Plan replaced. Entries now: 2.');
    expect(live(services)).toBe(2);
    vi.restoreAllMocks();
  });

  it('Choose a file is refused while an import writes, and a file chosen meanwhile is not taken', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot);
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries, NOW)));
    const writes = gate();
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementation(async (change) => {
      await writes.wait();
      return write(change);
    });
    writes.hold();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const input = screen.getByLabelText<HTMLInputElement>('Choose a file');
    const click = vi.spyOn(input, 'click');
    const chooseButton = screen.getByRole('button', { name: 'Choose a file' });
    expect(chooseButton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(chooseButton);
    expect(click).not.toHaveBeenCalled();
    const second = new File([JSON.stringify(twoCoins.state)], 'second.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [second] } });
    });
    expect(screen.queryByText(/second\.json/)).toBeNull();
    await writes.release();
    expect(screen.getByRole('status').textContent).toBe(
      `Entries added: 0. Already in this plan, not added: ${snapshot.entries.length}.`,
    );
    expect(screen.queryByText(/second\.json/)).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('DataSection, a file from the DCA plan page (docs/DOMAIN.md §7)', () => {
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  // A purchase without a coin is dropped and the tax note is not imported: two notes in the report.
  const adjusted = {
    ...twoCoins.state,
    settings: { ...twoCoins.state.settings, taxNote: 'Ask the accountant.' },
    purchases: [...twoCoins.state.purchases, { id: 'p9999', kind: 'extra', date: '2026-09-09', eur: 10, units: 1 }],
  };

  it('names the file and its purchases, and after Add missing entries only lists the notes on its purchases alone', async () => {
    await mount(fixtureSnapshot(), undefined, { rules });
    await choose(JSON.stringify(adjusted));
    expect(screen.getByText('backup.json, exported from the DCA plan page. Purchases in this file: 19.')).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const notes = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(notes.map((item) => item.textContent)).toEqual([
      '1 purchase was not imported: it was missing a coin, an amount, units or a date.',
    ]);
  });

  it('after Add missing entries only, names a coin this plan does not list and where to add it', async () => {
    await mount(fixtureSnapshot(), undefined, { rules });
    const xrp = { id: 'p9001', kind: 'extra', date: '2026-03-10', coin: 'XRP', eur: 50, units: 100 };
    await choose(JSON.stringify({ ...twoCoins.state, purchases: [...twoCoins.state.purchases, xrp] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const notes = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(notes.map((item) => item.textContent)).toEqual([
      "1 purchase of XRP was added. This plan does not list XRP, so Portfolio shows it after the plan's coins; " +
        'you can add it in Coins & split.',
    ]);
  });

  it('a replace by a file that lists no coins names the four starting coins it took', async () => {
    await mount(fixtureSnapshot(), undefined, { rules });
    const settingsOf = { ...twoCoins.state.settings, coins: [] };
    await choose(JSON.stringify({ ...twoCoins.state, settings: settingsOf }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
    const notes = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(notes.map((item) => item.textContent)).toContain(
      "The file listed no coins, so the plan has the DCA plan page's four starting coins: Bitcoin, Chainlink, " +
        'Ethereum, and Solana. You can change them in Coins & split.',
    );
  });

  it('asks before a replace in the words of this file, then words each note with the plan it took', async () => {
    await mount(fixtureSnapshot(), undefined, { rules });
    const changed = {
      ...twoCoins.state.settings,
      dcaDay: 31,
      lastBuy: '',
      expect: { ...twoCoins.state.settings.expect, bear: 'x' },
    };
    await choose(JSON.stringify({ ...twoCoins.state, settings: changed }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(settings.data.prototype.confirmBody)).toBeDefined();
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
    const notes = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(notes.map((item) => item.textContent)).toEqual([
      'The file had no last buy, so it is 1\u00a0Jun\u00a02028, as on the DCA plan page.',
      "The file's buy day was outside 1 to 28, so the buy day is now 28.",
      'The low multiple you set on the DCA plan page was not a number, so it was left out.',
    ]);
  });

  it('with no plan, asks for the country first, then imports the plan in it', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['pt-PT']);
    const { services } = await mount(EMPTY_SNAPSHOT, undefined, { rules });
    await choose(JSON.stringify(twoCoins.state));
    expect(await screen.findByRole('heading', { name: 'Where do you live?' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Import this backup' })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue with Portugal' })));
    expect(screen.getByRole('status').textContent).toBe('Plan imported. Entries now: 18.');
    expect(services.domain.store.getState().snapshot.plan?.country).toBe('PT');
    vi.restoreAllMocks();
  });

  it('with no plan, the focus moves to the country step’s first line once it loads (docs/DESIGN.md §6)', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['pt-PT']);
    await mount(EMPTY_SNAPSHOT, undefined, { rules });
    await choose(JSON.stringify(twoCoins.state));
    await screen.findByRole('heading', { name: 'Where do you live?' });
    const intro = screen.getByText(settings.data.prototype.country);
    await waitFor(() => expect(document.activeElement).toBe(intro));
    expect(intro.getAttribute('tabindex')).toBe('-1');
    vi.restoreAllMocks();
  });

  it('while the import writes, the country button stays focusable with aria-disabled and a second press does nothing', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['pt-PT']);
    const { services } = await mount(EMPTY_SNAPSHOT, undefined, { rules });
    await choose(JSON.stringify(twoCoins.state));
    const confirm = await screen.findByRole('button', { name: 'Continue with Portugal' });
    const write = vi.spyOn(services.domain, 'write');
    await act(async () => {
      fireEvent.click(confirm);
      await Promise.resolve();
      expect(confirm.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(confirm);
    });
    // One import: its read of the plan as stored, then its write.
    expect(write).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});

describe('DataSection, a pasted export (docs/DOMAIN.md §7)', () => {
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const box = () =>
    screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Paste a backup or an export from the DCA plan page' });
  afterEach(() => vi.restoreAllMocks());

  it('an export from the DCA plan page shows its line, imports like a file, and the box clears', async () => {
    await mount(fixtureSnapshot(), undefined, { rules });
    await paste(JSON.stringify(twoCoins.state));
    expect(screen.getByText('Pasted text, exported from the DCA plan page. Purchases in this text: 18.')).toBeDefined();
    expect(box().value).toBe('');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    expect(screen.getByRole('status').textContent).toMatch(/^Entries added: \d+\. Already in this plan/u);
  });

  // A long paste grows the box to its six lines and can push Read below the fold; after the paste's
  // frame, Read scrolls by the least that shows it, and the focus stays in the box.
  it('a paste scrolls Read into view after the frame, and the focus stays in the box', async () => {
    await mount(fixtureSnapshot());
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
    const scroll = vi.fn();
    const read = screen.getByRole('button', { name: 'Read the pasted text' });
    read.scrollIntoView = scroll;
    box().focus();
    fireEvent.paste(box());
    expect(scroll).not.toHaveBeenCalled();
    act(() => {
      for (const frame of frames) frame(0);
    });
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(box());
  });

  it('a pasted backup is read as a backup', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    await mount(snapshot);
    await paste(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW)));
    expect(screen.getByText(/^Pasted backup, exported on .+\. Entries in this backup: 2\.$/u)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add missing entries only' })).toBeDefined();
  });

  it('an unreadable paste is named as pasted text with a step for a paste; an unreadable file keeps its words', async () => {
    await mount(fixtureSnapshot());
    await paste('not an export');
    expect(screen.getByRole('alert').textContent).toBe(
      'This text is not in a format Proof of Calm can read. Copy the whole export again, then paste it.',
    );
    await choose('not an export');
    expect(screen.getByRole('alert').textContent).toBe(
      'This file is not in a format Proof of Calm can read. Export a backup from Proof of Calm, then import that file.',
    );
  });

  // docs/DESIGN.md §6: a read that ends in a problem moves the focus to the alert and scrolls it clear of the tab bar.
  it.each([
    ['paste', paste],
    ['file', choose],
  ] as const)('an unreadable %s moves the focus to the alert, scrolled into view', async (_, read) => {
    await mount(fixtureSnapshot());
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    await read('not an export');
    const alert = screen.getByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(scrolled.mock.contexts.at(-1)).toBe(alert);
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  it('with no plan, the focus moves to the country step’s first line, as for a file', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['pt-PT']);
    await mount(EMPTY_SNAPSHOT, undefined, { rules });
    await paste(JSON.stringify(twoCoins.state));
    await screen.findByRole('heading', { name: 'Where do you live?' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText(settings.data.prototype.country)));
  });

  it('the read button is inert while an import writes, and a text pasted meanwhile is not taken', async () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot, undefined, { rules });
    await choose(JSON.stringify(exportBackup(snapshot.plan, snapshot.entries, NOW)));
    const writes = gate();
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementation(async (change) => {
      await writes.wait();
      return write(change);
    });
    writes.hold();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    expect(screen.getByRole('button', { name: 'Read the pasted text' }).getAttribute('aria-disabled')).toBe('true');
    await paste(JSON.stringify(twoCoins.state));
    expect(screen.queryByText(/^Pasted text/u)).toBeNull();
    await writes.release();
    expect(screen.queryByText(/^Pasted text/u)).toBeNull();
  });
});

describe('DataSection, the focus after an import that ends in a problem (docs/DESIGN.md §6)', () => {
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const incomplete = { version: 4, settings: { monthly: 0, initial: 0 }, purchases: [] };
  type Case = { file: 'prototype' | 'backup'; problem: 'prototype-invalid' | 'unknown'; via: Via };
  type Via = 'Add missing entries only' | 'the dialog' | 'no plan';
  const vias: readonly Via[] = ['Add missing entries only', 'the dialog', 'no plan'];
  // Every problem run() can end in: an incomplete file from the DCA plan page, and a write that fails, for both kinds.
  const cases: Case[] = [
    ...vias.map((via) => ({ file: 'prototype', problem: 'prototype-invalid', via }) as const),
    ...vias.map((via) => ({ file: 'prototype', problem: 'unknown', via }) as const),
    ...vias.map((via) => ({ file: 'backup', problem: 'unknown', via }) as const),
  ];
  afterEach(() => vi.restoreAllMocks());

  async function press(via: Via, file: Case['file']) {
    if (via === 'Add missing entries only') {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: via })));
    } else if (via === 'the dialog') {
      fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
      const dialog = await screen.findByRole('dialog');
      await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    } else {
      const name = file === 'backup' ? 'Import this backup' : 'Continue with Portugal';
      const button = await screen.findByRole('button', { name });
      await act(async () => fireEvent.click(button));
    }
  }

  it.each(cases)('$file file, $problem, via $via: the focus is on the alert that words it', async (test) => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['pt-PT']);
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(test.via === 'no plan' ? EMPTY_SNAPSHOT : snapshot, undefined, { rules });
    const prototype = test.problem === 'prototype-invalid' ? incomplete : twoCoins.state;
    await choose(
      JSON.stringify(
        test.file === 'backup' ? exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW) : prototype,
      ),
    );
    if (test.problem === 'unknown') vi.spyOn(services.domain, 'write').mockRejectedValue(new Error('the disk is full'));
    await press(test.via, test.file);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(test.problem === 'unknown' ? errors.unknown : errors.backup['prototype-invalid']);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.getAttribute('tabindex')).toBe('-1');
  });

  // DOMAIN §3.13: Add missing takes nothing from a file whose amounts are in another currency (never converted).
  it.each(['backup', 'prototype'] as const)('a %s file in USD onto an EUR plan: the alert names both', async (file) => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot, undefined, { rules });
    const before = services.domain.store.getState().snapshot;
    const usd =
      file === 'backup'
        ? exportBackup({ ...snapshot.plan, payCurrency: 'USD' }, snapshot.entries.slice(0, 2), NOW)
        : { ...twoCoins.state, settings: { ...twoCoins.state.settings, base: 'USD' } };
    await choose(JSON.stringify(usd));
    await press('Add missing entries only', file);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      "The purchases in this file are in USD, and this plan's are in EUR, so nothing was added. Amounts are never " +
        "converted. If you want the file's plan and its currency in place of this one, choose the file again, then Replace everything.",
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });

  // DOMAIN §3.13: both modes are refused while rows from a newer version exist, in one line that names the fix.
  it.each(['backup', 'prototype'] as const)('the import alert names the fix: a %s file', async (file) => {
    const snapshot = { ...fixtureSnapshot(), newer: { plans: 0, entries: 2 } };
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    const { services } = await mount(snapshot, undefined, { rules });
    const before = services.domain.store.getState().snapshot;
    await choose(
      JSON.stringify(
        file === 'backup' ? exportBackup(snapshot.plan, snapshot.entries.slice(0, 2), NOW) : twoCoins.state,
      ),
    );
    await press('Add missing entries only', file);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'A newer version of Proof of Calm saved or deleted entries on this device, so nothing was imported. ' +
        'Reload the page, then import again.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(services.domain.store.getState().snapshot).toStrictEqual(before);
  });

  // A paste chose no file, and Read emptied the box: the refusal names the paste's own step.
  it.each(['backup', 'prototype'] as const)(
    'a pasted %s in USD onto an EUR plan: the alert says to paste again',
    async (file) => {
      const snapshot = fixtureSnapshot();
      if (snapshot.plan === null) throw new Error('the fixture has a plan');
      const { services } = await mount(snapshot, undefined, { rules });
      const before = services.domain.store.getState().snapshot;
      const usd =
        file === 'backup'
          ? exportBackup({ ...snapshot.plan, payCurrency: 'USD' }, snapshot.entries.slice(0, 2), NOW)
          : { ...twoCoins.state, settings: { ...twoCoins.state.settings, base: 'USD' } };
      await paste(JSON.stringify(usd));
      await press('Add missing entries only', file);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe(
        "The purchases in the pasted text are in USD, and this plan's are in EUR, so nothing was added. Amounts are " +
          'never converted. If you want the pasted plan and its currency in place of this one, paste the text again, then ' +
          'Replace everything.',
      );
      expect(alert.textContent).not.toContain('choose the file again');
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(services.domain.store.getState().snapshot).toStrictEqual(before);
    },
  );
});

// The counts of an import are figures in the country's number locale (docs/CONTENT-STYLE.md §4): a German plan
// writes `1.234`, as its other figures do.
describe('DataSection, the counts of an import in the country’s number locale', () => {
  const rules = async (code: string) => FIXTURE_RULES[code as FixtureCountry] ?? null;
  const snapshot = fixtureSnapshot();
  const plan = { ...(snapshot.plan as Plan), country: 'DE' as Plan['country'] };
  const german = { ...snapshot, plan };
  const extra = snapshot.entries.find((entry) => entry.kind === 'extra') as Entry;
  const id = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as EntityId;

  it('a backup of 1,234 entries: the file line and the replaced line group the count', async () => {
    const entries = Array.from({ length: 1234 }, (_, index) => ({ ...extra, id: id(index) }));
    await mount(german, undefined, { rules });
    await choose(JSON.stringify(exportBackup(plan, entries, NOW)));
    expect(screen.getByText(/Entries in this backup: 1\.234\.$/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Replace everything' })));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Plan replaced. Entries now: 1.234.'));
  });

  it('Add missing entries only of 1,234 each: every count of the result is grouped', async () => {
    counts.value = { added: 1234, skipped: 1234, deleted: 1234, taken: 1234 };
    await mount(german, undefined, { rules });
    await choose(JSON.stringify(exportBackup(plan, snapshot.entries, NOW)));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    expect(screen.getByRole('status').textContent).toBe(
      'Entries added: 1.234. Already in this plan, not added: 1.234. Deleted earlier on this device, not added: 1.234. ' +
        'Month already recorded or skipped on this device, not added: 1.234.',
    );
  });

  it('the replace dialog groups the count of this plan’s entries', async () => {
    const entries = Array.from({ length: 1234 }, (_, index) => ({ ...extra, id: id(index) }));
    await mount({ ...german, entries }, undefined, { rules });
    await choose(JSON.stringify(exportBackup(plan, [], NOW)));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Replace this plan and its 1.234 entries?')).toBeDefined();
  });

  it('a file from the DCA plan page of 1,234 purchases: its line groups the count', async () => {
    const purchase = twoCoins.state.purchases[0] as (typeof twoCoins.state.purchases)[number];
    const purchases = Array.from({ length: 1234 }, (_, index) => ({
      ...purchase,
      id: `p${index + 20000}`,
      kind: 'extra',
    }));
    await mount(german, undefined, { rules });
    await choose(JSON.stringify({ ...twoCoins.state, purchases }));
    expect(
      screen.getByText('backup.json, exported from the DCA plan page. Purchases in this file: 1.234.'),
    ).toBeDefined();
  });

  // Review finding (#227, fix round 1): the report's counts are figures too, so a note matches the file line.
  it('a file whose 1,234 purchases are rounded: the note groups the count as the file line does', async () => {
    const purchase = twoCoins.state.purchases[0] as (typeof twoCoins.state.purchases)[number];
    const purchases = Array.from({ length: 1234 }, (_, index) => ({
      ...purchase,
      id: `p${index + 20000}`,
      kind: 'extra',
      eur: 10.125,
    }));
    await mount(german, undefined, { rules });
    await choose(JSON.stringify({ ...twoCoins.state, purchases }));
    expect(screen.getByText(/Purchases in this file: 1\.234\.$/)).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add missing entries only' })));
    const notes = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(notes.map((item) => item.textContent)).toEqual([
      '1.234 purchases were rounded: amounts to the cent, units to 10 decimal places.',
    ]);
  });
});
