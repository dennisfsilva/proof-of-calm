import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import { ReminderStep } from './reminder-step';

// The reminder step: Add to calendar and Later; a platform that saves no file, which keeps the step with
// its line; no buy day left, so the heading and a line say why and Continue goes on.

const meta = {
  title: 'Features/Onboarding/ReminderStep',
  component: ReminderStep,
  args: { file: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', onAdd: fn(), onLater: fn(), onBack: fn() },
} satisfies Meta<typeof ReminderStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Offered: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add to calendar' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Later' })).toBeVisible();
  },
};

export const NotSaved: Story = {
  parameters: {
    services: () => createTestServices({ platform: { ...recordingPlatform(), download: async () => false } }),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add to calendar' }));
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(args.onAdd).not.toHaveBeenCalled();
  },
};

export const NoBuyDayLeft: Story = {
  args: { file: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Monthly reminder' })).toBeVisible();
    await expect(canvas.getByText('No buy days left, so there is no reminder to add.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Continue' })).toBeVisible();
  },
};
