import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { CountryStep } from './country-step';

// The country step as the onboarding will host it (docs/JURISDICTIONS.md §3): no suggestion, a suggestion
// that agrees with the language, one where the language points elsewhere, and a country chosen earlier;
// the test projects render each at 360 and 1280 px, light and dark, with axe.

const CHOICES = [
  { code: 'PT', name: 'Portugal' },
  { code: 'DE', name: 'Germany' },
  { code: 'XX', name: 'Other country' },
] as const;

const meta = {
  title: 'Features/Onboarding/CountryStep',
  component: CountryStep,
  args: { choices: CHOICES, suggestion: null, value: null, onChoose: fn() },
} satisfies Meta<typeof CountryStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoSuggestion: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Country' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Continue/ })).toBeNull();
  },
};

export const Suggested: Story = {
  args: { suggestion: { country: 'PT', confidence: 'high', languageDiffers: false } },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Continue with Portugal' }));
    await expect(args.onChoose).toHaveBeenCalledWith('PT');
  },
};

export const LanguageDiffers: Story = {
  args: { suggestion: { country: 'PT', confidence: 'low', languageDiffers: true } },
};

export const ChosenEarlier: Story = {
  args: { value: 'XX', suggestion: { country: 'DE', confidence: 'medium', languageDiffers: false } },
};
