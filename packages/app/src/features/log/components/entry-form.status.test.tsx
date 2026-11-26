// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, instant, money, month, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntryForm, type EntryFormProps } from './entry-form';
import { SETTLE_MS } from './form-status';

// The entry form's one polite status (docs/DESIGN.md §6, session 27c's DC2): the lines before Save show at once with
// no live role, and the hidden status after Save repeats them once the form has stayed unchanged for SETTLE_MS. The
// clock reads 20 Oct 2026; 0.003 BTC bought on 1 Sep 2025 are past the 365-day rule, 0.002 from 1 Oct 2026 are not.

beforeEach(() => {
  // jsdom has no `scrollIntoView`: a save refused from a field scrolls its alert line into view.
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const plan = aPlan();
const older = anEntry({
  kind: 'extra',
  date: date('2025-09-01'),
  slot: null,
  units: units('0.003'),
  venue: 'Wallet A',
});
const october = anEntry({
  date: date('2026-10-01'),
  slot: month('2026-10'),
  units: units('0.002'),
  createdAt: instant('2026-10-01T09:00:00+01:00'),
});
const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

async function renderForm(
  props: Partial<EntryFormProps> = {},
  entries: readonly Entry[] = [older, october],
  options: Parameters<typeof createTestServices>[0] = {},
) {
  const services = createTestServices({
    snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES },
    ...options,
  });
  const onDone = vi.fn();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <EntryForm kind="extra" editing={[]} onDone={onDone} {...props} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { onDone };
}

const plain = (text: string | null | undefined) => text?.replace(/[  ]/gu, ' ');
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const status = () => screen.getByRole('status');
/** The visible lines before Save, in the column's order. */
const lines = () => [...document.querySelectorAll('[data-form-line]')].map((each) => plain(each.textContent));
/** What the status holds, one entry per line. */
const said = () => [...status().querySelectorAll('p')].map((each) => plain(each.textContent));

const EARLIER =
  "The price the form filled in does not apply to an earlier date. Type the cost before fees and the units received, as your exchange's confirmation shows them.";
const NOTE = 'Computed from your dates, not tax advice';
const WARNED = 'Only 0,10 of the 0,15 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.';
const OVERSOLD = 'Only 0,003 of the 0,006 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.';
const REFUSED =
  'This sale is 0,001 BTC more than you hold (0,005 BTC on 20 Oct 2026). Check the amount and the date, or log the missing purchases first.';
const MOVE_SHORT =
  "After this change, your move to Ledger on 10 Jan 2026 sends 0,003 BTC more than the Log shows outside Ledger that day. Check that move's date and venues in the Log after you save.";
const stored = () =>
  aMove({ date: date('2026-01-10'), venue: 'Wallet A', units: units('0.003'), received: units('0.0028') });

/** No visible line sits in a live region or an <output>, and the form holds no <output>. */
function expectNoLiveLine() {
  for (const line of document.querySelectorAll('[data-form-line]')) {
    expect(line.closest('[role="status"],[aria-live],output')).toBeNull();
  }
  expect(document.querySelector('form output')).toBeNull();
}

describe('the entry form status', () => {
  it('E1: a new buy opens with one empty status, after Save', async () => {
    await renderForm();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status().textContent).toBe('');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton.compareDocumentPosition(status()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saveButton.parentElement?.contains(status())).toBe(false);
  });

  it('E2: the earlier-date line, a warning and the move line show with no live role', async () => {
    await renderForm();
    type('BTC cost before fees (EUR)', '120.00');
    type('Date', '2026-10-18');
    expect(lines()).toEqual([EARLIER]);
    expectNoLiveLine();
    cleanup();
    await renderForm({ kind: 'sell' }, [
      { ...older, units: units('0.10') },
      { ...october, units: units('0.05') },
    ]);
    type('BTC sold (units)', '0.15');
    type('BTC sold for, before fees (EUR)', '9000.00');
    expect(lines()).toEqual([WARNED, NOTE]);
    expectNoLiveLine();
    cleanup();
    await renderForm({ editing: [older] }, [older, stored()]);
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    type('Venue (optional)', 'Ledger');
    expect(lines()).toEqual([MOVE_SHORT]);
    expectNoLiveLine();
  });

  it('E3: a warned sale shows its lines at once and the status takes them a second after the last keystroke', async () => {
    await renderForm({ kind: 'sell' }, [
      { ...older, units: units('0.10') },
      { ...october, units: units('0.05') },
    ]);
    type('BTC sold (units)', '0.15');
    expect(lines()).toEqual([WARNED, NOTE]);
    expect(status().textContent).toBe('');
    await wait(SETTLE_MS - 1);
    type('BTC sold for, before fees (EUR)', '9000');
    await wait(SETTLE_MS - 1);
    expect(status().textContent).toBe('');
    await wait(1);
    expect(said()).toEqual([WARNED, NOTE]);
  });

  it('E4: the earlier-date line reaches the status only after the settle, and leaves it with the date', async () => {
    await renderForm();
    type('BTC cost before fees (EUR)', '120.00');
    type('Date', '2026-10-18');
    expect(lines()).toEqual([EARLIER]);
    await wait(SETTLE_MS - 1);
    expect(status().textContent).toBe('');
    await wait(1);
    expect(said()).toEqual([EARLIER]);
    type('Date', '2026-10-20');
    await wait(SETTLE_MS);
    expect(lines()).toEqual([]);
    expect(status().textContent).toBe('');
  });

  it('E5: an edit that opens on a warned sale speaks its lines a second after opening, with no edit', async () => {
    const bought = { kind: 'extra', slot: null, units: units('0.01') } as const;
    const sold = { kind: 'sell', date: date('2026-10-20'), slot: null } as const;
    const a = anEntry({ ...sold, units: units('0.001'), amount: money('60'), venue: 'Kraken' });
    const b = anEntry({ ...sold, units: units('0.002'), amount: money('120'), venue: 'Bitpanda' });
    const entries = [
      anEntry({ ...bought, date: date('2024-01-10'), venue: 'Kraken' }),
      anEntry({ ...bought, date: date('2026-09-01'), venue: 'Bitpanda' }),
      a,
      b,
    ];
    await renderForm({ kind: 'sell', editing: [a, b] }, entries, { rules: portugal });
    const warning = 'None of the 0,002 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.';
    expect(lines()).toEqual([warning, NOTE]);
    expect(status().textContent).toBe('');
    await wait(SETTLE_MS);
    expect(said()).toEqual([warning, NOTE]);
  });

  describe('E6: an oversold sale saved within the second', () => {
    const oversell = async () => {
      await renderForm({ kind: 'sell' });
      type('BTC sold (units)', '0.006');
      type('BTC sold for, before fees (EUR)', '360.00');
    };
    const refusedThenSaid = async () => {
      expect(plain(screen.getByRole('alert').textContent)).toBe(REFUSED);
      expect(status().textContent).toBe('');
      await wait(SETTLE_MS);
      expect(plain(screen.getByRole('alert').textContent)).toBe(REFUSED);
      expect(said()).toEqual([OVERSOLD, NOTE]);
    };

    it('by a click on Save', async () => {
      await oversell();
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
      await refusedThenSaid();
    });

    it('by Enter in the amount field', async () => {
      await oversell();
      const amount = screen.getByLabelText('BTC sold for, before fees (EUR)');
      amount.focus();
      await act(async () => void fireEvent.submit(amount.closest('form') as HTMLFormElement));
      await refusedThenSaid();
    });
  });

  it('E7: a venue typed letter by letter gives one settled change, the move line', async () => {
    await renderForm({ editing: [older] }, [older, stored()]);
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((each) => void records.push(...each));
    observer.observe(status(), { childList: true });
    for (const typed of ['L', 'Le', 'Led', 'Ledg', 'Ledge', 'Ledger']) {
      type('Venue (optional)', typed);
      await wait(SETTLE_MS / 4);
    }
    expect(status().textContent).toBe('');
    await wait(SETTLE_MS);
    const changes = [...records, ...observer.takeRecords()].filter((record) => record.addedNodes.length > 0);
    observer.disconnect();
    expect(changes).toHaveLength(1);
    expect(said()).toEqual([MOVE_SHORT]);
  });
});
