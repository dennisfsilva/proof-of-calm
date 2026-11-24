import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlusIcon } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Bought as planned' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Bought as planned' });
    // One line keeps the 44 px target exactly: the vertical padding only shows once a label wraps.
    const { height } = button.getBoundingClientRect();
    await expect(height).toBe(44);
  },
};

export const Secondary: Story = { args: { variant: 'secondary', children: 'Skip this month' } };

export const Ghost: Story = { args: { variant: 'ghost', children: 'Add to it' } };

export const Link: Story = { args: { variant: 'link', children: 'Show all' } };

export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete entry' } };

export const Disabled: Story = { args: { disabled: true } };

export const Icon: Story = {
  args: { variant: 'ghost', size: 'icon', 'aria-label': 'Add a purchase', children: <PlusIcon aria-hidden /> },
  play: async ({ canvas }) => {
    const { width, height } = canvas.getByRole('button', { name: 'Add a purchase' }).getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  },
};

/** The distinct line tops of an element's text, so a wrapped label counts its lines. */
function lineCount(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
}

// German's Today link on a 308 px row at 125 % text (docs/DESIGN.md §8): a label wider than its container wraps onto
// a second, balanced line inside it, and the button stays a 44 px target.
export const LongLabel: Story = {
  args: { variant: 'secondary', children: 'Den laufenden Rückgang ansehen und den Plan prüfen' },
  render: (args) => (
    <div lang="de" data-testid="row" className="w-77">
      <Button {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByTestId('row').getBoundingClientRect();
    const button = canvas.getByRole('button');
    const box = button.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(row.left - 0.5);
    await expect(box.right).toBeLessThanOrEqual(row.right + 0.5);
    await expect(lineCount(button)).toBe(2);
    await expect(box.height).toBeGreaterThanOrEqual(44);
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-target-gap">
      <Button>Bought as planned</Button>
      <Button variant="secondary">Skip this month</Button>
      <Button variant="ghost">Add to it</Button>
      <Button variant="link">Show all</Button>
      <Button variant="destructive">Delete entry</Button>
    </div>
  ),
};
