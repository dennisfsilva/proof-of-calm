import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { RadioCard, RadioGroup } from './radio-group';

const meta = {
  title: 'Components/Radio group',
  component: RadioGroup,
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Templates: Story = {
  render: () => (
    <section className="flex max-w-reading flex-col gap-stack-sm">
      <h2 id="template-title" className="text-20">
        Start from
      </h2>
      <RadioGroup aria-labelledby="template-title" defaultValue="core">
        <RadioCard
          value="core"
          badge="Lower risk"
          title="Bitcoin only"
          line="All of the monthly amount in BTC, bought on one day a month."
        />
        <RadioCard
          value="pair"
          badge="Medium risk"
          title="Bitcoin and ether"
          line="70 % BTC and 30 % ETH, bought on one day a month."
        />
        <RadioCard
          value="wide"
          badge="Higher risk"
          title="Four coins"
          line="BTC, ETH, SOL and LINK in shares you set."
        />
        <RadioCard value="custom" title="My own plan" line="Choose the coins, the split and the dates yourself." />
      </RadioGroup>
    </section>
  ),
  play: async ({ canvas }) => {
    const core = canvas.getByRole('radio', { name: 'Bitcoin only' });
    const pair = canvas.getByRole('radio', { name: 'Bitcoin and ether' });
    await expect(core).toHaveAttribute('aria-checked', 'true');
    await expect(core).toHaveAccessibleDescription(/Lower risk/);
    for (const card of canvas.getAllByRole('radio')) {
      await expect(card.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }

    // Keyboard: Tab enters the group on the chosen card with the focus ring; arrows move the choice.
    await userEvent.tab();
    await expect(core).toHaveFocus();
    await expect(core.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(core).outlineStyle).toBe('solid');
    await userEvent.keyboard('{ArrowDown}');
    await expect(pair).toHaveFocus();
    await expect(pair).toHaveAttribute('aria-checked', 'true');
    await expect(core).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(canvas.getByRole('radio', { name: 'My own plan' }));
    await expect(canvas.getByRole('radio', { name: 'My own plan' })).toHaveAttribute('aria-checked', 'true');
  },
};

export const Countries: Story = {
  render: () => (
    <section className="flex max-w-reading flex-col gap-stack-sm">
      <h2 id="country-title" className="text-20">
        Where you pay tax
      </h2>
      <RadioGroup aria-labelledby="country-title" defaultValue="PT">
        <RadioCard value="PT" badge="PT" title="Portugal" line="Gains on crypto held 365 days or more are not taxed." />
        <RadioCard
          value="DE"
          badge="DE"
          title="Germany"
          line="Gains on crypto held more than one year are not taxed."
        />
        <RadioCard
          value="XX"
          title="Another country"
          line="No holding rule is applied; the plan shows no tax-free dates."
        />
      </RadioGroup>
    </section>
  ),
};

export const WithoutChoice: Story = {
  render: () => (
    <RadioGroup aria-label="Buy day">
      <RadioCard value="1" title="The 1st" line="Right after most salaries arrive." />
      <RadioCard value="15" title="The 15th" />
      <RadioCard value="28" title="The 28th" disabled line="Not every month has a 29th, so 28 is the last." />
    </RadioGroup>
  ),
  play: async ({ canvas }) => {
    for (const card of canvas.getAllByRole('radio')) await expect(card).toHaveAttribute('aria-checked', 'false');
    await expect(canvas.getByRole('radio', { name: 'The 28th' })).toHaveAttribute('aria-disabled', 'true');
  },
};

export const Invalid: Story = {
  render: () => (
    <>
      <RadioGroup aria-label="Holding rule" aria-invalid defaultValue="country">
        <RadioCard value="country" title="Your country's rule" line="Not known for this country yet." />
        <RadioCard value="own" title="Your own rule" />
      </RadioGroup>
      <span data-testid="negative" aria-hidden="true" className="border border-negative" />
    </>
  ),
  play: async ({ canvas }) => {
    // A refused group's chosen card takes the negative boundary, as a refused field does; the others keep theirs.
    const negative = getComputedStyle(canvas.getByTestId('negative')).borderTopColor;
    const chosen = canvas.getByRole('radio', { name: "Your country's rule" });
    const other = canvas.getByRole('radio', { name: 'Your own rule' });
    await expect(chosen).toHaveAttribute('data-invalid');
    await expect(getComputedStyle(chosen).borderTopColor).toBe(negative);
    await expect(getComputedStyle(other).borderTopColor).not.toBe(negative);
  },
};
