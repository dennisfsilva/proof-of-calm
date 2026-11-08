import { type CalendarDate, EntityIdSchema } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { createFormatters } from '../../../lib/format';
import { emptyDraft } from '../model/setup';
import { NumbersStep } from './numbers-step';

const TODAY = '2026-10-20' as CalendarDate;
const ID = EntityIdSchema.parse('00000000-0000-4000-8000-000000000001');

const meta = {
  title: 'Features/Onboarding/NumbersStep',
  component: NumbersStep,
  args: {
    draft: emptyDraft(TODAY, ID, 'PT'),
    currency: 'EUR',
    format: createFormatters('pt-PT', 'en-GB'),
    askLastBuy: false,
    templateLastBuy: null,
    fieldIssues: [],
    early: null,
    onChange: fn(),
    onBack: fn(),
    onContinue: fn(),
  },
} satisfies Meta<typeof NumbersStep>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The starting amount has the custom path's label and hint. */
export const TemplateDates: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Starting amount (EUR)' })).toBeVisible();
    await expect(
      canvas.getByText(
        /Enter 0 for none\. For coins you already have, choose Add coins you already have on the Log after setup\.$/,
      ),
    ).toBeVisible();
  },
};

export const LastBuyAsked: Story = { args: { askLastBuy: true } };

export const Issues: Story = {
  args: {
    askLastBuy: true,
    fieldIssues: [
      { field: 'monthly', error: { code: 'no-amount' } },
      { field: 'lastBuy', error: { code: 'date-empty' } },
    ],
  },
};

/** The Cycle plan in Germany: its window opens a day before its last buy passes the one-year rule. */
export const EarlyWindow: Story = {
  args: {
    draft: emptyDraft(TODAY, ID, 'DE'),
    format: createFormatters('de-DE', 'en-GB'),
    early: {
      opensOn: '2029-06-01' as CalendarDate,
      eligibleOn: '2029-06-02' as CalendarDate,
      effect: 'exempt',
      rule: 'country',
    },
  },
};

export const EarlyWindowRefused: Story = { args: { ...EarlyWindow.args, earlyInvalid: true } };
