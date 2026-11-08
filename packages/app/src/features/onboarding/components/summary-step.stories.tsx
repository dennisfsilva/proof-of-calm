import type { Money, Plan } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { createFormatters } from '../../../lib/format';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import type { HoldingCountry } from '../../plan';
import { SummaryStep } from './summary-step';

// The summary of both paths: the fixture plan from a template with its window, sentence and calendar file,
// under Portugal's rule; your own coins with no window, sentence or starting amount; Start while the plan is
// being written; Germany's rule with an early sell window the person accepted; the general profile's rule.

const plan = fixtureSnapshot().plan as Plan;

const portugal: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16 Oct 2026',
  source: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx',
};

const germany: HoldingCountry = {
  code: 'DE',
  name: 'Germany',
  rule: { kind: 'years', years: 1, effect: 'exempt' },
  reviewed: '16 Oct 2026',
  source: 'https://www.gesetze-im-internet.de/estg/__23.html',
};

const generic: HoldingCountry = {
  code: 'XX',
  name: 'Other country',
  rule: { kind: 'none' },
  reviewed: '17 Oct 2026',
  source: null,
  unreviewed: {
    status: 'Not reviewed: no reviewed rule set for your country.',
    text: 'No holding exemption is applied: treat every sale as a possibly taxable event.',
  },
};

const meta = {
  title: 'Features/Onboarding/SummaryStep',
  component: SummaryStep,
  args: {
    plan: { ...plan, why: 'I buy on the 1st and I do not check the price on other days.' },
    holding: portugal,
    templateName: 'Cycle plan',
    reminder: 'calendar',
    format: createFormatters('en-GB', 'en-GB'),
    onBack: fn(),
    onStart: fn(),
  },
} satisfies Meta<typeof SummaryStep>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FromTemplate: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Accept and start the plan' })).toBeVisible();
  },
};

export const OwnCoins: Story = {
  args: {
    plan: { ...plan, sellWindow: null, why: '', startingAmount: '0' as Money, templateId: null },
    templateName: null,
    reminder: 'later',
  },
};

export const Pending: Story = {
  args: { pending: true },
};

export const GermanyEarlyWindow: Story = {
  args: {
    holding: germany,
    plan: {
      ...plan,
      holdingRule: germany.rule,
      sellWindow: plan.sellWindow && { ...plan.sellWindow, acceptedEarlyOpen: true },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Germany's rule. 1 year, then tax-free.")).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Sources' })).toHaveAttribute('href', germany.source);
    await expect(
      canvas.getByText(/, opening before the last buy passes the holding rule, as you accepted$/),
    ).toBeVisible();
  },
};

export const GeneralProfile: Story = {
  args: { holding: generic, plan: { ...plan, holdingRule: { kind: 'none' } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^The general profile's rule\. No holding exemption is applied/)).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Sources' })).toBeNull();
  },
};
