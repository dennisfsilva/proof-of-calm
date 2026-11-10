// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  DEFAULT_PREFS,
  deleteEntries,
  ENTRY_NOTE_MAX_LENGTH,
  type Entry,
  matchLots,
  type Plan,
  VENUE_MAX_LENGTH,
} from '@proofofcalm/core';
import { aMove, anEntry, aPlan, BTC, date, ETH, instant, money, month, split, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore, sessionDrafts } from '../../../lib/adapters';
import { setErrorReporter } from '../../../lib/errors';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, TEST_NOW_MS, TEST_PRICES } from '../../../lib/services/testing';
import { crossTabChannel } from '../../../lib/store';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntryForm, type EntryFormProps } from './entry-form';

// The entry form (ADR-0034) over the test services: the clock reads 20 Oct 2026, BTC costs €60,000.12.

afterEach(cleanup);
// jsdom has no `scrollIntoView`: a save refused from a field scrolls its alert line into view.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const plan = aPlan();
// 0.003 BTC bought on 1 Sep 2025 and 0.002 on 1 Oct 2026; on 20 Oct 2026 the 365-day rule passes only the first.
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

const servicesWith = (
  entries: readonly Entry[],
  options: Parameters<typeof createTestServices>[0] = {},
  forPlan: Plan = plan,
) =>
  createTestServices({
    snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan: forPlan, entries, prices: TEST_PRICES },
    ...options,
  });

async function renderForm(
  props: Partial<EntryFormProps> = {},
  entries: readonly Entry[] = [older, october],
  services = servicesWith(entries),
) {
  const onDone = vi.fn();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <EntryForm kind="extra" editing={[]} onDone={onDone} {...props} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
  return { services, onDone };
}

/** Closes the form and opens it again, as leaving the sheet and coming back does. */
async function reopen(services: Services, props: Partial<EntryFormProps> = {}) {
  cleanup();
  return renderForm(props, [], services);
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
const stored = (services: Services) => services.domain.store.getState().snapshot.entries;
/** The control's invalid mark and the error shown in its own field. */
const fieldError = (label: string) => {
  const control = screen.getByLabelText(label);
  const error = control.closest('[data-slot="field"]')?.querySelector('[data-slot="field-error"]');
  return { invalid: control.getAttribute('aria-invalid'), text: error?.textContent };
};

describe('EntryForm', () => {
  it('fills the units as an amount is typed', async () => {
    await renderForm();
    type('BTC paid (EUR)', '120.00');
    expect(screen.getByLabelText<HTMLInputElement>('BTC received (units)').value).toBe('0.00199999');
  });

  // ADR-0034's keystroke path: an amount passing through empty, zero and "0." keeps the typed units and the price.
  it('keeps the typed units while the amount passes through empty and zero, then fills the price', async () => {
    await renderForm();
    type('BTC price (EUR)', '');
    type('BTC received (units)', '0.002');
    for (const typed of ['1', '', '0', '0.', '120']) type('BTC paid (EUR)', typed);
    expect(screen.getByLabelText<HTMLInputElement>('BTC received (units)').value).toBe('0.002');
    expect(screen.getByLabelText<HTMLInputElement>('BTC price (EUR)').value).toBe('60,000.00');
  });

  // Session 12a (#350): the price filled as the form opened stayed beside an earlier date and derived its units.
  it('empties the filled price and the units from it on an earlier date, says what to type, and fills it again', async () => {
    await renderForm();
    type('BTC paid (EUR)', '120.00');
    type('Date', '2026-10-18');
    const value = (label: string) => screen.getByLabelText<HTMLInputElement>(label).value;
    expect([value('BTC received (units)'), value('BTC price (EUR)')]).toEqual(['', '']);
    expect(screen.getByRole('status').textContent).toBe(
      "The price the form filled in does not apply to an earlier date. Type what you paid and the units received, as your exchange's confirmation shows them.",
    );
    type('Date', '2026-10-20');
    expect([value('BTC received (units)'), value('BTC price (EUR)')]).toEqual(['0.00199999', '60,000.12']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // "Type two of the three; the form fills the third": units beside the live price filled nothing, and the save refused.
  it('fills the amount from units typed beside the live price, and saves both', async () => {
    const { services, onDone } = await renderForm();
    type('BTC received (units)', '0.002');
    expect(screen.getByLabelText<HTMLInputElement>('BTC paid (EUR)').value).toBe('120.00');
    await save();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(stored(services).filter((entry) => entry.date === '2026-10-20')).toMatchObject([
      { kind: 'extra', coin: 'BTC', amount: '120', units: '0.002' },
    ]);
  });

  it('keeps typed units and fills the price from an amount typed after them', async () => {
    await renderForm();
    type('BTC received (units)', '0.002');
    type('BTC paid (EUR)', '130');
    expect(screen.getByLabelText<HTMLInputElement>('BTC received (units)').value).toBe('0.002');
    expect(screen.getByLabelText<HTMLInputElement>('BTC price (EUR)').value).toBe('65,000.00');
  });

  it('records a new buy with the prefilled fee and venue', async () => {
    const { services, onDone } = await renderForm();
    type('BTC paid (EUR)', '120.00');
    await save();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(stored(services).filter((entry) => entry.date === '2026-10-20')).toMatchObject([
      { kind: 'extra', coin: 'BTC', amount: '120', units: '0.00199999', venue: 'Wallet A', source: 'manual' },
    ]);
  });

  it('keeps the ids, venues and fees of an unchanged edit of a row with two venues', async () => {
    const shared = { kind: 'dca', date: date('2026-10-01'), slot: month('2026-10') } as const;
    const btc = anEntry({ ...shared, fee: money('0.50'), venue: 'Kraken' });
    const eth = anEntry({ ...shared, coin: ETH.id, amount: money('40'), units: units('0.02'), venue: 'Bitpanda' });
    const { services, onDone } = await renderForm({ kind: 'dca', editing: [btc, eth] }, [btc, eth]);
    await save();
    // The save's one moment, as stored: a later clock.now() is 1 ms on (ADR-0042, Readings).
    const now = stored(services).find((entry) => entry.id === btc.id)?.updatedAt;
    expect(now).not.toBe(btc.updatedAt);
    expect(onDone).toHaveBeenCalledWith([
      { ...btc, updatedAt: now },
      { ...eth, updatedAt: now },
    ]);
  });

  it('saves nothing and says so when another tab deleted the entry being edited', async () => {
    const planStore = memoryPlanStore({ ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [older, october] });
    const tab = (tabId: string) =>
      createTestServices({ planStore, channel: crossTabChannel({ name: 'entry-form-test', tabId }) });
    const other = tab('b');
    await other.start();
    const { services, onDone } = await renderForm({ kind: 'dca', editing: [october] }, [], tab('a'));
    await act(() =>
      other.domain.write((snapshot) => ({ entries: deleteEntries(snapshot.entries, [october.id], other.clock.now()) })),
    );
    await vi.waitFor(() => expect(stored(services).find((entry) => entry.id === october.id)?.deletedAt).not.toBeNull());
    type('BTC paid (EUR)', '80');
    await save();
    expect(services.toasts.getSnapshot()?.title).toBe(
      'This entry was deleted in another browser tab, so the change was not saved.',
    );
    expect(onDone).toHaveBeenCalledWith([]);
    expect(planStore.current().entries.find((entry) => entry.id === october.id)?.deletedAt).not.toBeNull();
    for (const each of [services, other]) each.dispose();
  });

  // Issue #138: a tab that has not yet heard another tab's Delete everything would store an entry with no plan, and
  // the other tab's Undo would then find the stores in use and restore nothing.
  describe('after another tab deleted everything', () => {
    const PLAN_DELETED = 'The plan was deleted in another browser tab, so this entry was not saved.';
    const wiped = async (props: Partial<EntryFormProps>) => {
      const snapshot = {
        ...EMPTY_SNAPSHOT,
        prefs: DEFAULT_PREFS,
        plan,
        entries: [older, october],
        prices: TEST_PRICES,
      };
      const planStore = memoryPlanStore(snapshot);
      const { services, onDone } = await renderForm(props, [], createTestServices({ planStore }));
      return { planStore, services, onDone, rows: await planStore.wipe() };
    };

    it('saves no new buy and says so, so that tab can still undo', async () => {
      const { planStore, onDone, rows } = await wiped({});
      type('BTC paid (EUR)', '120.00');
      await save();
      expect(planStore.current().entries).toHaveLength(0);
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getByText(PLAN_DELETED)).toBeTruthy();
      expect(await planStore.restore(rows)).toBe(true);
      expect(planStore.current().plan?.id).toBe(plan.id);
      expect(planStore.current().entries.map((entry) => entry.id)).toEqual([older.id, october.id]);
    });

    it('saves no new sale and says so', async () => {
      const { planStore, onDone } = await wiped({ kind: 'sell' });
      type('BTC sold (units)', '0.001');
      type('Received for BTC (EUR)', '60.00');
      await save();
      expect(planStore.current().entries).toHaveLength(0);
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getByText(PLAN_DELETED)).toBeTruthy();
    });

    it('saves no edit and closes with the deleted-entry toast, as for an entry deleted alone', async () => {
      const { planStore, services, onDone } = await wiped({ kind: 'dca', editing: [october] });
      type('BTC paid (EUR)', '80');
      await save();
      expect(planStore.current().entries).toHaveLength(0);
      expect(services.toasts.getSnapshot()?.title).toBe(
        'This entry was deleted in another browser tab, so the change was not saved.',
      );
      expect(onDone).toHaveBeenCalledWith([]);
      expect(screen.queryByText(PLAN_DELETED)).toBeNull();
    });
  });

  // ADR-0003: the line names what the one tap filled and asks for the units; it never says a save clears the label.
  const ESTIMATE_LINE =
    "Bought as planned filled in these units from the day's price. Any fee or venue it copied came from your latest purchase or sale that recorded one. Type the units from your exchange's confirmation.";

  it('opening a one-tap row shows the estimate line', async () => {
    const tapped = { ...october, source: 'one-tap' as const };
    await renderForm({ kind: 'dca', editing: [tapped] }, [older, tapped]);
    expect(screen.getByText(/^Bought as planned filled in/u).textContent).toBe(ESTIMATE_LINE);
  });

  // #375 (a): with no earlier fee or venue the tap copied neither, so the line claims no source for them.
  it('a one-tap row recorded with no earlier fee or venue shows the line with any fee or venue it copied', async () => {
    const tapped = { ...october, source: 'one-tap' as const };
    await renderForm({ kind: 'dca', editing: [tapped] }, [tapped]);
    expect(screen.getByText(/^Bought as planned filled in/u).textContent).toBe(ESTIMATE_LINE);
    expect(screen.queryByText(/each came from/u)).toBeNull();
  });

  it('shows no estimate line on a manual row or a new entry', async () => {
    await renderForm({ kind: 'dca', editing: [october] });
    expect(screen.queryByText(/^Bought as planned filled in/u)).toBeNull();
    await reopen(servicesWith([older, october]), { kind: 'extra', editing: [] });
    expect(screen.queryByText(/^Bought as planned filled in/u)).toBeNull();
  });

  it('keeps the entry ids on an edit', async () => {
    const { services, onDone } = await renderForm({ kind: 'dca', editing: [october] });
    expect(screen.getByLabelText<HTMLInputElement>('BTC paid (EUR)').value).toBe('70.00');
    type('BTC paid (EUR)', '80');
    await save();
    expect(onDone).toHaveBeenCalledTimes(1);
    const saved: readonly Entry[] = onDone.mock.lastCall?.[0] ?? [];
    expect(saved[0]).toMatchObject({ id: october.id, amount: '80', units: '0.002', createdAt: october.createdAt });
    expect(stored(services).find((entry) => entry.id === october.id)?.amount).toBe(money('80'));
  });

  // Session 9, review round 2 (#97, #103): a cleared date reached the store, which refused it as a programmer error.
  it('names the date fix and saves nothing when the date is cleared', async () => {
    const reported = vi.fn();
    setErrorReporter(reported);
    const { services, onDone } = await renderForm();
    type('Date', '');
    type('BTC paid (EUR)', '120.00');
    await save();
    expect(screen.getByText('Choose a full date: day, month, and year.')).toBeTruthy();
    expect(screen.getByLabelText('Date').getAttribute('aria-invalid')).toBe('true');
    expect(onDone).not.toHaveBeenCalled();
    expect(stored(services)).toEqual([older, october]);
    expect(reported).not.toHaveBeenCalled();
    setErrorReporter(() => undefined);
  });

  // Session 12's carry-over (#114): a long note or venue reached the store's schema and its generic line.
  // Session 13's review (#114): the save's refusal sat in the form-wide line by Save, not under its field.
  it('the venue and the note hold no more than the entry stores, and a longer one is named under its field', async () => {
    const reported = vi.fn();
    setErrorReporter(reported);
    const { services, onDone } = await renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    const venue = screen.getByLabelText('Venue (optional)');
    expect(venue.getAttribute('maxlength')).toBe(String(VENUE_MAX_LENGTH));
    expect(screen.getByLabelText('Note (optional)').getAttribute('maxlength')).toBe(String(ENTRY_NOTE_MAX_LENGTH));
    type('BTC paid (EUR)', '120.00');
    type('Venue (optional)', 'x'.repeat(VENUE_MAX_LENGTH + 1));
    await save();
    expect(fieldError('Venue (optional)')).toEqual({
      invalid: 'true',
      text: 'Use at most 40 characters in the venue.',
    });
    expect(fieldError('Note (optional)')).toEqual({ invalid: null, text: undefined });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(stored(services)).toEqual([older, october]);
    expect(reported).not.toHaveBeenCalled();
    setErrorReporter(() => undefined);
  });

  it('opens the venue and note to name a restored note that is too long, and saves nothing', async () => {
    const drafts = createTestServices().drafts;
    const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    type('BTC paid (EUR)', '120.00');
    type('Note (optional)', 'x'.repeat(ENTRY_NOTE_MAX_LENGTH + 1));
    const { onDone } = await reopen(services);
    expect(screen.queryByLabelText('Note (optional)')).toBeNull();
    await save();
    expect(fieldError('Note (optional)')).toEqual({ invalid: 'true', text: 'Use at most 500 characters in the note.' });
    expect(fieldError('Venue (optional)')).toEqual({ invalid: null, text: undefined });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(stored(services)).toEqual([older, october]);
  });

  // #360's review: a refusal named under the venue or the note left the focus on Save (CONTENT-STYLE §3).
  it('moves the focus to a restored note that is too long, inside the panel it opens', async () => {
    const drafts = createTestServices().drafts;
    const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    type('BTC paid (EUR)', '120.00');
    type('Note (optional)', 'x'.repeat(ENTRY_NOTE_MAX_LENGTH + 1));
    await reopen(services);
    await save();
    expect(document.activeElement).toBe(screen.getByLabelText('Note (optional)'));
  });

  describe('the session draft (ADR-0020)', () => {
    const value = (label: string) => screen.getByLabelText<HTMLInputElement>(label).value;
    const anything = { safeParse: (data: unknown) => ({ success: true as const, data }) };

    it('restores what was typed when the form opens again, and starts afresh after a save', async () => {
      const { services } = await renderForm();
      type('BTC paid (EUR)', '120.00');
      type('Date', '2026-10-18');
      await reopen(services);
      expect(value('BTC paid (EUR)')).toBe('120.00');
      // An earlier date takes the filled price and the units derived from it (DOMAIN §6, "Fill a form row").
      expect(value('BTC received (units)')).toBe('');
      expect(value('Date')).toBe('2026-10-18');
      type('BTC received (units)', '0.002');
      await save();
      await reopen(services);
      expect(value('BTC paid (EUR)')).toBe('');
      expect(value('Date')).toBe('2026-10-20');
    });

    it('keeps the draft of an edit apart from the draft of a new entry', async () => {
      const { services } = await renderForm({ kind: 'dca', editing: [october] });
      type('BTC paid (EUR)', '80');
      await reopen(services, { kind: 'dca' });
      expect(value('BTC paid (EUR)')).not.toBe('80');
      await reopen(services, { kind: 'dca', editing: [october] });
      expect(value('BTC paid (EUR)')).toBe('80');
    });

    it('drops a draft typed in another number locale', async () => {
      const drafts = createTestServices().drafts;
      const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
      type('BTC paid (EUR)', '120.00');
      services.dispose();
      const german = servicesWith([older, october], { drafts, language: 'de' });
      await reopen(german);
      expect(value('BTC paid (EUR)')).toBe('');
      expect(drafts.read('entry', 'new:extra:none', anything)).toBeNull();
      german.dispose();
    });

    // Session 11's review (#104): a blur rewrote the form unchanged and froze its date and price into a draft.
    it('keeps no draft of a form left as it opened, so its date follows the clock', async () => {
      const drafts = createTestServices().drafts;
      const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
      fireEvent.blur(screen.getByLabelText('BTC paid (EUR)'));
      expect(drafts.read('entry', 'new:extra:none', anything)).toBeNull();
      services.dispose();
      const later = servicesWith([older, october], { drafts, nowMs: TEST_NOW_MS + 2 * 86_400_000 });
      await reopen(later);
      expect(value('Date')).toBe('2026-10-22');
      later.dispose();
    });

    // Session 11's review (#104): a restored edit saved the note as it was when typed over a note changed since.
    it('drops the draft of an edit whose entry was written elsewhere since, keeping the newer note', async () => {
      const first = { ...october, note: 'first' };
      const { services } = await renderForm({ kind: 'dca', editing: [first] }, [older, first]);
      type('BTC paid (EUR)', '80');
      cleanup();
      const fresh = { ...first, note: 'changed elsewhere', updatedAt: instant('2026-10-20T11:00:00+01:00') };
      await act(() =>
        services.domain.write((snapshot) => ({
          entries: snapshot.entries.map((entry) => (entry.id === fresh.id ? fresh : entry)),
        })),
      );
      await reopen(services, { kind: 'dca', editing: [fresh] });
      expect(value('BTC paid (EUR)')).toBe('70.00');
      await save();
      expect(stored(services).find((entry) => entry.id === fresh.id)?.note).toBe('changed elsewhere');
    });

    // Session 11's review (#104): an ETH row came back after the plan dropped ETH, and the save refused it every time.
    it("drops a new entry's draft whose coins are no longer the plan's", async () => {
      const drafts = createTestServices().drafts;
      const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
      type('BTC paid (EUR)', '100');
      services.dispose();
      const btcOnly = aPlan({ coins: [BTC], split: split({ BTC: '100' }) });
      const changed = createTestServices({
        snapshot: {
          ...EMPTY_SNAPSHOT,
          prefs: DEFAULT_PREFS,
          plan: btcOnly,
          entries: [older, october],
          prices: TEST_PRICES,
        },
        drafts,
      });
      await reopen(changed);
      expect(screen.queryByLabelText('ETH paid (EUR)')).toBeNull();
      expect(value('BTC paid (EUR)')).toBe('');
      expect(drafts.read('entry', 'new:extra:none', anything)).toBeNull();
      changed.dispose();
    });

    // Session 11's review round 2 (#104): the draft brought back BTC paid 70.00 after the plan amount went to 200.
    it("restores what was typed over the plan's amounts as they are now", async () => {
      const drafts = createTestServices().drafts;
      const { services } = await renderForm({ kind: 'dca' }, undefined, servicesWith([older, october], { drafts }));
      fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
      type('Note (optional)', 'typed');
      services.dispose();
      const raised = createTestServices({
        snapshot: {
          ...EMPTY_SNAPSHOT,
          prefs: DEFAULT_PREFS,
          plan: aPlan({ monthlyAmount: money('200') }),
          entries: [older, october],
          prices: TEST_PRICES,
        },
        drafts,
      });
      await reopen(raised, { kind: 'dca' });
      expect(value('BTC paid (EUR)')).toBe('140.00');
      fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
      expect(screen.getByLabelText<HTMLTextAreaElement>('Note (optional)').value).toBe('typed');
      raised.dispose();
    });

    // log.spec's reload mid-entry: with Portugal's rules loaded an en-GB UI reads numbers in pt-PT (ADR-0034), so
    // the blur that leaving BTC's units for ETH's makes writes them back as 0,0012, and the draft keeps that text.
    it("restores each field as it read before the reload, in the plan's number locale", async () => {
      const drafts = createTestServices().drafts;
      const portugal = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const reload = async () => {
        const fresh = createTestServices({
          snapshot: fixtureSnapshot(),
          nowMs: fixtureNowMs('buy'),
          rules: portugal,
          drafts,
        });
        await act(() => fresh.start());
        return fresh;
      };
      const first = await reload();
      await renderForm({ kind: 'dca' }, [], first);
      expect(value('BTC paid (EUR)')).toBe('70,00');
      type('BTC received (units)', '0.0012');
      fireEvent.blur(screen.getByLabelText('BTC received (units)'));
      type('ETH received (units)', '0.012');
      expect(value('BTC received (units)')).toBe('0,0012');
      first.dispose();
      const second = await reload();
      await reopen(second, { kind: 'dca' });
      expect(value('BTC received (units)')).toBe('0,0012');
      expect(value('ETH received (units)')).toBe('0.012');
      second.dispose();
    });

    it('drops a stored draft that does not keep the form as it opened', async () => {
      const drafts = createTestServices().drafts;
      const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts }));
      type('BTC paid (EUR)', '120.00');
      const { opened: _, ...legacy } = drafts.read('entry', 'new:extra:none', anything) as { opened: unknown };
      drafts.write('entry', 'new:extra:none', legacy);
      await reopen(services);
      expect(value('BTC paid (EUR)')).toBe('');
      expect(drafts.read('entry', 'new:extra:none', anything)).toBeNull();
    });

    it('works without a draft and reports nothing when the storage throws', async () => {
      const reported = vi.fn();
      setErrorReporter(reported);
      const blocked = sessionDrafts(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      const { services } = await renderForm({}, undefined, servicesWith([older, october], { drafts: blocked }));
      type('BTC paid (EUR)', '120.00');
      const { onDone } = await reopen(services);
      expect(value('BTC paid (EUR)')).toBe('');
      type('BTC paid (EUR)', '120.00');
      await save();
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(reported).not.toHaveBeenCalled();
      setErrorReporter(() => undefined);
    });
  });

  // "Record a sale" (session 15): the units sold, the money received, and the holding warning that never blocks.
  describe('a sale', () => {
    const text = (element: HTMLElement) => element.textContent?.replace(/ /g, ' ');

    it('names the excess and the units held when the sale is more than the holdings, and saves nothing', async () => {
      const { services, onDone } = await renderForm({ kind: 'sell' });
      expect(screen.queryByLabelText('BTC paid (EUR)')).toBeNull();
      type('BTC sold (units)', '0.006');
      type('Received for BTC (EUR)', '360.00');
      await save();
      expect(text(screen.getByRole('alert'))).toBe(
        'This sale is 0.001 BTC more than you hold (0.005 BTC on 20 Oct 2026). Check the amount and the date, or log the missing purchases first.',
      );
      expect(onDone).not.toHaveBeenCalled();
      expect(stored(services).some((entry) => entry.kind === 'sell')).toBe(false);
    });

    it('warns when more is sold than is past the holding rule, and still saves', async () => {
      const past = { ...older, units: units('0.10') };
      const recent = { ...october, units: units('0.05') };
      const { services, onDone } = await renderForm({ kind: 'sell' }, [past, recent]);
      expect(screen.queryByRole('status')).toBeNull();
      type('BTC sold (units)', '0.15');
      type('Received for BTC (EUR)', '9000.00');
      // CONTENT-STYLE §3 "Holding warning on a sale": prose figures, the sale's date, the effect's second sentence.
      expect(text(screen.getByRole('status'))).toBe(
        'Only 0.10 of the 0.15 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
      );
      // LEGAL §4: the data line once, beside the holding status.
      expect(screen.getAllByText('Computed from your dates, not tax advice')).toHaveLength(1);
      type('BTC sold (units)', '0.10');
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('Computed from your dates, not tax advice')).toBeNull();
      type('BTC sold (units)', '0.15');
      await save();
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(stored(services).filter((entry) => entry.kind === 'sell')).toMatchObject([
        { coin: 'BTC', date: '2026-10-20', units: '0.15', amount: '9000' },
      ]);
    });

    // #136: none past the rule says "None of", never "Only 0.000 of".
    it('says none of the sale is past the holding rule when nothing sold is', async () => {
      await renderForm({ kind: 'sell' }, [october]);
      type('BTC sold (units)', '0.001');
      type('Received for BTC (EUR)', '60.00');
      expect(text(screen.getByRole('status'))).toBe(
        'None of the 0.001 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.',
      );
    });

    // DOMAIN §3.7: Portugal matches lots per platform, so BTC at Kraken past the rule leave a sale at Bitvavo taxed.
    it('in Portugal, warns on a sale at Bitvavo although older BTC at Kraken are past the rule', async () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const entries = [
        { ...older, venue: 'Kraken' },
        { ...october, venue: 'Bitvavo' },
      ];
      await renderForm({ kind: 'sell' }, entries, servicesWith(entries, { rules }));
      type('Venue (optional)', 'Bitvavo');
      type('BTC sold (units)', '0,002');
      type('Received for BTC (EUR)', '120,00');
      expect(text(screen.getByRole('status'))).toBe(
        'None of the 0,002 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.',
      );
      type('Venue (optional)', 'Kraken');
      expect(screen.queryByRole('status')).toBeNull();
    });

    // Review round 1 of the venue fix: the Log groups sales by kind and date, so one row can hold two sales of a coin at
    // two venues; each counts the venue of the entry its row was loaded from, as the save keeps it (DOMAIN §3.7).
    it('in Portugal, warns on the Bitpanda sale of an edited row that also holds a Kraken sale of the coin', async () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
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
      await renderForm({ kind: 'sell', editing: [a, b] }, entries, servicesWith(entries, { rules }));
      expect(text(screen.getByRole('status'))).toBe(
        'None of the 0,002 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.',
      );
    });

    // A cleared row's own sale is the one the save deletes; the others keep their entries and when each was logged,
    // which orders same-day sales (DOMAIN §6, Edit a transaction).
    describe('in a grouped edit of sales of one coin, with one row cleared and saved', () => {
      const owned = anEntry({ kind: 'extra', date: date('2024-01-10'), slot: null, units: units('3') });
      const logged = (quantity: string, amount: string, moment: string) =>
        anEntry({
          kind: 'sell',
          date: date('2026-10-20'),
          slot: null,
          units: units(quantity),
          amount: money(amount),
          createdAt: instant(`2026-10-20T${moment}:00Z`),
        });
      const clear = async (at: number, editing: readonly Entry[]) => {
        const all = [owned, ...editing];
        const { services } = await renderForm({ kind: 'sell', editing }, all);
        fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[at]!, { target: { value: '' } });
        fireEvent.change(screen.getAllByLabelText('Received for BTC (EUR)')[at]!, { target: { value: '' } });
        await save();
        const sales = stored(services).filter((entry) => entry.kind === 'sell');
        return { live: sales.filter((entry) => entry.deletedAt === null), sales };
      };

      it('of three sales, the middle cleared, keeps the other two under their own entries', async () => {
        const first = logged('0.6', '36000', '10:00');
        const middle = logged('0.55', '33000', '09:00');
        const last = logged('0.5', '30000', '11:00');
        const { live, sales } = await clear(1, [first, middle, last]);
        expect(live).toMatchObject([
          { id: first.id, createdAt: first.createdAt, units: '0.6' },
          { id: last.id, createdAt: last.createdAt, units: '0.5' },
        ]);
        expect(sales.find((entry) => entry.id === middle.id)?.deletedAt).not.toBeNull();
      });

      it('of two sales, the first cleared, keeps the second under its own entry', async () => {
        const larger = logged('1.5', '90000', '09:00');
        const smaller = logged('1.2', '72000', '08:00');
        const { live, sales } = await clear(0, [larger, smaller]);
        expect(live).toMatchObject([{ id: smaller.id, createdAt: smaller.createdAt, units: '1.2' }]);
        expect(sales.find((entry) => entry.id === larger.id)?.deletedAt).not.toBeNull();
      });
    });

    // Two warnings of one coin (a sale at each of two venues) render apart, without a React key collision.
    it('in Portugal, shows both warnings of an edited row with a BTC sale at Kraken and one at Bitpanda', async () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const bought = { kind: 'extra', slot: null, units: units('0.01'), date: date('2026-09-01') } as const;
      const sold = { kind: 'sell', date: date('2026-10-20'), slot: null } as const;
      const a = anEntry({ ...sold, units: units('0.001'), amount: money('60'), venue: 'Kraken' });
      const b = anEntry({ ...sold, units: units('0.002'), amount: money('120'), venue: 'Bitpanda' });
      const entries = [anEntry({ ...bought, venue: 'Kraken' }), anEntry({ ...bought, venue: 'Bitpanda' }), a, b];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await renderForm({ kind: 'sell', editing: [a, b] }, entries, servicesWith(entries, { rules }));
        // Two warnings of one coin at two venues name them, so each reads apart from the other.
        expect(screen.getAllByRole('status').map(text)).toEqual([
          'None of the 0,001 BTC sold at Kraken is past the holding rule on 20 Oct 2026. It may be taxed.',
          'None of the 0,002 BTC sold at Bitpanda is past the holding rule on 20 Oct 2026. It may be taxed.',
        ]);
        const collisions = errorSpy.mock.calls.filter((call) =>
          call.some((part) => String(part).includes('Encountered two children with the same key')),
        );
        expect(collisions).toEqual([]);
      } finally {
        errorSpy.mockRestore();
      }
    });

    // DOMAIN §3.7: a sale its venue cannot cover takes other venues' lots, so the save matches the edit's sales at every
    // venue together, and so does the warning. Ledger holds 1 BTC past the rule, Kraken BTC inside it, Bitvavo none.
    describe('in Portugal, a grouped edit of BTC sales at Bitvavo and Ledger, one row cleared and saved', () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const bought = (on: string, quantity: string, venue: string) =>
        anEntry({ kind: 'extra', date: date(on), slot: null, units: units(quantity), venue });
      const logged = (quantity: string, amount: string, venue: string, moment: string) =>
        anEntry({
          kind: 'sell',
          date: date('2026-10-20'),
          slot: null,
          units: units(quantity),
          amount: money(amount),
          venue,
          createdAt: instant(`2026-10-20T${moment}:00Z`),
        });
      const ledger = bought('2024-01-10', '1', 'Ledger');
      const clear = async (at: number, lots: readonly Entry[], editing: readonly Entry[]) => {
        const all = [...lots, ...editing];
        const { services } = await renderForm({ kind: 'sell', editing }, all, servicesWith(all, { rules }));
        fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[at]!, { target: { value: '' } });
        fireEvent.change(screen.getAllByLabelText('Received for BTC (EUR)')[at]!, { target: { value: '' } });
        const warnings = screen.getAllByRole('status').map(text);
        await save();
        const live = stored(services).filter((entry) => entry.deletedAt === null);
        return { warnings, sales: matchLots(live, BTC.id, 'per-venue').sales };
      };

      // The Bitvavo sale, logged first, takes Ledger's lot past the rule; the Ledger sale then takes Kraken's.
      it('of two sales kept, warns on the Ledger sale as well as the Bitvavo one', async () => {
        const kraken = bought('2026-09-01', '1.5', 'Kraken');
        const bitvavo = logged('1', '60000', 'Bitvavo', '08:00');
        const onLedger = logged('1', '60000', 'Ledger', '09:00');
        const cleared = logged('0.5', '30000', 'Ledger', '07:00');
        const { warnings, sales } = await clear(2, [ledger, kraken], [bitvavo, onLedger, cleared]);
        expect(warnings).toEqual([
          'None of the 1 BTC sold at Bitvavo is past the holding rule on 20 Oct 2026. It may be taxed.',
          'None of the 1 BTC sold at Ledger is past the holding rule on 20 Oct 2026. It may be taxed.',
        ]);
        expect(sales.map((sale) => [sale.id, sale.takes])).toEqual([
          [bitvavo.id, [{ lot: ledger.id, units: '1', venue: 'Ledger', since: null }]],
          [onLedger.id, [{ lot: kraken.id, units: '1', venue: 'Kraken', since: null }]],
        ]);
      });

      it('of three sales kept, warns on each the matching gives no Ledger lot past the rule', async () => {
        const kraken = bought('2026-09-01', '2', 'Kraken');
        const bitvavo = logged('1', '60000', 'Bitvavo', '08:00');
        const onLedger = logged('1', '60000', 'Ledger', '09:00');
        const later = logged('0.5', '30000', 'Bitvavo', '10:00');
        const cleared = logged('0.5', '30000', 'Ledger', '07:00');
        const { warnings, sales } = await clear(3, [ledger, kraken], [bitvavo, onLedger, later, cleared]);
        expect(warnings).toEqual([
          'None of the 1 BTC sold at Bitvavo is past the holding rule on 20 Oct 2026. It may be taxed.',
          'None of the 1 BTC sold at Ledger is past the holding rule on 20 Oct 2026. It may be taxed.',
          'None of the 0,5 BTC sold at Bitvavo is past the holding rule on 20 Oct 2026. It may be taxed.',
        ]);
        expect(sales.map((sale) => [sale.id, sale.takes])).toEqual([
          [bitvavo.id, [{ lot: ledger.id, units: '1', venue: 'Ledger', since: null }]],
          [onLedger.id, [{ lot: kraken.id, units: '1', venue: 'Kraken', since: null }]],
          [later.id, [{ lot: kraken.id, units: '0.5', venue: 'Kraken', since: null }]],
        ]);
      });
    });

    // The integration read of the venue fix: one edited row can hold two sales of a coin at one venue; the save matches
    // them one after another against that venue's lots, and replaces every entry being edited (DOMAIN §3.7).
    describe('in Portugal, an edited row with two sales of 0.6 BTC at Kraken, which holds 1.0 past the rule', () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const sold = {
        kind: 'sell',
        date: date('2026-10-20'),
        slot: null,
        units: units('0.6'),
        venue: 'Kraken',
      } as const;
      const a = anEntry({ ...sold, amount: money('36000') });
      const b = anEntry({ ...sold, amount: money('36000') });
      const owned = anEntry({
        kind: 'extra',
        date: date('2024-01-10'),
        slot: null,
        units: units('1'),
        venue: 'Kraken',
      });
      const entries = [owned, a, b];

      it('warns on the second sale', async () => {
        await renderForm({ kind: 'sell', editing: [a, b] }, entries, servicesWith(entries, { rules }));
        expect(text(screen.getByRole('status'))).toBe(
          'Only 0,4 of the 0,6 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
        );
      });

      // The Log lists the larger sale first; the save matches the one logged first first, as the warning does.
      it('warns on the larger sale when it was logged after the smaller one', async () => {
        const recent = anEntry({
          kind: 'extra',
          date: date('2026-09-01'),
          slot: null,
          units: units('1'),
          venue: 'Kraken',
        });
        const small = anEntry({
          ...sold,
          units: units('0.3'),
          amount: money('18000'),
          createdAt: instant('2026-10-20T08:00:00Z'),
        });
        const large = anEntry({
          ...sold,
          units: units('0.9'),
          amount: money('54000'),
          createdAt: instant('2026-10-20T09:00:00Z'),
        });
        const stored = [owned, recent, small, large];
        await renderForm({ kind: 'sell', editing: [large, small] }, stored, servicesWith(stored, { rules }));
        expect(text(screen.getByRole('status'))).toBe(
          'Only 0,7 of the 0,9 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
        );
      });

      it('warns on nothing once one row is cleared, since the save keeps one sale of 0.6', async () => {
        await renderForm({ kind: 'sell', editing: [a, b] }, entries, servicesWith(entries, { rules }));
        fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[0]!, { target: { value: '' } });
        expect(screen.queryByRole('status')).toBeNull();
      });

      // A cleared row's own sale is the one the save deletes; the others keep their entries and when each was logged,
      // which orders same-day sales (DOMAIN §6), so the warning names the sale the save stores.
      describe('with one row cleared and saved', () => {
        const recent = anEntry({
          kind: 'extra',
          date: date('2026-09-01'),
          slot: null,
          units: units('1'),
          venue: 'Kraken',
        });
        const logged = (quantity: string, amount: string, moment: string) =>
          anEntry({
            ...sold,
            units: units(quantity),
            amount: money(amount),
            createdAt: instant(`2026-10-20T${moment}:00Z`),
          });
        const clear = async (at: number, editing: readonly Entry[]) => {
          const all = [owned, recent, ...editing];
          const { services } = await renderForm({ kind: 'sell', editing }, all, servicesWith(all, { rules }));
          fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[at]!, { target: { value: '' } });
          fireEvent.change(screen.getAllByLabelText('Received for BTC (EUR)')[at]!, { target: { value: '' } });
          const warning = text(screen.getByRole('status'));
          await save();
          const sales = stored(services).filter((entry) => entry.kind === 'sell');
          return { warning, live: sales.filter((entry) => entry.deletedAt === null), sales };
        };

        it('of three sales, the middle cleared, warns on the one logged last and keeps each under its own entry', async () => {
          const first = logged('0.6', '36000', '10:00');
          const middle = logged('0.55', '33000', '09:00');
          const last = logged('0.5', '30000', '11:00');
          const { warning, live, sales } = await clear(1, [first, middle, last]);
          expect(warning).toBe(
            'Only 0,4 of the 0,5 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
          );
          expect(live).toMatchObject([
            { id: first.id, createdAt: first.createdAt, units: '0.6' },
            { id: last.id, createdAt: last.createdAt, units: '0.5' },
          ]);
          expect(sales.find((entry) => entry.id === middle.id)?.deletedAt).not.toBeNull();
        });

        it('of two sales, the first cleared, keeps the second under its own entry', async () => {
          const larger = logged('1.5', '90000', '09:00');
          const smaller = logged('1.2', '72000', '08:00');
          const { warning, live, sales } = await clear(0, [larger, smaller]);
          expect(warning).toBe(
            'Only 1,0 of the 1,2 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
          );
          expect(live).toMatchObject([{ id: smaller.id, createdAt: smaller.createdAt, units: '1.2' }]);
          expect(sales.find((entry) => entry.id === larger.id)?.deletedAt).not.toBeNull();
        });

        // Each sale gets the units the lot matching gives it, in the order of date, createdAt and id (DOMAIN §3.7).
        it('of three sales, none cleared, warns on each sale the matching gives units inside the rule', async () => {
          const editing = [
            logged('0.6', '36000', '10:00'),
            logged('0.55', '33000', '09:00'),
            logged('0.5', '30000', '11:00'),
          ];
          const all = [owned, recent, ...editing];
          await renderForm({ kind: 'sell', editing }, all, servicesWith(all, { rules }));
          expect(screen.getAllByRole('status').map(text)).toEqual([
            'Only 0,45 of the 0,60 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
            'None of the 0,5 BTC sold is past the holding rule on 20 Oct 2026. It may be taxed.',
          ]);
        });

        it('of two sales logged at one moment (the prototype import), warns on the one the lots match second', async () => {
          const small = logged('0.3', '18000', '10:00');
          const large = logged('0.9', '54000', '10:00');
          const all = [owned, recent, large, small];
          await renderForm({ kind: 'sell', editing: [large, small] }, all, servicesWith(all, { rules }));
          expect(text(screen.getByRole('status'))).toBe(
            'Only 0,7 of the 0,9 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed.',
          );
        });
      });
    });

    // DOMAIN §3.7 and §6: the move line reads the entries the save stores, each row first on its own entry (rowEntries),
    // the venue kept. Kraken and Ledger hold 1 BTC each; a move of 1 BTC from Kraken to Ledger follows the sales.
    describe('in Portugal, a grouped edit of BTC sales at Kraken and Ledger before a move to Ledger', () => {
      const rules = async () => {
        const profile = await loadProfile('PT');
        return profile === null ? null : countryRules(profile);
      };
      const lot = (venue: string) =>
        anEntry({ kind: 'extra', date: date('2024-01-10'), slot: null, units: units('1'), venue });
      const logged = (quantity: string, venue: string, moment: string) =>
        anEntry({
          kind: 'sell',
          date: date('2026-10-01'),
          slot: null,
          units: units(quantity),
          amount: money('100'),
          venue,
          createdAt: instant(`2026-10-01T${moment}:00Z`),
        });
      const moved = aMove({ date: date('2026-10-15'), units: units('1'), received: units('1') });
      /** Clears row `at`, types `typed` units into row `raised`, and returns the status lines before Save. */
      const edit = async (editing: readonly Entry[], at: number, raised: number, typed: string) => {
        const all = [lot('Kraken'), lot('Ledger'), ...editing, moved];
        const { services, onDone } = await renderForm({ kind: 'sell', editing }, all, servicesWith(all, { rules }));
        fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[at]!, { target: { value: '' } });
        fireEvent.change(screen.getAllByLabelText('Received for BTC (EUR)')[at]!, { target: { value: '' } });
        fireEvent.change(screen.getAllByLabelText('BTC sold (units)')[raised]!, { target: { value: typed } });
        const lines = screen.getAllByRole('status').map(text);
        await save();
        return { lines, onDone, services };
      };
      const line =
        "After this change, your move to Ledger on 15 Oct 2026 sends 1 BTC more than the Log shows outside Ledger that day. Check that move's date and venues in the Log after you save.";

      it('a grouped Log edit with two and with three sales of one coin, one row cleared, shows the move line from the entries rowEntries keeps', async () => {
        // Two: the Ledger sale cleared, the Kraken sale raised to 1 BTC takes all of Kraken's.
        const two = await edit([logged('0.5', 'Kraken', '08:00'), logged('0.5', 'Ledger', '09:00')], 1, 0, '1');
        expect(two.lines).toEqual([line]);
        expect(two.onDone).toHaveBeenCalledOnce();
        cleanup();
        // Three: the middle Ledger sale cleared; the last row keeps its own Kraken sale, raised to 0,6 BTC.
        const kraken = logged('0.3', 'Kraken', '10:00');
        const three = await edit(
          [logged('0.4', 'Kraken', '08:00'), logged('0.3', 'Ledger', '09:00'), kraken],
          1,
          2,
          '0,6',
        );
        expect(three.lines).toEqual([line]);
        expect(stored(three.services).find((entry) => entry.id === kraken.id)).toMatchObject({
          units: '0.6',
          venue: 'Kraken',
        });
      });
    });

    // #136 (DOMAIN §3.7): a sale dated before the purchases that cover it is refused, with the units held that day.
    it('refuses a sale dated before its purchase and names what was held on that date', async () => {
      const { services } = await renderForm({ kind: 'sell' }, [october]);
      type('Date', '2026-09-20');
      type('BTC sold (units)', '0.001');
      type('Received for BTC (EUR)', '60.00');
      await save();
      expect(text(screen.getByRole('alert'))).toBe(
        'This sale is 0.001 BTC more than you hold (0 BTC on 20 Sept 2026). Check the amount and the date, or log the missing purchases first.',
      );
      expect(stored(services).some((entry) => entry.kind === 'sell')).toBe(false);
    });

    it('refuses to move a purchase after the sale it covers, and says which sale', async () => {
      const sale = anEntry({ kind: 'sell', date: date('2026-10-10'), slot: null, units: units('0.005') });
      const { services, onDone } = await renderForm({ kind: 'dca', editing: [october] }, [older, october, sale]);
      type('Date', '2026-10-15');
      await save();
      expect(text(screen.getByRole('alert'))).toBe(
        'This change leaves a later BTC sale without the purchases that cover it. Change or delete the sale first.',
      );
      expect(onDone).not.toHaveBeenCalled();
      expect(stored(services).find((entry) => entry.id === october.id)?.date).toBe('2026-10-01');
    });

    // #201's evaluator (DESIGN §6): the refusal names another entry, which no field of the form can fix, and a sheet
    // too short for the field and the line scrolled the focused field out of view.
    describe('the focus after a refusal', () => {
      const sale = anEntry({ kind: 'sell', date: date('2026-10-10'), slot: null, units: units('0.005') });
      const refuse = async (from: () => HTMLElement) => {
        await renderForm({ kind: 'dca', editing: [october] }, [older, october, sale]);
        type('Date', '2026-10-15');
        const focused = from();
        focused.focus();
        await act(async () => void fireEvent.submit(focused.closest('form') as HTMLFormElement));
        return focused;
      };

      it('moves the focus to the alert line when the save is refused from a field', async () => {
        await refuse(() => screen.getByLabelText('Date'));
        const line = screen.getByRole('alert');
        expect(line.textContent).toContain('later BTC sale');
        expect(document.activeElement).toBe(line);
        expect(line.getAttribute('tabindex')).toBe('-1');
      });

      it('keeps the focus on Save when the save is refused from Save', async () => {
        const button = await refuse(() => screen.getByRole('button', { name: 'Save' }));
        expect(screen.getByRole('alert').textContent).toContain('later BTC sale');
        expect(document.activeElement).toBe(button);
      });
    });

    // JURISDICTIONS §1: past a lower-rate rule the rest is taxed too, so the sentence never implies an exemption.
    it("words the rest by the rule's effect: a lower rate is not an exemption", async () => {
      const lowerRate = aPlan({ holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' } });
      const entries = [
        { ...older, units: units('0.5') },
        { ...october, units: units('0.25') },
      ];
      await renderForm({ kind: 'sell' }, entries, servicesWith(entries, {}, lowerRate));
      type('BTC sold (units)', '0.75');
      type('Received for BTC (EUR)', '45000.00');
      expect(text(screen.getByRole('status'))).toBe(
        'Only 0.50 of the 0.75 BTC sold are past the holding rule on 20 Oct 2026. The rest may be taxed at the short-term rate.',
      );
    });
  });

  // DOMAIN §2.2: coins the plan did not buy (`held`), with a cost that may be unknown or nothing.
  describe('coins added', () => {
    const portugal = async () => {
      const profile = await loadProfile('PT');
      return profile === null ? null : countryRules(profile);
    };
    const added = (services: Services) => stored(services).filter((entry) => entry.kind === 'held');

    it('stores no cost for units saved alone, with no fee field and no filled price', async () => {
      const { services, onDone } = await renderForm({ kind: 'held' });
      expect(screen.queryByLabelText(/^Fee/)).toBeNull();
      expect(screen.getByLabelText<HTMLInputElement>('BTC price (EUR)').value).toBe('');
      type('Date', '2024-03-15');
      type('BTC received (units)', '0.5');
      expect(screen.getByLabelText<HTMLInputElement>('BTC cost (EUR, if known)').value).toBe('');
      await save();
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(added(services)).toMatchObject([
        { coin: 'BTC', date: '2024-03-15', units: '0.5', amount: null, fee: null, venue: null, slot: null },
      ]);
    });

    it('asks for the units first, then the cost, then the price (CONTENT-STYLE §3)', async () => {
      await renderForm({ kind: 'held' });
      const labels = [...screen.getByRole('group', { name: 'BTC' }).querySelectorAll('label')];
      expect(labels.map((label) => label.textContent)).toEqual([
        'BTC received (units)',
        'BTC cost (EUR, if known)',
        'BTC price (EUR)',
      ]);
    });

    it('stores a cost of 0 when nothing was paid', async () => {
      const { services } = await renderForm({ kind: 'held' });
      type('Date', '2024-03-15');
      type('BTC cost (EUR, if known)', '0');
      type('BTC received (units)', '0.5');
      await save();
      expect(added(services)).toMatchObject([{ coin: 'BTC', units: '0.5', amount: '0' }]);
    });

    it('refuses a save with no date, moves the focus to the date, and names the fix in its description', async () => {
      const { services, onDone } = await renderForm({ kind: 'held' });
      type('BTC received (units)', '0.5');
      await save();
      const field = screen.getByLabelText('Date');
      expect(document.activeElement).toBe(field);
      const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((one) => one !== '');
      const description = described.map((one) => document.getElementById(one)?.textContent ?? '').join(' ');
      expect(description).toContain('Choose a full date: day, month, and year.');
      expect(description).toContain('The day you bought or received them.');
      expect(onDone).not.toHaveBeenCalled();
      expect(added(services)).toEqual([]);
    });

    // JURISDICTIONS §1: the reason to date late is a holding rule, so it shows only where the country has one.
    describe('the date description', () => {
      const RULE_SENTENCE = 'If you are not sure, the latest possible day never starts a holding rule too early.';
      const rulesOf = (country: string) => async () => {
        const profile = await loadProfile(country);
        return profile === null ? null : countryRules(profile);
      };
      const described = async (country: 'PT' | 'IT') => {
        const services = servicesWith([], { rules: rulesOf(country) }, aPlan({ country }));
        await renderForm({ kind: 'held' }, [], services);
        const field = screen.getByLabelText('Date');
        const ids = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((one) => one !== '');
        return ids.map((one) => document.getElementById(one)?.textContent ?? '').join(' ');
      };

      it('names the holding rule in Portugal', async () => {
        const text = await described('PT');
        expect(text).toContain('The day you bought or received them.');
        expect(text).toContain(RULE_SENTENCE);
        expect(text).toContain('The value chart counts the coins from that day.');
      });

      it('leaves the holding rule out in Italy, which has none', async () => {
        const text = await described('IT');
        expect(text).toContain('The day you bought or received them.');
        expect(text).not.toContain('holding rule');
        expect(text).toContain('The value chart counts the coins from that day.');
      });
    });

    it('shows the venue empty without opening the panel, and saves it', async () => {
      const { services } = await renderForm({ kind: 'held' });
      expect(screen.getByLabelText<HTMLInputElement>('Venue (optional)').value).toBe('');
      type('Date', '2024-03-15');
      type('BTC received (units)', '0.5');
      type('Venue (optional)', 'Ledger');
      await save();
      expect(added(services)).toMatchObject([{ venue: 'Ledger' }]);
    });

    it('refuses a venue that is too long and moves the focus to it', async () => {
      const { services } = await renderForm({ kind: 'held' });
      type('Date', '2024-03-15');
      type('BTC received (units)', '0.5');
      type('Venue (optional)', 'x'.repeat(VENUE_MAX_LENGTH + 1));
      await save();
      const venue = screen.getByLabelText('Venue (optional)');
      expect(venue.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(venue);
      expect(added(services)).toEqual([]);
    });

    // The save keeps each row's own entry (`rowEntries`); a cleared row's entry is the one soft-deleted (DOMAIN §6).
    describe('a grouped edit of one coin, one row cleared', () => {
      const one = { kind: 'held', date: date('2024-03-15'), slot: null, fee: null, amount: null } as const;
      const a = anEntry({ ...one, units: units('0.1'), venue: 'Ledger' });
      const b = anEntry({ ...one, units: units('0.2'), venue: 'Trezor', amount: money('0') });
      const c = anEntry({ ...one, units: units('0.3'), venue: 'Kraken' });
      const clear = (at: number) => {
        fireEvent.change(screen.getAllByLabelText('BTC cost (EUR, if known)')[at] as HTMLElement, {
          target: { value: '' },
        });
        fireEvent.change(screen.getAllByLabelText('BTC received (units)')[at] as HTMLElement, {
          target: { value: '' },
        });
      };

      it('of two rows keeps the other row as stored', async () => {
        const { services, onDone } = await renderForm({ kind: 'held', editing: [a, b] }, [a, b]);
        clear(0);
        await save();
        expect(onDone).toHaveBeenCalledTimes(1);
        const kept = added(services);
        expect(kept.filter((entry) => entry.deletedAt === null)).toMatchObject([
          { id: b.id, units: '0.2', amount: '0', venue: 'Trezor' },
        ]);
        expect(kept.find((entry) => entry.id === a.id)?.deletedAt).not.toBeNull();
      });

      it('of three rows keeps the two others with their own costs and venues', async () => {
        const { services } = await renderForm({ kind: 'held', editing: [a, b, c] }, [a, b, c]);
        clear(1);
        await save();
        const kept = added(services);
        expect(kept.filter((entry) => entry.deletedAt === null)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: a.id, units: '0.1', amount: null, venue: 'Ledger' }),
            expect.objectContaining({ id: c.id, units: '0.3', amount: null, venue: 'Kraken' }),
          ]),
        );
        expect(kept.filter((entry) => entry.deletedAt === null)).toHaveLength(2);
        expect(kept.find((entry) => entry.id === b.id)?.deletedAt).not.toBeNull();
      });
    });

    // DOMAIN §3.7: under per-venue lots the venue decides the warning, so a sale shows it beside the units.
    it('in Portugal, shows a sale its venue, prefilled, without opening the panel', async () => {
      const entries = [{ ...older, venue: 'Kraken' }];
      await renderForm({ kind: 'sell' }, entries, servicesWith(entries, { rules: portugal }));
      expect(screen.getByLabelText<HTMLInputElement>('Venue (optional)').value).toBe('Kraken');
    });

    it('keeps the venue of a sale in the panel where lots are matched across venues', async () => {
      await renderForm({ kind: 'sell' });
      expect(screen.queryByLabelText('Venue (optional)')).toBeNull();
    });
  });

  // ADR-0055: a move's network fee stays covered by a purchase dated on or before the move.
  it('shows before Save the move a venue edit leaves short, and saves the edit', async () => {
    // The move's fee is then taken at Ledger, so the line shows in every country (DOMAIN §3.7).
    const move = aMove({
      date: date('2026-01-10'),
      venue: 'Wallet A',
      units: units('0.003'),
      received: units('0.0028'),
    });
    const { services, onDone } = await renderForm({ kind: 'extra', editing: [older] }, [older, move]);
    fireEvent.click(screen.getByRole('button', { name: 'Venue and note' }));
    expect(screen.queryByRole('status')).toBeNull();
    type('Venue (optional)', 'Ledger');
    expect(screen.getByRole('status').textContent?.replace(/\u00a0/g, ' ')).toBe(
      "After this change, your move to Ledger on 10 Jan 2026 sends 0.003 BTC more than the Log shows outside Ledger that day. Check that move's date and venues in the Log after you save.",
    );
    await save();
    expect(onDone).toHaveBeenCalledOnce();
    expect(stored(services).find((entry) => entry.id === older.id)?.venue).toBe('Ledger');
  });

  it("a purchase date edit refused for a move's fee names the move, not a sale", async () => {
    const move = aMove({
      date: date('2026-01-10'),
      venue: 'Wallet A',
      units: units('0.003'),
      received: units('0.0028'),
    });
    const { services, onDone } = await renderForm({ kind: 'extra', editing: [older] }, [older, move]);
    type('Date', '2026-10-18');
    await save();
    expect(screen.getByRole('alert').textContent?.replace(/ /g, ' ')).toBe(
      'This change leaves your BTC move on 10 Jan 2026 without the units its network fee takes (0 BTC held before it). Check that move and the entries before it in the Log.',
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(stored(services).find((entry) => entry.id === older.id)?.date).toBe('2025-09-01');
  });
});
