import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { CircleToggle } from './circle-toggle';

const meta = {
  title: 'Components/Circle toggle',
  component: CircleToggle,
  args: { 'aria-label': 'Part 1 sold' },
} satisfies Meta<typeof CircleToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

const parts = [
  { id: 'part1', title: 'Part 1: sell a third', when: 'January 2030, whatever the price', done: true },
  { id: 'part2', title: 'Part 2: sell a third', when: 'March 2030', done: false },
  {
    id: 'part3',
    title: 'Part 3: sell the rest',
    when: 'December 2030; nothing is held past 30 June 2031',
    done: false,
  },
];

export const SellParts: Story = {
  render: () => (
    <ul className="flex max-w-reading flex-col">
      {parts.map((part) => (
        <li key={part.id} className="flex items-start gap-2 border-line border-t py-1 first:border-t-0">
          <CircleToggle aria-labelledby={`${part.id}-title`} defaultPressed={part.done} />
          <span className="flex flex-col py-2.5">
            <span id={`${part.id}-title`} className="font-medium text-16">
              {part.title}
            </span>
            <span className="text-14 text-ink-2">{part.when}</span>
          </span>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvas }) => {
    const first = canvas.getByRole('button', { name: 'Part 1: sell a third' });
    const second = canvas.getByRole('button', { name: 'Part 2: sell a third' });
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    const { width, height } = second.getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);

    // Keyboard: Tab moves from part to part with the focus ring; Enter and Space toggle.
    await userEvent.tab();
    await userEvent.tab();
    await expect(second).toHaveFocus();
    await expect(second.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(second).outlineStyle).toBe('solid');
    await userEvent.keyboard('{Enter}');
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard(' ');
    await expect(second).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(first);
    await expect(first).toHaveAttribute('aria-pressed', 'false');
  },
};

export const Done: Story = { args: { defaultPressed: true } };

export const Disabled: Story = { args: { disabled: true } };
