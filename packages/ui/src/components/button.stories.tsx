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
    const { height } = button.getBoundingClientRect();
    await expect(height).toBeGreaterThanOrEqual(44);
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
