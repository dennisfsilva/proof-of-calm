// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, ETH, instant, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { MoveForm } from './move-form';

// The move form (ADR-0054, research move-step Q2, Q3, Q9, Q11) over the test services: 0.03 BTC bought at Kraken on
// 10 Jan 2026 and 0.02 BTC with no venue on 10 Feb 2026, so one group holds BTC on 20 Jan and two on 20 Feb.

afterEach(cleanup);

const plan = aPlan();
const bought = (quantity: string, on: string, venue: string | null) =>
  anEntry({ kind: 'extra', date: date(on), slot: null, units: units(quantity), venue });
const lots = [bought('0.03', '2026-01-10', 'Kraken'), bought('0.02', '2026-02-10', null)];
const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

type Options = { readonly editing?: Entry | null; readonly perVenue?: boolean };

async function open(entries: readonly Entry[], { editing = null, perVenue = false }: Options = {}) {
  const snapshot = { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES };
  // Kept, so a test can write as another tab does: to storage alone, this tab's snapshot left as it was.
  const planStore = memoryPlanStore(snapshot);
  const services = createTestServices({ snapshot, planStore, ...(perVenue ? { rules: portugal } : {}) });
  const onDone = vi.fn<(saved: readonly Entry[]) => void>();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <MoveForm editing={editing} onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { services, onDone, planStore };
}

const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const radio = (name: string) => screen.getByRole('radio', { name });
const checked = () => screen.queryAllByRole('radio').filter((each) => each.getAttribute('aria-checked') === 'true');
const save = () => act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));

/** Fills a move from Kraken to Ledger on 20 Feb 2026 that sends `sent`. */
function fill(sent: string, to = 'Ledger') {
  type('Date', '2026-02-20');
  fireEvent.click(radio('Kraken'));
  type('Venue the coins went to', to);
  type('Units sent', sent);
}

describe('MoveForm', () => {
  it('the date opens blank', async () => {
    await open(lots);
    expect(field('Date').value).toBe('');
    expect(screen.getByText('The day the coins left, as the withdrawal record shows it.')).toBeTruthy();
    // With one coin the Log has held there is no coin to choose, and with no date no venue to choose from.
    expect(screen.queryByText('Coin')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('the source is preselected only with one group', async () => {
    await open(lots);
    type('Date', '2026-01-20');
    expect(checked().map((each) => each.textContent)).toEqual([expect.stringContaining('Kraken')]);
    cleanup();
    await open(lots);
    type('Date', '2026-02-20');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(radio('With no venue').textContent).toContain('0.02 BTC');
    expect(checked()).toHaveLength(0);
  });

  it('received follows sent until typed', async () => {
    await open(lots);
    type('Units sent', '0.01');
    expect(field('Units received').value).toBe('0.01');
    type('Units received', '0.0098');
    type('Units sent', '0.02');
    expect(field('Units received').value).toBe('0.0098');
    expect(document.body.textContent).toContain('Network fee 0.0102 BTC');
  });

  it("All fills in the source's units on the date", async () => {
    // A sale at Kraken on the move's date comes after the move in the matching order, so all 0.03 BTC are there.
    const sold = anEntry({ kind: 'sell', slot: null, date: date('2026-02-20'), units: units('0.01'), venue: 'Kraken' });
    await open([...lots, sold]);
    type('Date', '2026-02-20');
    expect(radio('Kraken').textContent).toContain('0.03 BTC');
    fireEvent.click(radio('Kraken'));
    fireEvent.click(screen.getByRole('button', { name: 'Fill in all units' }));
    expect(field('Units sent').value).toBe('0.03');
    expect(field('Units received').value).toBe('0.03');
  });

  it('the short-source line only per venue', async () => {
    // Portugal matches lots per venue, and writes its figures with a decimal comma.
    await open(lots, { perVenue: true });
    fill('0,04');
    const line = [
      'The Log shows 0,03 BTC at Kraken on 20 Feb 2026.',
      'The Log looks for the other 0,01 BTC in the units you held outside Ledger on that day.',
    ];
    expect(screen.getByRole('status').textContent).toBe(line.join(' '));
    cleanup();
    await open(lots);
    fill('0.04');
    expect(screen.queryByText(/The Log shows/)).toBeNull();
  });

  it('the later-move line names a stored move the draft leaves short', async () => {
    // The draft takes all 0.05 BTC outside Ledger before a stored move of 0.03 from Kraken (DOMAIN §3.7).
    const march = aMove({ date: date('2026-03-10'), units: units('0.03'), received: units('0.03') });
    const { onDone } = await open([...lots, march], { perVenue: true });
    fill('0,05');
    expect(screen.getAllByRole('status').map((each) => each.textContent)).toEqual([
      'The Log shows 0,03 BTC at Kraken on 20 Feb 2026. The Log looks for the other 0,02 BTC in the units you held outside Ledger on that day.',
      'After this move, your move to Ledger on 10 Mar 2026 sends 0,03 BTC more than the Log shows outside Ledger that day. If both record one withdrawal, keep only one. If not, check the units that move sends.',
    ]);
    // The line never blocks the save; under global lots a move with no fee is not named.
    await save();
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
    await open([...lots, march]);
    fill('0.05');
    expect(screen.queryByText(/^After this move/u)).toBeNull();
  });

  it('the short-source line says how much the Log finds outside the destination when that is less than sent', async () => {
    // 0.05 BTC outside Ledger on 20 Feb 2026 and 0.01 at Ledger: a move of 0.06 finds only 0.05 outside.
    const withLedger = [...lots, bought('0.01', '2026-02-01', 'Ledger')];
    await open(withLedger, { perVenue: true });
    fill('0,06');
    expect(screen.getByRole('status').textContent).toBe(
      'The Log shows 0,03 BTC at Kraken on 20 Feb 2026. Outside Ledger, the Log finds only 0,05 BTC on that day.',
    );
    // Under global lots the fee is covered outside Ledger: no line.
    cleanup();
    await open(withLedger);
    fill('0.06');
    expect(screen.queryByText(/The Log shows/u)).toBeNull();
  });

  it('the duplicate line', async () => {
    const earlier = aMove({ date: date('2026-02-20'), venue: 'Kraken', to: 'Ledger', units: units('0.01') });
    const { onDone } = await open([...lots, { ...earlier, received: units('0.01') }]);
    fill('0.01');
    const line = 'The Log already has this move on 20 Feb 2026. Save it only if you moved these coins twice.';
    expect(screen.getByRole('status').textContent).toBe(line);
    // The line never blocks the save.
    await save();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a refusal focuses the field it names', async () => {
    const { onDone } = await open(lots);
    fill('0.01', 'Kraken');
    await save();
    expect(onDone).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field('Venue the coins went to'));
    expect(screen.getByText('Choose a venue other than the one the coins left.')).toBeTruthy();
    type('Venue the coins went to', 'Ledger');
    type('Units sent', '0');
    await save();
    expect(document.activeElement).toBe(field('Units sent'));
    expect(screen.getByText('Enter more than 0 units sent.')).toBeTruthy();
  });

  it('a refusal at a choice focuses its first card', async () => {
    await open(lots);
    type('Date', '2026-02-20');
    type('Venue the coins went to', 'Ledger');
    type('Units sent', '0.01');
    await save();
    expect(screen.getByText('Choose the venue the coins left.')).toBeTruthy();
    expect(document.activeElement).toBe(radio('Kraken'));
    cleanup();
    // With two coins held, neither is chosen for the person.
    const ether = anEntry({ kind: 'extra', coin: ETH.id, date: date('2026-01-10'), slot: null, venue: null });
    await open([...lots, ether]);
    await save();
    expect(screen.getByText('Choose the coin you moved.')).toBeTruthy();
    expect(document.activeElement).toBe(radio('BTC'));
  });

  it('a move dated before any venue holds the coin is refused at the units sent', async () => {
    const { onDone, services } = await open(lots);
    type('Date', '2026-01-05');
    type('Venue the coins went to', 'Ledger');
    type('Units sent', '0.01');
    await save();
    expect(onDone).not.toHaveBeenCalled();
    const refusal = [
      'This move sends 0.01 BTC, more than you hold (0 BTC on 5 Jan 2026).',
      'Check the units and the date, or log the missing purchases first.',
    ];
    expect(screen.getByText(refusal.join(' '))).toBeTruthy();
    expect(document.activeElement).toBe(field('Units sent'));
    expect(services.domain.store.getState().snapshot.entries).toEqual(lots);
  });

  it("a move dated before any venue holds the coin takes the save's refusal, in the save's order", async () => {
    // With no source to choose, the save judges the move as from no venue: it holds nothing there, so it never saves.
    const { onDone, services } = await open(lots);
    type('Date', '2026-01-05');
    type('Venue the coins went to', 'Ledger');
    type('Units sent', '0.01');
    type('Units received', '0.02');
    await save();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Enter no more units received than units sent.')).toBeTruthy();
    expect(document.activeElement).toBe(field('Units received'));
    expect(screen.queryByText(/more than you hold/)).toBeNull();
    expect(services.domain.store.getState().snapshot.entries).toEqual(lots);
  });

  describe('a source is decided on the entries as stored when the save runs', () => {
    // Another tab's write (entries replace by id or join), queued before the save, lands after the form rendered.
    type Services = Awaited<ReturnType<typeof open>>['services'];
    const saveAfter = (services: Services, changed: readonly Entry[]) =>
      act(async () => {
        void services.domain.write(() => ({ entries: changed }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });
    const stored = (services: Services) => services.domain.store.getState().snapshot.entries;
    const moves = (services: Services) => stored(services).filter((entry) => entry.kind === 'move');
    const deleted = lots.map((entry) => ({ ...entry, deletedAt: instant('2026-03-02T09:00:00.000Z') }));
    /** A move on `on` to Ledger sending 0.01 BTC, its source left to the form. */
    const unchosen = (on: string) => {
      type('Date', on);
      type('Venue the coins went to', 'Ledger');
      type('Units sent', '0.01');
    };

    it('re-offers the sources a write added, choosing none, and saves nothing', async () => {
      const { onDone, services } = await open(lots);
      unchosen('2026-01-05');
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      const other = bought('0.03', '2026-01-01', 'Kraken');
      await saveAfter(services, [other]);
      expect(onDone).not.toHaveBeenCalled();
      expect(stored(services)).toEqual(expect.arrayContaining([other, ...lots]));
      expect(moves(services)).toEqual([]);
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(radio('Kraken').textContent).toContain('0.03 BTC');
      expect(checked()).toHaveLength(0);
      expect(screen.getByText('Choose the venue the coins left.')).toBeTruthy();
      expect(document.activeElement).toBe(radio('Kraken'));
    });

    it("re-offers the sources another tab stored before this tab reloads, focusing the group's first card", async () => {
      const { onDone, planStore } = await open(lots);
      unchosen('2026-01-05');
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      // Stored by another tab; the reload its channel message asks for has not run here.
      await act(() => planStore.write({ entries: [bought('0.03', '2026-01-01', 'Kraken')] }));
      await save();
      expect(onDone).not.toHaveBeenCalled();
      expect(planStore.current().entries.filter((entry) => entry.kind === 'move')).toEqual([]);
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(radio('Kraken').textContent).toContain('0.03 BTC');
      expect(checked()).toHaveLength(0);
      expect(screen.getByText('Choose the venue the coins left.')).toBeTruthy();
      expect(document.activeElement).toBe(radio('Kraken'));
    });

    it('focuses the first card of a group that renders only after the refusal', async () => {
      const { services, planStore } = await open(lots);
      unchosen('2026-01-05');
      await act(() => planStore.write({ entries: [bought('0.03', '2026-01-01', 'Kraken')] }));
      // The form's reload held back, so the group renders on a later render than the refusal: the focus waits for it.
      const reload = services.domain.hydrate;
      vi.spyOn(services.domain, 'hydrate').mockResolvedValueOnce(undefined);
      await save();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      await act(() => reload());
      expect(screen.getByText('Choose the venue the coins left.')).toBeTruthy();
      expect(document.activeElement).toBe(radio('Kraken'));
    });

    it('re-offers every source another tab stored beside those on offer, focusing the first card', async () => {
      const { onDone, planStore } = await open(lots);
      unchosen('2026-02-20');
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      await act(() => planStore.write({ entries: [bought('0.01', '2026-02-01', 'Bitstamp')] }));
      await save();
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(radio('Bitstamp').textContent).toContain('0.01 BTC');
      expect(checked()).toHaveLength(0);
      expect(screen.getByText('Choose the venue the coins left.')).toBeTruthy();
      expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]);
    });

    it('with none to offer before or after the write, takes the save refusal from no venue', async () => {
      const { onDone, services } = await open(lots);
      unchosen('2026-01-05');
      const other = bought('0.01', '2026-03-01', 'Bitstamp');
      await saveAfter(services, [other]);
      expect(onDone).not.toHaveBeenCalled();
      expect(stored(services)).toContainEqual(other);
      expect(moves(services)).toEqual([]);
      expect(screen.getByText(/more than you hold \(0 BTC on 5 Jan 2026\)/)).toBeTruthy();
      expect(document.activeElement).toBe(field('Units sent'));
    });

    it('with sources offered that the write removed, takes the save refusal from no venue', async () => {
      const { onDone, services } = await open(lots);
      unchosen('2026-02-20');
      expect(screen.getAllByRole('radio')).toHaveLength(2);
      await saveAfter(services, deleted);
      expect(onDone).not.toHaveBeenCalled();
      expect(stored(services)).toEqual(expect.arrayContaining(deleted));
      expect(moves(services)).toEqual([]);
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.getByText(/more than you hold \(0 BTC on 20 Feb 2026\)/)).toBeTruthy();
      expect(document.activeElement).toBe(field('Units sent'));
    });

    it('a chosen source the write empties takes the save refusal at its field', async () => {
      const { onDone, services } = await open(lots);
      fill('0.01');
      await saveAfter(services, deleted);
      expect(onDone).not.toHaveBeenCalled();
      expect(moves(services)).toEqual([]);
      expect(screen.getByText(/more than you hold \(0 BTC on 20 Feb 2026\)/)).toBeTruthy();
      expect(document.activeElement).toBe(field('Units sent'));
    });
  });

  describe('an edit on a day no venue holds its coin keeps its stored source', () => {
    // 0.03 BTC bought at Kraken and sold there before the move, so nothing is held anywhere on 20 Jan 2026.
    const sold = anEntry({ kind: 'sell', slot: null, date: date('2026-01-15'), units: units('0.03'), venue: 'Kraken' });
    const move = aMove({ date: date('2026-01-20'), venue: 'Kraken', to: 'Ledger', units: units('0.01') });
    const stored = { ...move, received: units('0.01') };
    const entries = [bought('0.03', '2026-01-10', 'Kraken'), sold, stored];

    it('saves untouched, as the save takes an edit no worse than before', async () => {
      const { onDone } = await open(entries, { editing: stored });
      await save();
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone.mock.calls[0]?.[0].map((entry) => [entry.id, entry.venue])).toEqual([[move.id, 'Kraken']]);
    });

    it('saves a changed note', async () => {
      const { onDone } = await open(entries, { editing: stored });
      type('Note (optional)', 'To the hardware wallet');
      await save();
      const saved = onDone.mock.calls[0]?.[0] ?? [];
      expect(saved.map((entry) => [entry.venue, entry.note])).toEqual([['Kraken', 'To the hardware wallet']]);
    });

    it('never swaps it for the only venue that holds the coin', async () => {
      const elsewhere = bought('0.02', '2026-01-16', 'Bitstamp');
      const { onDone } = await open([...entries, elsewhere], { editing: stored });
      type('Note (optional)', 'To the hardware wallet');
      await save();
      expect(onDone.mock.calls[0]?.[0].map((entry) => entry.venue)).toEqual(['Kraken']);
    });
  });

  it('the destination is labelled and hinted as a place name and never asks for an address', async () => {
    await open(lots);
    const to = field('Venue the coins went to');
    expect(to.maxLength).toBe(40);
    const hint = document.getElementById(to.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(hint).toBe("The exchange's or wallet's name, as your other entries write it, never its address.");
    // The hint names an address only to rule it out; nothing else on the form mentions one.
    expect(document.body.textContent?.replace(hint, '')).not.toMatch(/address|xpub|public key/i);
  });

  it('an edit lists its own units back at its source and is not its own duplicate', async () => {
    const move = aMove({
      date: date('2026-02-20'),
      venue: 'Kraken',
      to: 'Ledger',
      units: units('0.03'),
      received: units('0.0298'),
    });
    const { onDone, services } = await open([...lots, move], { editing: move });
    expect(radio('Kraken').getAttribute('aria-checked')).toBe('true');
    expect(radio('Kraken').textContent).toContain('0.03 BTC');
    expect(field('Units received').value).toBe('0.0298');
    expect(screen.queryByText(/already has this move/)).toBeNull();
    type('Units received', '0.0299');
    await save();
    const saved = onDone.mock.calls[0]?.[0] ?? [];
    expect(saved.map((entry) => [entry.id, entry.received])).toEqual([[move.id, '0.0299']]);
    expect(services.domain.store.getState().snapshot.entries.filter((entry) => entry.kind === 'move')).toHaveLength(1);
  });
});
