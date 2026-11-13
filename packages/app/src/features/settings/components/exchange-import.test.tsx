// @vitest-environment jsdom
import { type EntityId, type Entry, MAX_ENTRIES, readExchangeFile } from '@proofofcalm/core';
import { anEntry, date, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_OCTOBER, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import settings from '../../../messages/en/settings.json';
import { ExchangeImport } from './exchange-import';
import { useExchangeProblemText } from './exchange-problem';

// The exchange import's container (docs/DOMAIN.md §3.13, CONTENT-STYLE §3 "Import an exchange's file"): the file,
// zone and venue lines, the summary, the held line with its answer between the summary and the sections, and the one
// write, whose `changed` refusal shows the alert and the new preview with the venue and the answer kept. The sections'
// sentences are exchange-import-sections.test.tsx's.

const read = readExchangeFile(KRAKEN_OCTOBER);
if (!read.ok) throw new Error('the synthetic ledger reads');
const FILE = read.value;
/** Coins added at Ledger on 13 Oct, after both of the ledger's BTC purchases (ADR-0056: invented). */
const HELD = anEntry({
  id: 'aaaaaaaa-0000-4000-8000-000000000020' as EntityId,
  kind: 'held',
  coin: 'BTC' as Entry['coin'],
  date: date('2026-10-13'),
  amount: null,
  units: units('0.002'),
  slot: null,
  venue: 'Ledger',
  source: 'manual',
});

afterEach(cleanup);

async function mount(extra: readonly Entry[] = [], store?: (snapshot: Snapshot) => PlanStore) {
  Element.prototype.scrollIntoView = vi.fn();
  const base = fixtureSnapshot();
  const snapshot: Snapshot = { ...base, entries: [...base.entries, ...extra] };
  const planStore = store?.(snapshot) ?? memoryPlanStore(snapshot);
  const services = createTestServices({ planStore });
  const onDone = vi.fn();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings, errors }}>
        <ExchangeImport file={FILE} name="kraken-ledgers.csv" onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { planStore, onDone };
}

/** The text a person reads, with the formatters' no-break spaces as plain ones. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');
const texts = () => [...document.querySelectorAll('p')].map((line) => plain(line.textContent));
const button = (name: string | RegExp) => screen.queryByRole('button', { name });
const press = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })));
const HELD_LINE =
  'Your Log has 0.002 BTC as a Coins added entry at Ledger, dated 13 Oct 2026. 2 BTC transactions in this file, ' +
  '0.002 BTC in all, are dated on or before it and may be those coins. They are not added unless you choose so.';

describe('ExchangeImport', () => {
  it('names the file, the zone and the venue, then the summary, the held line and the sections, and focuses its heading', async () => {
    await mount([ONE_TAP_OCTOBER, HELD]);
    const heading = screen.getByRole('heading', { name: 'What this file adds' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const shown = texts();
    expect(shown.slice(0, 2)).toEqual([
      'kraken-ledgers.csv: a Kraken ledger of 9 rows, from 5 Oct 2026 to 16 Oct 2026.',
      "Each date is the day in this device's time zone, Europe/Lisbon.",
    ]);
    expect((screen.getByLabelText('Venue for these entries') as HTMLInputElement).value).toBe('Kraken');
    const summary = shown.findIndex((line) => line.startsWith('Adds '));
    const held = shown.indexOf(`${HELD_LINE} If you add them, they also replace 1 estimate from Bought as planned.`);
    expect(summary).toBeGreaterThan(1);
    expect(held).toBeGreaterThan(summary);
    const checkbox = screen.getByRole('checkbox', { name: 'Add these purchases too' });
    const firstSection = screen.getAllByRole('button').find((each) => /\(\d+\)$/.test(plain(each.textContent)));
    expect(firstSection).toBeDefined();
    expect(
      checkbox.compareDocumentPosition(firstSection as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(button('Cancel')).not.toBeNull();
  });

  it('ticking `Add these purchases too` moves the estimates of the held months into `Estimates it replaces` and changes the summary and the button’s count', async () => {
    await mount([ONE_TAP_OCTOBER, HELD]);
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    expect(button(/^Estimates it replaces/)).toBeNull();
    const before = screen.getByRole('button', { name: /^Import \d+ entr/ }).textContent ?? '';
    const summaryBefore = texts().find((line) => line.startsWith('Adds '));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Add these purchases too' }));
    expect(texts()).toContain('Replaces 1 estimate from Bought as planned.');
    expect(button('Estimates it replaces (1)')).not.toBeNull();
    expect(texts()).toContain(HELD_LINE);
    expect(texts().find((line) => line.startsWith('Adds '))).not.toBe(summaryBefore);
    const after = screen.getByRole('button', { name: /^Import \d+ entr/ }).textContent ?? '';
    expect(Number(after.replace(/\D/g, ''))).toBe(Number(before.replace(/\D/g, '')) + 2);
  });

  it('imports with the venue typed and the answer given, and ends with the outcome', async () => {
    const { planStore, onDone } = await mount([ONE_TAP_OCTOBER]);
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: ' My Kraken ' } });
    await press('Import 5 entries');
    expect(onDone).toHaveBeenCalledWith({ kind: 'imported', added: 5, replaced: 1, imported: 0, deleted: 0 });
    const added = (await planStore.load()).entries.filter((entry) => entry.source === 'import-csv');
    expect(new Set(added.map((entry) => entry.venue))).toEqual(new Set(['My Kraken']));
  });

  it('with nothing to add, says so and offers no import', async () => {
    const first = await mount();
    await press('Import 5 entries');
    const imported = (await first.planStore.load()).entries.filter((entry) => entry.source === 'import-csv');
    cleanup();
    await mount(imported);
    expect(texts()).toEqual(
      expect.arrayContaining(['Nothing to add from this file.', 'Imported earlier, not added: 5.']),
    );
    expect(button(/^Import/)).toBeNull();
  });

  it('a changed refusal shows the alert, focused, and the new preview, with the venue and the answer kept', async () => {
    const { planStore, onDone } = await mount([HELD]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add these purchases too' }));
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: 'Kraken Pro' } });
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    // Another tab taps October's BTC buy: this tab's snapshot does not see it before the write reads the store.
    await planStore.write({ entries: [ONE_TAP_OCTOBER] });
    await press('Import 5 entries');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'The plan or the Log changed after this preview was made, so nothing was imported. The preview now shows ' +
        'what the file adds: check it, then import.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(texts()).toContain('Replaces 1 estimate from Bought as planned.');
    expect((screen.getByLabelText('Venue for these entries') as HTMLInputElement).value).toBe('Kraken Pro');
    expect(screen.getByRole('checkbox', { name: 'Add these purchases too' }).getAttribute('aria-checked')).toBe('true');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a refusal of the write ends the import with it: newer rows, no plan', async () => {
    const newer = await mount([], (snapshot) => memoryPlanStore({ ...snapshot, newerTombstones: 1 }));
    await press('Import 5 entries');
    expect(newer.onDone).toHaveBeenCalledWith({ kind: 'refused', refusal: { code: 'newer-rows' } });
    cleanup();
    const gone = await mount();
    await gone.planStore.write({ plan: null });
    await press('Import 5 entries');
    expect(gone.onDone).toHaveBeenCalledWith({ kind: 'refused', refusal: { code: 'no-plan' } });
  });

  it('names a venue longer than an entry holds and imports nothing', async () => {
    const { onDone } = await mount();
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: 'x'.repeat(41) } });
    await press('Import 5 entries');
    expect(screen.getByText('Use at most 40 characters in the venue.')).toBeDefined();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Cancel ends the import with nothing written', async () => {
    const { planStore, onDone } = await mount();
    const before = await planStore.load();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalledWith(null);
    expect(await planStore.load()).toStrictEqual(before);
  });
});

describe('useExchangeProblemText, the write’s refusals', () => {
  function Line({ problem }: { problem: Parameters<ReturnType<typeof useExchangeProblemText>>[0] }) {
    return <p>{useExchangeProblemText()(problem)}</p>;
  }
  const words = async (problem: Parameters<ReturnType<typeof useExchangeProblemText>>[0]) => {
    const services = createTestServices({ snapshot: fixtureSnapshot() });
    await act(() => services.start());
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, errors }}>
          <Line problem={problem} />
        </I18nProvider>
      </ServicesProvider>,
    );
    const text = plain(document.querySelector('p')?.textContent);
    cleanup();
    return text;
  };

  it('words newer rows, no plan, too many entries and entries that cannot be stored', async () => {
    expect(await words({ code: 'newer-rows' })).toBe(
      'A newer version of Proof of Calm saved or deleted entries on this device, so nothing was imported. Reload ' +
        'the page, then import again.',
    );
    expect(await words({ code: 'no-plan' })).toBe(
      'This device has no plan now, so nothing was imported. Set up a plan, then choose the file again.',
    );
    expect(await words({ code: 'too-many-entries', entries: 10_004, max: MAX_ENTRIES })).toBe(
      'Importing this file would leave 10,004 entries in this plan, more than the 10,000 a plan holds, so nothing ' +
        'was imported. Delete entries in the Log, then choose the file again.',
    );
    expect(await words({ code: 'invalid-entries', ids: ['a' as EntityId, 'b' as EntityId] })).toBe(
      '2 entries from this file cannot be stored, so nothing was imported.',
    );
  });
});
