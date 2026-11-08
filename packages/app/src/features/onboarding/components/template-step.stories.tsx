import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { createFormatters } from '../../../lib/format';
import { TemplateStep } from './template-step';

const meta = {
  title: 'Features/Onboarding/TemplateStep',
  component: TemplateStep,
  args: { value: null, format: createFormatters('en-GB', 'en-GB'), onChoose: fn(), onBack: fn() },
} satisfies Meta<typeof TemplateStep>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every template card ends with its dated band: each coin's signed fall within one window (docs/LEGAL.md §4). */
export const Unchosen: Story = {
  play: async ({ canvas }) => {
    for (const band of canvas.getAllByText(/^BTC.+ high to low between /)) await expect(band).toBeVisible();
    await expect(canvas.getAllByText(/^BTC.+ high to low between /)).toHaveLength(4);
  },
};

export const Chosen: Story = { args: { value: { kind: 'template', id: 'two-coins' } } };

/** The picked template's explanation, opened by its one control; its percentages take the plan's format. */
export const ExplanationOpen: Story = {
  args: { value: { kind: 'template', id: 'cycle-plan' }, format: createFormatters('de-DE', 'en-GB') },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show how it works and what can go wrong' }));
    await expect(await canvas.findByText(/^This template encodes a forecast about 2029 /)).toBeVisible();
    const percentage = canvas.getByText(/splits each monthly amount 40 % Bitcoin/, { normalizer: (text) => text });
    await expect(percentage).toBeVisible();
  },
};

/** A German plan in English: the percentages take the locale's no-break space. */
export const GermanFormats: Story = { args: { format: createFormatters('de-DE', 'en-GB') } };

export const OwnCoins: Story = { args: { value: { kind: 'custom' } } };
