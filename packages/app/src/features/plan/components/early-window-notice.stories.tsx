import type { CalendarDate } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import type { HoldingCountry } from '../lib/holding';
import { EarlyWindowNotice } from './early-window-notice';

// The notice of a sell window that opens before the last buy passes the holding rule, held as a host holds
// it: not yet accepted, and refused by a save that waits for the acceptance, with the line that names the fix;
// then named by Portugal's card with its conditions and Sources, and by the general profile's; the test projects render each at
// 360 and 1280 px, light and dark, with axe.

const day = (text: string) => text as CalendarDate;

const portugal: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16 Oct 2026',
  source: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx',
  conditions: FIXTURE_RULES.PT.holdingRuleConditions,
};

const generic: HoldingCountry = {
  code: 'XX',
  name: 'Other country',
  rule: { kind: 'none' },
  reviewed: '17 Oct 2026',
  source: null,
  unreviewed: {
    status: 'Not reviewed: no reviewed rule set for your country.',
    text: 'No holding exemption is applied.',
  },
};

type HostProps = {
  invalid: boolean;
  country?: HoldingCountry | undefined;
  rule?: 'country' | 'generic';
  on?: 'lastBuy' | 'template';
};

function Host(props: HostProps) {
  const { invalid, country, rule = 'country', on = 'lastBuy' } = props;
  const [accepted, setAccepted] = useState(false);
  return (
    <EarlyWindowNotice
      eligibleOn={day('2031-01-05')}
      effect="exempt"
      opensOn={day('2029-09-01')}
      rule={rule}
      country={country}
      on={on}
      accepted={accepted}
      onAccept={setAccepted}
      invalid={invalid && !accepted}
    />
  );
}

const meta = {
  title: 'Features/Plan/EarlyWindowNotice',
  component: Host,
  args: { invalid: false },
} satisfies Meta<typeof Host>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Notice: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByText(
        'The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under your ' +
          "plan's holding rule. You can also choose an earlier last buy.",
      ),
    ).toBeVisible();
    const box = canvas.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Sept\u00a02029, before this last buy passes the holding rule',
    });
    await userEvent.click(box);
    await expect(box).toHaveAttribute('aria-checked', 'true');
  },
};

export const Invalid: Story = {
  args: { invalid: true },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    const refusal = canvas.getByRole('alert');
    await expect(refusal).toHaveTextContent(
      'Tick the box to open the sell window early, or choose an earlier last buy.',
    );
    await expect(box.getAttribute('aria-describedby')).toContain(refusal.id);
    await userEvent.click(box);
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

export const Named: Story = {
  args: { country: portugal },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/ under Portugal's rule\. /)).toBeVisible();
    await expect(canvas.getByText('Computed from your dates, not tax advice')).toBeVisible();
    // Under the note, Portugal's first condition and the rest behind one control (docs/LEGAL.md §4).
    const [first, ...rest] = FIXTURE_RULES.PT.holdingRuleConditions;
    await expect(canvas.getByText(first as string)).toBeVisible();
    await expect(canvas.queryByRole('list')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: `Show ${rest.length} more conditions` }));
    await expect(await canvas.findByRole('list')).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(rest.length);
    await expect(canvas.getByRole('link', { name: 'Sources' })).toHaveAttribute('href', portugal.source);
  },
};

export const Generic: Story = {
  args: { country: generic, rule: 'generic' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/ under the general profile's rule\. /)).toBeVisible();
    await expect(
      canvas.getByText(
        'Reviewed on 17 Oct 2026: the general profile, not a rule for your country · general information, not advice',
      ),
    ).toBeVisible();
  },
};

export const Template: Story = {
  args: { country: portugal, on: 'template' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^The sell window opens .* The template's last buy /)).toBeVisible();
    await expect(canvas.getByText("Computed from the template's dates, not tax advice")).toBeVisible();
  },
};
