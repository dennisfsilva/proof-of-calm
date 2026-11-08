import type { CalendarDate, EntityId, Pause } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { PauseSection } from './pause-section';

// The pause section over the fixture plan on 20 October 2026: unpaused, paused since 1 October 2026, and an
// imported pause still to come, which refuses Pause under the button; the test projects render each at 360
// and 1280 px, light and dark, with axe.

const pause = (from: string): Pause => ({
  id: '00000000-0000-4000-8000-000000003000' as EntityId,
  from: from as CalendarDate,
  until: null,
  note: '',
});

const withPause = (from: string): Snapshot => {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, pauses: [pause(from)] } };
};

const meta = {
  title: 'Features/Plan/PauseSection',
  component: PauseSection,
  parameters: { path: '/plan', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof PauseSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unpaused: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Pause the plan' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Pause from today' })).toBeVisible();
  },
};

export const Paused: Story = {
  parameters: { snapshot: withPause('2026-10-01') },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(/^Paused since 1\sOct\s2026$/u);
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeVisible();
  },
};

export const Refused: Story = {
  parameters: { snapshot: withPause('2026-12-01') },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Pause from today' });
    await userEvent.click(button);
    await waitFor(() => expect(canvas.getByRole('alert')).toBeVisible());
    await expect(button).toHaveFocus();
  },
};
