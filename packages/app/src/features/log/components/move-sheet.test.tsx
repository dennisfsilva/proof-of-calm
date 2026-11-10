// @vitest-environment jsdom
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { MoveSheet } from './move-sheet';

// The Log's move sheet (ADR-0054, docs/CONTENT-STYLE.md §3, Log coins you moved): its title for a new and an edited
// move, and the session draft (ADR-0020) that keeps what was typed across a close and a reopen until a save.

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const plan = aPlan();
const bought = anEntry({ kind: 'extra', date: date('2026-01-10'), slot: null, units: units('0.03'), venue: 'Kraken' });

function Host({ editing }: { readonly editing: Entry | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <MoveSheet open={open} onOpenChange={setOpen} editing={editing} onDone={() => setOpen(false)} />
    </>
  );
}

async function mount(entries: readonly Entry[], editing: Entry | null = null) {
  const snapshot = { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES };
  const services: Services = createTestServices({ snapshot });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <Host editing={editing} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return services;
}

const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const close = () => act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Close' })));
const reopen = () => act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Reopen' })));

describe('MoveSheet', () => {
  it('titles a new move and an edited one', async () => {
    await mount([bought]);
    expect(screen.getByRole('dialog', { name: 'Log coins you moved' })).toBeTruthy();
    cleanup();
    const move = aMove({ date: date('2026-02-20'), units: units('0.01') });
    await mount([bought, move], move);
    expect(screen.getByRole('dialog', { name: 'Edit the move' })).toBeTruthy();
    expect(field('Units sent').value).toBe('0.01');
  });

  it('keeps what was typed across a close and a reopen, and a save clears it', async () => {
    const services = await mount([bought]);
    type('Date', '2026-02-20');
    type('Venue the coins went to', 'Ledger');
    type('Units sent', '0.01');
    await close();
    expect(screen.queryByRole('dialog')).toBeNull();
    await reopen();
    expect(field('Date').value).toBe('2026-02-20');
    expect(field('Venue the coins went to').value).toBe('Ledger');
    expect(field('Units sent').value).toBe('0.01');
    expect(field('Units received').value).toBe('0.01');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    const stored = services.domain.store.getState().snapshot.entries;
    expect(stored.filter((entry) => entry.kind === 'move')).toHaveLength(1);
    await reopen();
    expect(field('Date').value).toBe('');
    expect(field('Units sent').value).toBe('');
  });
});
