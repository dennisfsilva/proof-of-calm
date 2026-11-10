// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
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
  const services = createTestServices({
    snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES },
    ...(perVenue ? { rules: portugal } : {}),
  });
  const onDone = vi.fn<(saved: readonly Entry[]) => void>();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <MoveForm editing={editing} onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { services, onDone };
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
