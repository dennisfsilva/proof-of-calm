import type { CalendarDate, EntityId } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import { CalendarRow } from './calendar-row';

// Settings' calendar reminder over the fixture plan in its buying phase, a device that saves no file, the same
// plan paused from 20 October 2026 until resumed, and past its last buy; the test projects of vitest.config.ts
// render each at 360 and 1280 px, light and dark, with axe.

const paused = (): Snapshot => {
  const snapshot = fixtureSnapshot();
  const pause = { id: '00000000-0000-4000-8000-000000003000' as EntityId, from: '2026-10-20' as CalendarDate };
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, pauses: [{ ...pause, until: null, note: '' }] } };
};
const meta = {
  title: 'Features/Settings/CalendarRow',
  component: CalendarRow,
  parameters: { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof CalendarRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithPlan: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 2, name: 'Calendar reminder' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add to calendar' })).toBeVisible();
  },
};

export const NotSaved: Story = {
  parameters: {
    services: () =>
      createTestServices({
        snapshot: fixtureSnapshot(),
        nowMs: fixtureNowMs('buy'),
        platform: { ...recordingPlatform(), download: async () => false },
      }),
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Add to calendar' }));
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent('The calendar file was not saved. Add it again.'),
    );
  },
};

export const Paused: Story = {
  parameters: { snapshot: paused() },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^The buy days left are paused/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
  },
};

export const NoneLeft: Story = {
  parameters: { nowMs: fixtureNowMs('sell') },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No buy days left, so there is no reminder to add.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
  },
};
