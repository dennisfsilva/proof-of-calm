// @vitest-environment jsdom
import { type EntityId, type Entry, type ExchangeFile, MAX_ENTRIES, readExchangeFile } from '@proofofcalm/core';
import { anEntry, date, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../../../lib/adapters/clock';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_OCTOBER, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { createTestServices, TEST_NOW_MS, type TestServicesOptions } from '../../../lib/services/testing';
import { TRADE_REPUBLIC_OCTOBER } from '../../../lib/services/trade-republic.testing';
import { crossTabChannel } from '../../../lib/store/channel';
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
const trRead = readExchangeFile(TRADE_REPUBLIC_OCTOBER);
if (!trRead.ok) throw new Error('the synthetic Trade Republic export reads');
const TR = { file: trRead.value, name: 'trade-republic.csv' };
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

async function mount(
  extra: readonly Entry[] = [],
  store?: (snapshot: Snapshot) => PlanStore,
  options: Omit<TestServicesOptions, 'planStore'> = {},
  source: { readonly file: ExchangeFile; readonly name: string } = { file: FILE, name: 'kraken-ledgers.csv' },
) {
  Element.prototype.scrollIntoView = vi.fn();
  const base = fixtureSnapshot();
  const snapshot: Snapshot = { ...base, entries: [...base.entries, ...extra] };
  const planStore = store?.(snapshot) ?? memoryPlanStore(snapshot);
  const services = createTestServices({ planStore, ...options });
  const onDone = vi.fn();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings, errors }}>
        <ExchangeImport file={source.file} name={source.name} onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { planStore, onDone, services };
}

/** Another tab of the same browser over `planStore`: its writes reach the mounted tab on the cross-tab channel. */
const tabOptions = (name: string) => ({ channel: crossTabChannel({ name, tabId: crypto.randomUUID() }) });
const importedRows = async (store: PlanStore) =>
  (await store.load()).entries.filter((entry) => entry.source === 'import-csv');

/** The text a person reads, with the formatters' no-break spaces as plain ones. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');
const texts = () => [...document.querySelectorAll('p')].map((line) => plain(line.textContent));
const button = (name: string | RegExp) => screen.queryByRole('button', { name });
const press = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })));
const HELD_LINE =
  'Your Log has 0.002 BTC as a Coins added entry at Ledger, dated 13 Oct 2026. 2 BTC transactions in this file, ' +
  '0.002 BTC in all, are dated on or before it and may be those coins. They are not added unless you choose to.';

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
    const checkbox = screen.getByRole('checkbox', { name: 'Add these transactions too' });
    const firstSection = screen.getAllByRole('button').find((each) => /\(\d+\)$/.test(plain(each.textContent)));
    expect(firstSection).toBeDefined();
    expect(
      checkbox.compareDocumentPosition(firstSection as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(button('Cancel')).not.toBeNull();
  });

  // Review: "two hand Coins added BTC entries (0.01 on 1 Mar 2026 and 0.0001 on 1 May 2026, cost 120 each) and
  // purchases of 0.005 BTC on 15 Feb and 0.00005 BTC on 15 Apr. Today the line names only the latest entry."
  it('names every Coins added entry that guards a purchase when more than one does', async () => {
    const early = { ...HELD, id: 'aaaaaaaa-0000-4000-8000-000000000021' as EntityId, date: date('2026-10-06') };
    await mount([{ ...early, units: units('0.0015'), venue: null }, HELD]);
    expect(texts()).toContain(
      'Your Log has 2 Coins added entries of BTC: 0.0015 BTC on 6 Oct 2026 and 0.0020 BTC at Ledger on 13 Oct 2026. ' +
        '2 BTC transactions in this file, 0.0020 BTC in all, are dated on or before the latest of them and may be ' +
        'those coins. They are not added unless you choose to.',
    );
  });

  it('the hint under the held line names one Coins added entry, or several as the line does', async () => {
    const hint = (count: string) =>
      `If you add them and their coins are the same ones, delete ${count} in the Log after the import.`;
    await mount([HELD]);
    expect(texts()).toContain(hint('the Coins added entry'));
    cleanup();
    const early = { ...HELD, id: 'aaaaaaaa-0000-4000-8000-000000000021' as EntityId, date: date('2026-10-06') };
    await mount([{ ...early, units: units('0.0015') }, HELD]);
    expect(texts()).toContain(hint('the Coins added entries'));
    expect(texts()).not.toContain(hint('the Coins added entry'));
  });

  it('names three Coins added entries with a serial comma, and one transaction they may be, in the singular', async () => {
    const at = (n: number, day: string) => ({
      ...HELD,
      id: `aaaaaaaa-0000-4000-8000-00000000003${n}` as EntityId,
      date: date(day),
    });
    await mount([at(1, '2026-10-05'), at(2, '2026-10-05'), { ...at(3, '2026-10-06'), venue: null }]);
    expect(texts().find((line) => line.startsWith('Your Log has 3'))).toBe(
      'Your Log has 3 Coins added entries of BTC: 0.0020 BTC at Ledger on 5 Oct 2026, 0.0020 BTC at Ledger on ' +
        '5 Oct 2026, and 0.0020 BTC on 6 Oct 2026. 1 BTC transaction in this file, 0.0012 BTC, is dated on or before the latest ' +
        'of them and may be those coins. It is not added unless you choose to.',
    );
    expect(texts()).toContain(
      'If you add it and its coins are the same ones, delete the Coins added entries in the Log after the import.',
    );
  });

  it('after a held line naming one transaction, the estimate it would replace is worded in the singular', async () => {
    // The ledger's one BTC purchase of 0.0012 alone, so October has no other purchase to replace its estimate.
    const one = FILE.movements.filter(
      (each) => each.coin !== 'BTC' || each.role !== 'purchase' || String(each.units) === '0.0012',
    );
    await mount([ONE_TAP_OCTOBER, HELD], undefined, {}, { file: { ...FILE, movements: one }, name: 'one.csv' });
    expect(texts()).toContain(
      'Your Log has 0.0020 BTC as a Coins added entry at Ledger, dated 13 Oct 2026. 1 BTC transaction in this ' +
        'file, 0.0012 BTC, is dated on or before it and may be those coins. It is not added unless you choose to. ' +
        'If you add it, it also replaces 1 estimate from Bought as planned.',
    );
    expect(texts()).toContain(
      'If you add it and its coins are the same ones, delete the Coins added entry in the Log after the import.',
    );
    expect(screen.getByRole('checkbox', { name: 'Add this transaction too' })).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Add these transactions too' })).toBeNull();
  });

  it('ticking `Add these transactions too` moves the estimates of the held months into `Estimates it replaces` and changes the summary and the button’s count', async () => {
    await mount([ONE_TAP_OCTOBER, HELD]);
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    expect(button(/^Estimates it replaces/)).toBeNull();
    const before = screen.getByRole('button', { name: /^Import \d+ entr/ }).textContent ?? '';
    const summaryBefore = texts().find((line) => line.startsWith('Adds '));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Add these transactions too' }));
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add these transactions too' }));
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: 'Kraken Pro' } });
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    // Another tab taps October's BTC buy: this tab's snapshot does not see it before the write reads the store.
    await planStore.write({ entries: [ONE_TAP_OCTOBER] });
    await press('Import 5 entries');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'The plan or the Log changed after this preview was made, so nothing was imported. The ' +
        'preview now shows what the file adds: check it, then import.',
    );
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(texts()).toContain('Replaces 1 estimate from Bought as planned.');
    expect((screen.getByLabelText('Venue for these entries') as HTMLInputElement).value).toBe('Kraken Pro');
    expect(screen.getByRole('checkbox', { name: 'Add these transactions too' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a month another tab records keeps the preview as reviewed; Import refuses it and shows the new preview, with the venue and the answer kept', async () => {
    const options = tabOptions('exchange-import-test');
    const { planStore, onDone, services } = await mount([HELD], undefined, options);
    const other = createTestServices({ planStore, ...tabOptions('exchange-import-test') });
    await other.start();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Add these transactions too' }));
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: 'Kraken Pro' } });
    const reviewed = texts();
    expect(reviewed).not.toContain('Replaces 1 estimate from Bought as planned.');
    // Another tab taps October's BTC buy: this tab hears it and reloads its snapshot.
    await act(() => other.domain.write({ entries: [ONE_TAP_OCTOBER] }));
    await waitFor(() =>
      expect(services.domain.store.getState().snapshot.entries.map((entry) => entry.id)).toContain(ONE_TAP_OCTOBER.id),
    );
    expect(texts()).toEqual(reviewed);
    await press('Import 5 entries');
    const alert = screen.getByRole('alert');
    expect(plain(alert.textContent)).toMatch(/^The plan or the Log changed after this preview was made/);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(texts()).toContain('Replaces 1 estimate from Bought as planned.');
    expect((screen.getByLabelText('Venue for these entries') as HTMLInputElement).value).toBe('Kraken Pro');
    expect(screen.getByRole('checkbox', { name: 'Add these transactions too' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(await importedRows(planStore)).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    other.dispose();
    services.dispose();
  });

  it('a choice changed after another tab wrote shows the preview of the Log as it is then, and Import writes it', async () => {
    const options = tabOptions('exchange-import-choice-test');
    const { planStore, onDone, services } = await mount([], undefined, options);
    const other = createTestServices({ planStore, ...tabOptions('exchange-import-choice-test') });
    await other.start();
    await act(() => other.domain.write({ entries: [ONE_TAP_OCTOBER] }));
    await waitFor(() =>
      expect(services.domain.store.getState().snapshot.entries.map((entry) => entry.id)).toContain(ONE_TAP_OCTOBER.id),
    );
    expect(texts()).not.toContain('Replaces 1 estimate from Bought as planned.');
    fireEvent.change(screen.getByLabelText('Venue for these entries'), { target: { value: 'Kraken Pro' } });
    expect(texts()).toContain('Replaces 1 estimate from Bought as planned.');
    await press('Import 5 entries');
    expect(onDone).toHaveBeenCalledWith({ kind: 'imported', added: 5, replaced: 1, imported: 0, deleted: 0 });
    other.dispose();
    services.dispose();
  });

  it('the day turning over keeps the preview as reviewed, and Import writes it: a day alone changes nothing it adds', async () => {
    let nowMs = TEST_NOW_MS;
    const clock = systemClock('Europe/Lisbon', () => nowMs);
    const { planStore, onDone, services } = await mount([ONE_TAP_OCTOBER], undefined, { clock });
    const reviewed = texts();
    nowMs += 24 * 60 * 60 * 1000;
    act(() => services.tick());
    expect(services.ui.getState().today).toBe('2026-10-21');
    expect(texts()).toEqual(reviewed);
    await press('Import 5 entries');
    expect(onDone).toHaveBeenCalledWith({ kind: 'imported', added: 5, replaced: 1, imported: 0, deleted: 0 });
    expect(await importedRows(planStore)).toHaveLength(5);
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

// "The file line names the export, and the venue field starts as the exchange's name: Trade Republic for its export."
describe('ExchangeImport of a Trade Republic export', () => {
  it('names the file as a Trade Republic transaction export and imports at Trade Republic unless changed', async () => {
    const { planStore } = await mount([], undefined, {}, TR);
    expect(texts()[0]).toBe(
      'trade-republic.csv: a Trade Republic transaction export of 15 rows, from 5 Oct 2026 to 14 Oct 2026.',
    );
    expect((screen.getByLabelText('Venue for these entries') as HTMLInputElement).value).toBe('Trade Republic');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Import \d+ entr/ })));
    const venues = new Set((await importedRows(planStore)).map((entry) => entry.venue));
    expect(venues).toEqual(new Set(['Trade Republic']));
  });
});

// "Each alert names the exchange whose file it is: Kraken's ledger or Trade Republic's transaction export."
type Problem = Parameters<ReturnType<typeof useExchangeProblemText>>[0];
function Line({ problem }: { problem: Problem }) {
  return <p>{useExchangeProblemText()(problem)}</p>;
}
/** The alert's words for a problem, read from a mounted line. */
const words = async (problem: Problem) => {
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

describe('useExchangeProblemText, the reader’s alerts per exchange', () => {
  it('names the columns of a Trade Republic export it does not know, counting those it does not name', async () => {
    expect(
      await words({ code: 'unknown-columns', exchange: 'trade-republic', columns: ['iban_hash', 'note'], others: 3 }),
    ).toBe(
      'This looks like a Trade Republic transaction export, but it has 5 columns Proof of Calm does not know: ' +
        'iban_hash, note, and 3 more. It was not read. If you edited the file, export the transactions again from ' +
        'Trade Republic, then choose the new file as it is.',
    );
    expect(await words({ code: 'unknown-columns', exchange: 'trade-republic', columns: [], others: 1 })).toBe(
      'This looks like a Trade Republic transaction export, but it has 1 column Proof of Calm does not know. It ' +
        'was not read. If you edited the file, export the transactions again from Trade Republic, then choose the ' +
        'new file as it is.',
    );
  });

  it('words missing columns, no rows and no plan for each exchange', async () => {
    expect(await words({ code: 'missing-columns', exchange: 'trade-republic', columns: ['shares', 'fee'] })).toBe(
      'This Trade Republic transaction export is missing the shares and fee columns, so it was not read. Export ' +
        'the transactions again from Trade Republic.',
    );
    expect(await words({ code: 'missing-columns', exchange: 'kraken', columns: ['fee'] })).toBe(
      'This Kraken ledger is missing the fee column, so it was not read. Export the Ledgers again with every field.',
    );
    expect(await words({ code: 'no-rows', exchange: 'trade-republic' })).toBe(
      'This Trade Republic transaction export has no rows, so nothing was imported. Export the transactions again ' +
        'for a period with transactions.',
    );
    expect(await words({ code: 'no-rows', exchange: 'kraken' })).toBe(
      'This Kraken ledger has no rows, so nothing was imported. Export the Ledgers again for a period with ' +
        'transactions.',
    );
    expect(await words({ code: 'needs-plan', exchange: 'trade-republic' })).toBe(
      'This Trade Republic transaction export needs a plan for its coins, currency, and months. Set up a plan, ' +
        'then choose the file again.',
    );
    expect(await words({ code: 'needs-plan', exchange: 'kraken' })).toBe(
      'This Kraken ledger needs a plan for its coins, currency, and months. Set up a plan, then choose the file ' +
        'again.',
    );
  });
});

describe('useExchangeProblemText, the write’s refusals', () => {
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
