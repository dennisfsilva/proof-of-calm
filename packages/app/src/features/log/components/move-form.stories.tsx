import { DEFAULT_PREFS } from '@proofofcalm/core';
import { anEntry, aPlan, date, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import { MoveForm } from './move-form';

// The move form over the test services (20 Oct 2026): one coin the Log has held, BTC, at two venues and with no venue, so the
// form asks for no coin and, once dated, offers three sources, each with its units.
const plan = aPlan();
const bought = (quantity: string, on: string, venue: string | null) =>
  anEntry({ kind: 'extra', date: date(on), slot: null, units: units(quantity), venue });
const entries = [
  bought('0.03', '2026-01-10', 'Kraken'),
  bought('0.02', '2026-02-10', 'Ledger'),
  bought('0.01', '2026-03-10', null),
];

const meta = {
  title: 'Features/Log/MoveForm',
  component: MoveForm,
  args: { editing: null, onDone: fn() },
  parameters: {
    services: () =>
      createTestServices({ snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries, prices: TEST_PRICES } }),
  },
} satisfies Meta<typeof MoveForm>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Dated, the form lists the three sources; a fee shows once fewer units arrive than were sent. */
export const TwoVenuesAndNone: Story = {
  play: async ({ canvas }) => {
    const day = await canvas.findByLabelText('Date');
    await userEvent.type(day, '2026-10-15');
    await expect(await canvas.findAllByRole('radio')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('radio', { name: 'Kraken' }));
    await userEvent.type(canvas.getByLabelText('Venue the coins went to'), 'Ledger');
    await userEvent.type(canvas.getByLabelText('Units sent'), '0.03');
    await userEvent.clear(canvas.getByLabelText('Units received'));
    await userEvent.type(canvas.getByLabelText('Units received'), '0.0298');
    await expect(await canvas.findByText(/Network fee 0.0002/)).toBeVisible();
    // Fill in all units sits beside Units sent at 360 px, and a figure at BTC's full precision still fits the field.
    const sent = canvas.getByLabelText<HTMLInputElement>('Units sent');
    const all = canvas.getByRole('button', { name: 'Fill in all units' }).getBoundingClientRect();
    const form = sent.closest('form')?.getBoundingClientRect();
    await expect(all.right).toBeLessThanOrEqual(form?.right ?? 0);
    await expect(all.top).toBeLessThan(sent.getBoundingClientRect().bottom);
    await userEvent.clear(sent);
    await userEvent.type(sent, '0.12345678');
    await expect(sent.scrollWidth).toBeLessThanOrEqual(sent.clientWidth);
  },
};
