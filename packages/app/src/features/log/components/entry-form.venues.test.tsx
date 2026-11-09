// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, money, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntryForm } from './entry-form';

// The session-13a carry-over (#32): in Portugal (per venue) the Log groups the sales of a day into one row, so an edit
// can hold a BTC sale at Bitvavo and one at Ledger while the form shows one Venue field. The save keeps each sale's own
// entry and venue unless the person changes that field (DOMAIN §6, Edit a transaction): moving the Ledger sale to
// Bitvavo would change which lots it takes (§3.7). Each case asserts the entry each row's save takes (`rowEntries`) and
// the venue it stores. Since session 16 (#10) the field opens empty when the venues differ, and a line names them.

afterEach(cleanup);
// jsdom has no `scrollIntoView`: a save refused from a field scrolls its alert line into view.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const plan = aPlan();
const rules = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const bought = (quantity: string, venue: string | null) =>
  anEntry({ kind: 'extra', date: date('2025-01-10'), slot: null, units: units(quantity), venue });
const sold = (quantity: string, amount: string, venue: string | null, moment: string) =>
  anEntry({
    kind: 'sell',
    date: date('2026-04-01'),
    slot: null,
    units: units(quantity),
    amount: money(amount),
    venue,
    createdAt: instant(`2026-04-01T${moment}:00Z`),
  });

const VENUES =
  'Venues on these entries: Bitvavo and Ledger. Each keeps its own unless you type a venue for all of them.';
const lots = [bought('1', 'Bitvavo'), bought('1', 'Ledger'), bought('0.5', null)];

/** Opens the grouped sale for an edit, runs `change` on the form and saves; what the save gave, in its order. */
async function edit(editing: readonly Entry[], change: () => void, hint = VENUES) {
  const all = [...lots, ...editing];
  const services = createTestServices({
    snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: all, prices: TEST_PRICES },
    rules,
  });
  const onDone = vi.fn<(saved: readonly Entry[]) => void>();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <EntryForm kind="sell" editing={editing} onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  // One Venue field, empty, so it never reads as if every sale were at the first one's venue; the line names them.
  expect(screen.getByLabelText<HTMLInputElement>('Venue (optional)').value).toBe('');
  expect(screen.getByText(hint)).toBeTruthy();
  change();
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
  expect(onDone).toHaveBeenCalledTimes(1);
  const saved = onDone.mock.calls[0]?.[0] ?? [];
  // The store holds what the save gave.
  const stored = services.domain.store.getState().snapshot.entries;
  for (const entry of saved) expect(stored.find((each) => each.id === entry.id)).toEqual(entry);
  return saved.map(({ id, createdAt, units: quantity, venue, deletedAt }) => ({
    id,
    createdAt,
    units: quantity,
    venue,
    deleted: deletedAt !== null,
  }));
}

const fill = (label: string, at: number, value: string) =>
  fireEvent.change(screen.getAllByLabelText(label)[at]!, { target: { value } });
const clearRow = (at: number) => {
  fill('BTC sold (units)', at, '');
  fill('Received for BTC (EUR)', at, '');
};
const setVenue = (value: string) => fireEvent.change(screen.getByLabelText('Venue (optional)'), { target: { value } });
/** A kept row: the entry it takes, and the venue and units it stores. */
const kept = (entry: Entry, venue: string | null, quantity: string = entry.units) => ({
  id: entry.id,
  createdAt: entry.createdAt,
  units: quantity,
  venue,
  deleted: false,
});
/** An edited entry no row took: the save soft-deletes it, its venue as stored. */
const removed = (entry: Entry) => ({ ...kept(entry, entry.venue), deleted: true });

describe('in Portugal, a grouped edit of a BTC sale at Bitvavo and one at Ledger on 1 Apr 2026', () => {
  const onBitvavo = sold('1', '60000', 'Bitvavo', '09:00');
  const onLedger = sold('1', '60000', 'Ledger', '10:00');
  const editing = [onBitvavo, onLedger];

  it('saved unchanged, keeps each sale under its own entry and venue', async () => {
    expect(await edit(editing, () => undefined)).toEqual([kept(onBitvavo, 'Bitvavo'), kept(onLedger, 'Ledger')]);
  });

  it("with only row 2's units changed, keeps the Ledger sale at Ledger", async () => {
    const saved = await edit(editing, () => fill('BTC sold (units)', 1, '0.8'));
    expect(saved).toEqual([kept(onBitvavo, 'Bitvavo'), kept(onLedger, 'Ledger', '0.8')]);
  });

  it('with row 1 cleared, soft-deletes the Bitvavo sale and keeps the Ledger sale at Ledger', async () => {
    expect(await edit(editing, () => clearRow(0))).toEqual([kept(onLedger, 'Ledger'), removed(onBitvavo)]);
  });

  it('with the Venue field changed to Kraken, moves both sales to Kraken under their own entries', async () => {
    const saved = await edit(editing, () => setVenue('Kraken'));
    expect(saved).toEqual([kept(onBitvavo, 'Kraken'), kept(onLedger, 'Kraken')]);
  });

  it('with row 1 cleared and the Venue field changed to Kraken, moves the Ledger sale to Kraken', async () => {
    const saved = await edit(editing, () => {
      clearRow(0);
      setVenue('Kraken');
    });
    expect(saved).toEqual([kept(onLedger, 'Kraken'), removed(onBitvavo)]);
  });
});

describe('in Portugal, a grouped edit of BTC sales at Bitvavo, at Ledger and at no venue on 1 Apr 2026', () => {
  const onBitvavo = sold('1', '60000', 'Bitvavo', '09:00');
  const onLedger = sold('1', '60000', 'Ledger', '10:00');
  const nowhere = sold('0.5', '30000', null, '11:00');
  const editing = [onBitvavo, onLedger, nowhere];

  const hint =
    'Venues on these entries: Bitvavo and Ledger. 1 entry has none. Each keeps its own unless you type a venue for all of them.';

  it('saved unchanged, keeps each sale under its own entry and venue', async () => {
    const saved = await edit(editing, () => undefined, hint);
    expect(saved).toEqual([kept(onBitvavo, 'Bitvavo'), kept(onLedger, 'Ledger'), kept(nowhere, null)]);
  });

  it('with the middle row cleared, soft-deletes the Ledger sale and keeps the others where they were', async () => {
    const saved = await edit(editing, () => clearRow(1), hint);
    expect(saved).toEqual([kept(onBitvavo, 'Bitvavo'), kept(nowhere, null), removed(onLedger)]);
  });

  it('with row 1 cleared, soft-deletes the Bitvavo sale and keeps Ledger and no venue', async () => {
    const saved = await edit(editing, () => clearRow(0), hint);
    expect(saved).toEqual([kept(onLedger, 'Ledger'), kept(nowhere, null), removed(onBitvavo)]);
  });

  it('with the middle row cleared and the Venue field changed to Kraken, moves the two kept sales to Kraken', async () => {
    const saved = await edit(
      editing,
      () => {
        clearRow(1);
        setVenue('Kraken');
      },
      hint,
    );
    expect(saved).toEqual([kept(onBitvavo, 'Kraken'), kept(nowhere, 'Kraken'), removed(onLedger)]);
  });
});

describe('in Portugal, a grouped edit of two BTC sales at Bitvavo and one at Ledger on 1 Apr 2026', () => {
  const first = sold('0.5', '30000', 'Bitvavo', '09:00');
  const onLedger = sold('1', '60000', 'Ledger', '10:00');
  const second = sold('0.5', '30000', 'Bitvavo', '11:00');
  const editing = [first, onLedger, second];

  it('saved unchanged, keeps each sale under its own entry and venue', async () => {
    const saved = await edit(editing, () => undefined);
    expect(saved).toEqual([kept(first, 'Bitvavo'), kept(onLedger, 'Ledger'), kept(second, 'Bitvavo')]);
  });

  it('with the Ledger row cleared, soft-deletes the Ledger sale and keeps both Bitvavo sales at Bitvavo', async () => {
    const saved = await edit(editing, () => clearRow(1));
    expect(saved).toEqual([kept(first, 'Bitvavo'), kept(second, 'Bitvavo'), removed(onLedger)]);
  });

  it('with the first row cleared, soft-deletes the first Bitvavo sale and keeps Ledger and the second', async () => {
    const saved = await edit(editing, () => clearRow(0));
    expect(saved).toEqual([kept(onLedger, 'Ledger'), kept(second, 'Bitvavo'), removed(first)]);
  });

  it('with the last row cleared and Kraken typed as the venue, moves the two kept sales to Kraken', async () => {
    const saved = await edit(editing, () => {
      clearRow(2);
      setVenue('Kraken');
    });
    expect(saved).toEqual([kept(first, 'Kraken'), kept(onLedger, 'Kraken'), removed(second)]);
  });
});
