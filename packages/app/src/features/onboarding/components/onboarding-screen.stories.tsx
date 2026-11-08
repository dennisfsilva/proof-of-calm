import { templateById } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { OnboardingScreen } from './onboarding-screen';

// The setup flow on a device in Lisbon with an English UI, the Cycle plan's early window on a device in
// Berlin, and the screen when a plan is already stored.
const meta = {
  title: 'Features/Onboarding/OnboardingScreen',
  component: OnboardingScreen,
  parameters: { path: '/onboarding' },
  args: { device: { languages: ['en-GB'], timeZone: 'Europe/Lisbon' } },
} satisfies Meta<typeof OnboardingScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Country: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('This device suggests Portugal.')).toBeVisible());
  },
};

export const Template: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue with Portugal' }));
    await expect(canvas.getAllByRole('radio')).toHaveLength(5);
  },
};

export const Numbers: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue with Portugal' }));
    await userEvent.click(canvas.getByRole('radio', { name: templateById('two-coins')?.name ?? 'two-coins' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await expect(canvas.getByLabelText(/^Monthly amount/)).toBeVisible();
  },
};

/** The Cycle plan in Germany: the template's window opens before its last buy passes the country's rule. */
export const EarlyWindow: Story = {
  args: { device: { languages: ['de-DE'], timeZone: 'Europe/Berlin' } },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue with Germany' }));
    await userEvent.click(canvas.getByRole('radio', { name: templateById('cycle-plan')?.name ?? 'cycle-plan' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await expect(canvas.getByRole('checkbox', { name: /^Open the sell window/ })).toBeVisible();
  },
};

export const PlanStored: Story = {
  parameters: { services: () => createTestServices({ snapshot: fixtureSnapshot() }) },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Open the plan' })).toBeVisible());
  },
};
