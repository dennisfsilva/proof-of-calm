import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Field, FieldError, FieldLabel } from './field';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Acknowledgement: Story = {
  render: () => (
    <div className="flex max-w-reading flex-col gap-stack-md">
      <label className="flex items-start gap-1 text-16">
        <Checkbox />
        <span className="py-2.5">
          I understand that this is a plan I set myself, not advice, and that crypto can lose most of its value.
        </span>
      </label>
      <Button>Start the plan</Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', { name: /not advice/ });
    const { width, height } = box.getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    await expect(box).toHaveAttribute('aria-checked', 'false');

    // Keyboard: Tab reaches it with the visible focus ring, Space ticks and unticks it.
    await userEvent.tab();
    await expect(box).toHaveFocus();
    await expect(box.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(box).outlineStyle).toBe('solid');
    await userEvent.keyboard(' ');
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard(' ');
    await expect(box).toHaveAttribute('aria-checked', 'false');

    // The words are part of the target.
    await userEvent.click(canvas.getByText(/not advice/));
    await expect(box).toHaveAttribute('aria-checked', 'true');
  },
};

// The focus ring keeps clear of the label beside it by at least the ring's offset, at a phone's width too
// (docs/DESIGN.md §6 and §8): it is drawn inside the 44 px target, around the box.
export const RingClearOfLabel: Story = {
  ...Acknowledgement,
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', { name: /not advice/ });
    await userEvent.tab();
    await expect(box).toHaveFocus();
    const style = getComputedStyle(box);
    await expect(style.outlineStyle).toBe('solid');
    const extent = px(style.outlineWidth) + px(style.outlineOffset);
    const ring = box.getBoundingClientRect();
    const label = canvas.getByText(/not advice/).getBoundingClientRect();
    const offset = px(getComputedStyle(document.documentElement).getPropertyValue('--focus-offset'));
    await expect(offset).toBeGreaterThan(0);
    await expect(label.left - (ring.right + extent)).toBeGreaterThanOrEqual(offset);
  },
};

export const Required: Story = {
  render: () => (
    <Field invalid>
      <FieldLabel className="flex items-start gap-1">
        <Checkbox required />
        <span className="py-2.5">I have read the risk summary.</span>
      </FieldLabel>
      <FieldError>Tick the box to go on.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', { name: 'I have read the risk summary.' });
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box).toHaveAttribute('aria-required', 'true');
  },
};

/** A refused acceptance: the root marked aria-invalid gives the unticked box the negative boundary. */
export const Invalid: Story = {
  render: () => (
    <div className="flex flex-col gap-stack-xs">
      <label className="flex items-start gap-1 text-16">
        <Checkbox aria-invalid aria-describedby="invalid-line" />
        <span className="py-2.5">Open the sell window on 1 Sept 2029</span>
      </label>
      <p id="invalid-line" className="text-13 text-negative">
        Tick the box to open the sell window early.
      </p>
      <span data-testid="negative" className="border-2 border-negative" />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const root = canvas.getByRole('checkbox', { name: 'Open the sell window on 1 Sept 2029' });
    await expect(root).toHaveAttribute('aria-invalid', 'true');
    const box = root.querySelector('[data-slot="checkbox-box"]');
    const negative = getComputedStyle(canvas.getByTestId('negative')).borderTopColor;
    await expect(box && getComputedStyle(box).borderTopColor).toBe(negative);
    // A tick takes the ink: the mark, not the colour, says it is ticked.
    await userEvent.click(root);
    await expect(root).toHaveAttribute('aria-checked', 'true');
  },
};

export const States: Story = {
  render: () => (
    <div className="flex flex-col">
      <label className="flex items-center gap-1 text-16">
        <Checkbox defaultChecked />
        Ticked
      </label>
      <label className="flex items-center gap-1 text-16">
        <Checkbox indeterminate />
        Some coins chosen
      </label>
      <label className="flex items-center gap-1 text-16">
        <Checkbox disabled />
        Not available
      </label>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: 'Ticked' })).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByRole('checkbox', { name: 'Some coins chosen' })).toHaveAttribute('aria-checked', 'mixed');
  },
};

// A computed CSS length in pixels.
function px(value: string) {
  return Number(value.replace('px', ''));
}
