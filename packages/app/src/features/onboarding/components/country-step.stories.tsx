import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { CountryStep } from './country-step';

// The country step as the onboarding will host it (docs/JURISDICTIONS.md §3): no suggestion, a suggestion
// that agrees with the language, a low one, the residence line alone, one where the language points
// elsewhere, and a country chosen earlier;
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

// A low suggestion (English in Lisbon) is named and first in the list, but chosen there: no Continue until then.
export const Low: Story = {
  args: { suggestion: { country: 'PT', confidence: 'low', languageDiffers: false } },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByText('This device suggests Portugal.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Continue/ })).toBeNull();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Country' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('option', { name: 'Portugal' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Continue with Portugal' }));
    await expect(args.onChoose).toHaveBeenCalledWith('PT');
  },
};

// Nothing named (no usable time zone), and the device's language names a country we serve.
export const ResidenceLineOnly: Story = {
  args: { suggestion: { country: null, confidence: null, languageDiffers: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Residence, not language, decides tax.')).toBeVisible();
    await expect(canvas.queryByText(/This device suggests/)).toBeNull();
  },
};

export const LanguageDiffers: Story = {
  args: { suggestion: { country: 'PT', confidence: 'low', languageDiffers: true } },
};

export const ChosenEarlier: Story = {
  args: { value: 'XX', suggestion: { country: 'DE', confidence: 'medium', languageDiffers: false } },
};
