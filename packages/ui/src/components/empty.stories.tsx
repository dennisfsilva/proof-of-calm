import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon } from 'lucide-react';
import { Button } from './button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';

const meta = {
  title: 'Components/Empty state',
  component: Empty,
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoPlanYet: Story = {
  render: () => (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <CalendarIcon />
        </EmptyMedia>
        <EmptyTitle>No plan yet</EmptyTitle>
        <EmptyDescription>
          Set up a plan once: what to buy, how much, and when to stop. It takes three minutes.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Set up a plan</Button>
        <Button variant="secondary">Import a backup</Button>
      </EmptyContent>
    </Empty>
  ),
};
