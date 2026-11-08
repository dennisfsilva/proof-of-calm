// @vitest-environment jsdom
import { type Entry, type EntryKind, heldUnits, isPositive } from '@proofofcalm/core';
import { anEntry, BTC, date } from '@proofofcalm/core/testing';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntrySheet } from './entry-sheet';

// The entry sheet's "Skip <month>" (session 12's carry-over, #114) on the fixture plan on 20 October 2026, whose
// October buy is late: the sheet swaps for the skip sheet, which takes the focus, and the toast's Undo hands it to
// the host's target rather than leaving it on the vanished toast. A new transaction offers the choice of kinds
// (docs/CONTENT-STYLE.md §3, Record on the Log) where the Log's "Record a purchase" opts in, never from Today's
// sheet: the kind it opened on, chosen, then "Extra buy", then "Sale" while coins are held. The choice remounts the
// form with the kind, each kind keeps its own session draft, and each opening starts on the kind it opened on.

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type HostProps = { onUndone(): void; kind?: EntryKind; editing?: readonly Entry[]; offerKinds?: boolean };

function Host({ onUndone, kind = 'dca', editing = [], offerKinds = true }: HostProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Record a purchase
      </button>
      <EntrySheet
        kind={kind}
        editing={editing}
        offerKinds={offerKinds}
        open={open}
        onOpenChange={setOpen}
        onDone={() => undefined}
        onUndone={onUndone}
      />
    </>
  );
}

type MountOptions = { kind?: EntryKind; editing?: readonly Entry[]; held?: boolean; offerKinds?: boolean };

async function mount(onUndone: () => void = () => undefined, options: MountOptions = {}) {
  const snapshot = fixtureSnapshot();
  const entries = options.held === false ? [] : snapshot.entries;
  const services: Services = createTestServices({ snapshot: { ...snapshot, entries }, nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <Toaster closeLabel="Close" toastManager={services.toasts}>
          <Host
            onUndone={onUndone}
            kind={options.kind ?? 'dca'}
            editing={options.editing ?? []}
            offerKinds={options.offerKinds ?? true}
          />
        </Toaster>
      </I18nProvider>
    </ServicesProvider>,
  );
  return services;
}

/** The options of the choice of kinds in order, the pressed one marked; null when no choice shows. */
function kinds() {
  const group = screen.queryByRole('group', { name: 'Type of transaction' });
  if (group === null) return null;
  return within(group)
    .getAllByRole('button')
    .map((option) => `${option.textContent}${option.getAttribute('aria-pressed') === 'true' ? ' (pressed)' : ''}`);
}

describe('EntrySheet', () => {
  it("swaps for the skip sheet, whose Undo moves the focus to the host's target", async () => {
    const onUndone = vi.fn(() => screen.getByRole('button', { name: 'Record a purchase' }).focus());
    const services = await mount(onUndone);
    fireEvent.click(screen.getByRole('button', { name: 'Skip October 2026' }));
    const sheet = await screen.findByRole('dialog', { name: 'Skip October 2026' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log the monthly buy' })).toBeNull());
    await vi.waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Skip October 2026' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(onUndone).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Record a purchase' }));
    expect(services.domain.store.getState().snapshot.plan?.skips.map((skip) => skip.slot)).toEqual(['2026-07']);
  });

  it('opens a monthly buy on Monthly buy, then offers Extra buy and Sale while coins are held', async () => {
    await mount();
    expect(screen.getByRole('dialog', { name: 'Log the monthly buy' })).toBeTruthy();
    expect(kinds()).toEqual(['Monthly buy (pressed)', 'Extra buy', 'Sale']);
  });

  it('offers no Sale while nothing is held', async () => {
    await mount(undefined, { held: false });
    expect(screen.getByRole('dialog', { name: 'Log the monthly buy' })).toBeTruthy();
    expect(kinds()).toEqual(['Monthly buy (pressed)', 'Extra buy']);
  });

  it('opens the starting amount on Starting amount, then Extra buy and Sale', async () => {
    await mount(undefined, { kind: 'lump' });
    expect(screen.getByRole('dialog', { name: 'Log the starting amount' })).toBeTruthy();
    expect(kinds()).toEqual(['Starting amount (pressed)', 'Extra buy', 'Sale']);
  });

  it('opens an extra buy on Extra buy, then Sale while coins are held', async () => {
    await mount(undefined, { kind: 'extra' });
    expect(screen.getByRole('dialog', { name: 'Log an extra buy' })).toBeTruthy();
    expect(kinds()).toEqual(['Extra buy (pressed)', 'Sale']);
  });

  it('shows no choice when only one kind is left to offer, for a sale, or for an edit', async () => {
    await mount(undefined, { kind: 'extra', held: false });
    expect(screen.getByRole('dialog', { name: 'Log an extra buy' })).toBeTruthy();
    expect(kinds()).toBeNull();
    cleanup();
    await mount(undefined, { kind: 'sell' });
    expect(screen.getByRole('dialog', { name: 'Log a sale' })).toBeTruthy();
    expect(kinds()).toBeNull();
    cleanup();
    const [entry] = fixtureSnapshot().entries.filter((each) => each.kind === 'sell');
    await mount(undefined, { editing: entry === undefined ? [] : [entry] });
    expect(screen.getByRole('dialog', { name: 'Edit the entry' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('ETH sold (units)').value).toBe('0.06');
    expect(kinds()).toBeNull();
  });

  // Today's "Bought a different amount" opens this sheet with its own target and no opt-in: a buy button records a buy.
  it('offers no choice of kinds to a host that does not opt in, while coins are held', async () => {
    await mount(undefined, { offerKinds: false });
    expect(screen.getByRole('dialog', { name: 'Log the monthly buy' })).toBeTruthy();
    expect(kinds()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Extra buy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sale' })).toBeNull();
  });

  it('switches the title and the fields with the kind, and keeps what was typed for each kind', async () => {
    await mount();
    const value = (label: string) => screen.getByLabelText<HTMLInputElement>(label).value;
    fireEvent.change(screen.getByLabelText('BTC paid (EUR)'), { target: { value: '12.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extra buy' }));
    expect(await screen.findByRole('dialog', { name: 'Log an extra buy' })).toBeTruthy();
    expect(kinds()).toEqual(['Monthly buy', 'Extra buy (pressed)', 'Sale']);
    expect(value('BTC paid (EUR)')).toBe('');
    expect(screen.queryByRole('button', { name: 'Skip October 2026' })).toBeNull();
    fireEvent.change(screen.getByLabelText('BTC paid (EUR)'), { target: { value: '30.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }));
    expect(await screen.findByRole('dialog', { name: 'Log a sale' })).toBeTruthy();
    expect(screen.queryByLabelText('BTC paid (EUR)')).toBeNull();
    fireEvent.change(screen.getByLabelText('BTC sold (units)'), { target: { value: '0.001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Monthly buy' }));
    expect(await screen.findByRole('dialog', { name: 'Log the monthly buy' })).toBeTruthy();
    expect(value('BTC paid (EUR)')).toBe('12.00');
    expect(screen.getByRole('button', { name: 'Skip October 2026' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Extra buy' }));
    expect(value('BTC paid (EUR)')).toBe('30.00');
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }));
    expect(value('BTC sold (units)')).toBe('0.001');
  });

  it('starts each opening on the kind it opened on, and keeps what was typed in another kind', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Extra buy' }));
    fireEvent.change(await screen.findByLabelText('BTC paid (EUR)'), { target: { value: '30.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase' }));
    expect(await screen.findByRole('dialog', { name: 'Log the monthly buy' })).toBeTruthy();
    expect(kinds()).toEqual(['Monthly buy (pressed)', 'Extra buy', 'Sale']);
    fireEvent.click(screen.getByRole('button', { name: 'Extra buy' }));
    expect(await screen.findByRole('dialog', { name: 'Log an extra buy' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('BTC paid (EUR)').value).toBe('30.00');
  });

  // #136: the kind is chosen once per opening, so a sale being typed is never swapped for the buy form.
  // The evaluator's case (session 21): moving the April lump after the September ETH sale it covers is refused, and
  // the focus stays on Save while the alert line announces itself (docs/DESIGN.md §6), never on the body.
  it('keeps the focus on Save when the save is refused', async () => {
    const lump = fixtureSnapshot().entries.filter((entry) => entry.kind === 'lump');
    await mount(undefined, { editing: lump });
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-10-01' } });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    await act(async () => void fireEvent.click(save));
    expect((await screen.findByRole('alert')).textContent).toMatch(/later ETH sale/);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
  });

  it('a sale form stays a sale when the holdings drop to zero while open', async () => {
    const services = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }));
    fireEvent.change(await screen.findByLabelText('BTC sold (units)'), { target: { value: '0.001' } });
    // Another browser tab sells everything held.
    await act(() =>
      services.domain.write(({ entries }) => ({
        entries: [...new Set(entries.map((entry) => entry.coin))].flatMap((coin) => {
          const held = heldUnits(entries, coin);
          return isPositive(held)
            ? [anEntry({ kind: 'sell', slot: null, coin, units: held, date: date('2026-10-20') })]
            : [];
        }),
      })),
    );
    expect(isPositive(heldUnits(services.domain.store.getState().snapshot.entries, BTC.id))).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Log a sale' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('BTC sold (units)').value).toBe('0.001');
  });
});
