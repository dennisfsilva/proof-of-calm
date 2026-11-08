import type { MonthKey } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { SkipSheet } from './skip-sheet';

// The skip sheet over the fixture plan on 20 Oct 2026: October is late; July is already skipped.
const meta = {
  title: 'Features/Log/SkipSheet',
  component: SkipSheet,
  args: { slot: '2026-10' as MonthKey, open: true, onOpenChange: fn() },
  parameters: {
    services: () => createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') }),
  },
} satisfies Meta<typeof SkipSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async () => {
    const sheet = within(await within(document.body).findByRole('dialog', { name: 'Skip October\u00a02026' }));
    await expect(sheet.getByRole('textbox', { name: 'Note (optional)' })).toHaveAttribute(
      'placeholder',
      'e.g. car repair',
    );
  },
};

export const AlreadySkipped: Story = {
  args: { slot: '2026-07' as MonthKey },
  play: async () => {
    const sheet = within(await within(document.body).findByRole('dialog', { name: 'Skip July\u00a02026' }));
    const skip = sheet.getByRole('button', { name: 'Skip July\u00a02026' });
    await userEvent.click(skip);
    await expect(await sheet.findByRole('alert')).toHaveTextContent(/^July\s2026 is already skipped\.$/);
    // The slot refuses every later press too: Skip stays focusable and inert.
    await expect(skip).toHaveAttribute('aria-disabled', 'true');
    await expect(skip).toHaveFocus();
  },
};
