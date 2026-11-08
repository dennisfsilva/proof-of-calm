import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { WhyStep } from './why-step';

// Both paths' sentence: empty with its placeholder, and filled.

const meta = {
  title: 'Features/Onboarding/WhyStep',
  component: WhyStep,
  args: { value: '', onChange: fn(), onBack: fn(), onContinue: fn() },
} satisfies Meta<typeof WhyStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'In one sentence, why are you doing this?' })).toBeVisible();
  },
};

export const Filled: Story = {
  args: { value: 'I buy on the 1st and I do not check the price on other days.' },
};
