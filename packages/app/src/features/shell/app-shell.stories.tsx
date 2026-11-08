import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { expect, waitFor } from 'storybook/test';
import { memoryPlanStore } from '../../lib/adapters';
import { useToasts } from '../../lib/services';
import { createTestServices } from '../../lib/services/testing';
import { TodayScreen } from '../today';
import { AppShell } from './app-shell';

// The shell around Today (ADR-0045 §9): the header, the screen area and the tab bar at 360 and 1280 px,
// light and dark, with axe. `withServices` (.storybook/preview.tsx) starts the test services around
// every story; the failed story replaces them with a plan store that cannot be opened.

function UndoAfterRender() {
  const toasts = useToasts();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toasts.add({
      title: 'Entry deleted',
      description: 'Bought 70 € of BTC on 5 October 2026.',
      timeout: UNDO_WINDOW_MS,
      actionProps: { children: 'Undo', onClick: () => undefined },
    });
  }, [toasts]);
  return null;
}

const meta = {
  title: 'Features/Shell/AppShell',
  component: AppShell,
  parameters: { path: '/today' },
  args: { children: <TodayScreen /> },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Today: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  },
};

export const UndoToast: Story = {
  args: {
    children: (
      <>
        <TodayScreen />
        <UndoAfterRender />
      </>
    ),
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Undo' })).toBeVisible());
    await expect(canvas.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('Entry deleted');
  },
};

export const Failed: Story = {
  parameters: {
    services: () =>
      createTestServices({
        planStore: {
          ...memoryPlanStore(),
          load: async () => {
            throw new Error('IndexedDB is not available in this browsing mode.');
          },
        },
      }),
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Your data could not be opened.' })).toBeVisible());
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible();
  },
};
