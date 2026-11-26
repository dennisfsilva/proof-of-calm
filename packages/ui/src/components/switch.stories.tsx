import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Field, FieldDescription, FieldLabel } from './field';
import { Switch } from './switch';

const meta = {
  title: 'Components/Switch',
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Setting: Story = {
  render: () => (
    <label className="flex min-h-row items-center justify-between gap-stack-md text-16">
      Reduce motion
      <Switch />
    </label>
  ),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: 'Reduce motion' });
    const { width, height } = toggle.getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Keyboard: Tab reaches it with the visible focus ring, Space turns it on and off.
    await userEvent.tab();
    await expect(toggle).toHaveFocus();
    await expect(toggle.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(toggle).outlineStyle).toBe('solid');
    await userEvent.keyboard(' ');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard(' ');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // The label is part of the target: clicking the words turns it on.
    await userEvent.click(canvas.getByText('Reduce motion'));
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  },
};

// Reduced motion keeps a declared transition and makes it 1 ms through the duration tokens (docs/DESIGN.md
// §6 Motion): the thumb and the track settle at once, where full motion takes 120 ms.
export const ToggledUnderReducedMotion: Story = {
  name: 'Toggled under reduced motion',
  render: () => (
    <label className="flex min-h-row items-center justify-between gap-stack-md text-16">
      Reduce motion
      <Switch />
    </label>
  ),
  play: async ({ canvas, canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement;
    const before = root.dataset.motion;
    root.dataset.motion = 'reduce';
    try {
      const toggle = canvas.getByRole('switch', { name: 'Reduce motion' });
      await userEvent.click(toggle);
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await waitFor(() => expect(toggle.getAnimations({ subtree: true })).toEqual([]), { timeout: 50, interval: 5 });
    } finally {
      if (before === undefined) root.removeAttribute('data-motion');
      else root.dataset.motion = before;
    }
  },
};

export const InAField: Story = {
  render: () => (
    <Field>
      <FieldLabel className="flex min-h-row items-center justify-between gap-stack-md">
        Show prices in euros
        <Switch defaultChecked />
      </FieldLabel>
      <FieldDescription>Coin prices follow the pay currency of the plan.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: 'Show prices in euros' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleDescription('Coin prices follow the pay currency of the plan.');
  },
};

export const Disabled: Story = {
  render: () => (
    <label className="flex min-h-row items-center justify-between gap-stack-md text-16">
      Hide amounts on Today
      <Switch disabled />
    </label>
  ),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: 'Hide amounts on Today' });
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
  },
};
