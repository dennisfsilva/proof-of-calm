import { DEFAULT_PREFS } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, date, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import { MoveSheet } from './move-sheet';

// The move sheet over the test services: 0.03 BTC bought at Kraken on 10 Jan 2026, and 0.01 BTC of it moved to Ledger
// on 20 Feb 2026 with 0.0099 BTC received, so an edit opens on that move and its network fee.
const plan = aPlan();
const bought = anEntry({ kind: 'extra', date: date('2026-01-10'), slot: null, units: units('0.03'), venue: 'Kraken' });
const move = aMove({ date: date('2026-02-20') });

const meta = {
  title: 'Features/Log/MoveSheet',
  component: MoveSheet,
  args: { open: true, editing: null, onOpenChange: fn(), onDone: fn() },
  parameters: {
    services: () =>
      createTestServices({
        snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan, entries: [bought, move], prices: TEST_PRICES },
      }),
  },
} satisfies Meta<typeof MoveSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A new move: the title, and the form with no date. */
export const NewMove: Story = {
  play: async () => {
    const sheet = within(await within(document.body).findByRole('dialog', { name: 'Log coins you moved' }));
    await expect(await sheet.findByLabelText('Date')).toHaveValue('');
  },
};

/** A move row's Edit: the move's values and its network fee. */
export const EditMove: Story = {
  args: { editing: move },
  play: async () => {
    const sheet = within(await within(document.body).findByRole('dialog', { name: 'Edit the move' }));
    await expect(await sheet.findByLabelText('Units sent')).toHaveValue('0.01');
    await expect(await sheet.findByText(/Network fee 0.0001/)).toBeVisible();
  },
};
