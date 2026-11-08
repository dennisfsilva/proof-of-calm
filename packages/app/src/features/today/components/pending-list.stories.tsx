import type { CalendarDate, Money, MonthKey } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PendingList } from './pending-list';

// The quiet list under the primary action: a late starting amount and a month still open. The test
// projects of vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Today/PendingList',
  component: PendingList,
  parameters: { path: '/today' },
} satisfies Meta<typeof PendingList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoOpen: Story = {
  args: {
    actions: [
      {
        kind: 'lump',
        slot: null,
        due: '2026-10-01' as CalendarDate,
        status: 'late',
        plannedAmount: '1000' as Money,
        loggedAmount: '0' as Money,
      },
      {
        kind: 'dca',
        slot: '2026-10' as MonthKey,
        due: '2026-10-05' as CalendarDate,
        status: 'due',
        plannedAmount: '100' as Money,
        loggedAmount: '0' as Money,
      },
    ],
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole('list', { name: 'Also open' });
    await expect(list).toHaveTextContent('Starting amount: due 1 Oct 2026');
    await expect(list).toHaveTextContent('October 2026: due 5 Oct 2026');
  },
};
