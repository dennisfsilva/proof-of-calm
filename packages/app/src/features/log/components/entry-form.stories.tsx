import { countryRules, loadProfile } from '@proofofcalm/content';
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, month, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import { EntryForm } from './entry-form';

// The entry form over the test services (20 Oct 2026, BTC at €60,000.12): 0.003 BTC bought on
// 1 Sep 2025 and 0.002 BTC on 1 Oct 2026.
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
const services = (entries: readonly Entry[]) => () =>
  createTestServices({ snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES } });
// Portugal's rules as the browser loads them: lots per venue, so a sale names its venue up front.
const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const meta = {
  title: 'Features/Log/EntryForm',
  component: EntryForm,
  args: { kind: 'dca', editing: [], onDone: fn() },
  parameters: { services: services([older]) },
} satisfies Meta<typeof EntryForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NewBuy: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('BTC paid (EUR)')).toHaveValue('70.00');
    await expect(canvas.getByLabelText('BTC received (units)')).toHaveValue('0.00116666');
  },
};

export const Edit: Story = {
  args: { editing: [october] },
  parameters: { services: services([older, october]) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('BTC paid (EUR)')).toHaveValue('70.00');
    await expect(canvas.getByLabelText('BTC received (units)')).toHaveValue('0.002');
  },
};

// A refused save (session 21's evaluator): October's buy moved after the 10 Oct sale it covers. Enter on Save shows
// the alert line, which announces itself, and the focus stays on Save, never on the body (docs/DESIGN.md §6). The
// store answers after 100 ms, as IndexedDB may: a save that outlasts a frame once let the browser drop the focus
// from the pending, disabled button.
const sale = anEntry({ kind: 'sell', date: date('2026-10-10'), slot: null, units: units('0.005') });
const slowStore = () => {
  const store = memoryPlanStore({ ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [older, october, sale] });
  const update = store.update.bind(store);
  return {
    ...store,
    update: async (build: Parameters<typeof update>[0]) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return update(build);
    },
  };
};
export const RefusedSaveKeepsFocus: Story = {
  args: { editing: [october] },
  parameters: {
    services: () =>
      createTestServices({
        snapshot: {
          ...EMPTY_SNAPSHOT,
          prefs: DEFAULT_PREFS,
          plan,
          entries: [older, october, sale],
          prices: TEST_PRICES,
        },
        planStore: slowStore(),
      }),
  },
  play: async ({ canvas }) => {
    const day = await canvas.findByLabelText('Date');
    await userEvent.clear(day);
    await userEvent.type(day, '2026-10-15');
    const save = canvas.getByRole('button', { name: 'Save' });
    save.focus();
    await userEvent.keyboard('{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/your BTC sale on/);
    await expect(save).toHaveFocus();
  },
};

// A sale of 0.004 BTC on 20 Oct 2026, when only the 0.003 BTC of 1 Sep 2025 is past the 365-day rule: the holding
// warning shows above the fee and the save stays open.
export const SaleWithHoldingWarning: Story = {
  args: { kind: 'sell' },
  parameters: { services: services([older, october]) },
  play: async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText('BTC sold (units)'), '0.004');
    await userEvent.type(canvas.getByLabelText('Received for BTC (EUR)'), '240');
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      /^Only 0\.003 of the 0\.004\sBTC sold are past the holding rule on 20 Oct 2026\. The rest may be taxed\.$/,
    );
    await expect(canvas.getByText('Computed from your dates, not tax advice')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeEnabled();
  },
};

// Coins already held (CONTENT-STYLE §3): no date, venue or fee to start with, the cost optional and the venue shown
// up front. Save with no date moves the focus to Date, whose description is read with the error and, under Portugal's
// holding rule, names that rule.
export const CoinsAdded: Story = {
  args: { kind: 'held' },
  parameters: {
    services: () =>
      createTestServices({
        snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [older], prices: TEST_PRICES },
        rules: portugal,
      }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('BTC cost (EUR, if known)')).toHaveValue('');
    await expect(canvas.queryByLabelText(/^Fee/)).toBeNull();
    await expect(canvas.getByLabelText('Venue (optional)')).toHaveValue('');
    await expect(canvas.getByRole('button', { name: 'Add a note' })).toBeVisible();
    await userEvent.type(canvas.getByLabelText('BTC received (units)'), '0.5');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByLabelText('Date')).toHaveFocus());
    await expect(canvas.getByLabelText('Date')).toHaveAccessibleDescription(
      /latest possible day never starts a holding rule too early/,
    );
  },
};

// A sale under Portugal's rules, where lots are kept per venue: the venue shows above the note, already filled.
export const SaleWithVenueUpFront: Story = {
  args: { kind: 'sell' },
  parameters: {
    services: () =>
      createTestServices({
        snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [older], prices: TEST_PRICES },
        rules: portugal,
      }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('Venue (optional)')).toHaveValue('Wallet A');
    await expect(canvas.getByRole('button', { name: 'Add a note' })).toBeVisible();
  },
};

// A grouped edit of two sales on one day at different venues (#10): the Venue field opens empty and the line under the
// form's hint names both venues, since a venue typed there applies to every sale.
const saleAt = (venue: string, moment: string) =>
  anEntry({
    kind: 'sell',
    date: date('2026-10-05'),
    slot: null,
    units: units('0.001'),
    venue,
    createdAt: instant(`2026-10-05T${moment}:00Z`),
  });
const grouped = [saleAt('Wallet A', '09:00'), saleAt('Ledger', '10:00')];

export const GroupedSaleAtTwoVenues: Story = {
  args: { kind: 'sell', editing: grouped },
  parameters: {
    services: () =>
      createTestServices({
        snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [older, ...grouped], prices: TEST_PRICES },
        rules: portugal,
      }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText('Venue (optional)')).toHaveValue('');
    await expect(
      canvas.getByText(
        'Venues on these entries: Wallet A and Ledger. Each keeps its own unless you type a venue for all of them.',
      ),
    ).toBeVisible();
  },
};
