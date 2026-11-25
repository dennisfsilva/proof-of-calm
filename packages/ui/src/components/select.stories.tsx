import type { Meta, StoryObj } from '@storybook/react-vite';
import { ListIcon } from 'lucide-react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { TabBar } from './navigation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

const days = Array.from({ length: 28 }, (_, index) => String(index + 1));

const meta = {
  title: 'Components/Select',
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuyDay: Story = {
  render: () => (
    <Select defaultValue="5">
      <SelectLabel>Buy day</SelectLabel>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {days.map((day) => (
          <SelectItem key={day} value={day}>
            {day}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Buy day' });
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

export const Placeholder: Story = {
  render: () => (
    <Select>
      <SelectLabel>Country</SelectLabel>
      <SelectTrigger>
        <SelectValue placeholder="Choose a country" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PT">Portugal</SelectItem>
        <SelectItem value="DE">Germany</SelectItem>
      </SelectContent>
    </Select>
  ),
};

const years = ['2026', '2025', '2024', '2023', '2022'];

// A choice at the end of a page with the phone tab bar (the Log's Go to year): every option of the open list shows
// above the bar, which the popup would otherwise open under (zoom-125, 2026-11-25).
export const AboveTabBar: Story = {
  render: () => (
    <div className="flex min-h-dvh flex-col justify-end gap-8">
      <div className="flex flex-col gap-stack-xs">
        <Select defaultValue="2026">
          <SelectLabel>Go to year</SelectLabel>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TabBar label="Main" items={[{ href: '#log', label: 'Log', icon: ListIcon, current: true }]} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Go to year' });
    trigger.scrollIntoView({ block: 'end' });
    await userEvent.click(trigger);
    const document = canvasElement.ownerDocument;
    await waitFor(() => expect(document.querySelectorAll('[data-slot="select-item"]')).toHaveLength(years.length));
    const bar = document.querySelector('[data-slot="tab-bar"] nav')?.getBoundingClientRect();
    const top = bar !== undefined && bar.height > 0 ? bar.top : window.innerHeight;
    const popup = document.querySelector('[data-slot="select-content"]');
    await waitFor(() => {
      expect(popup).not.toHaveAttribute('data-starting-style');
      expect(popup?.getBoundingClientRect().bottom).toBeLessThanOrEqual(top);
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    // Axe runs after the play: the closing list's focus guards would still be there.
    await waitFor(() => expect(document.querySelector('[data-base-ui-focus-guard], [data-ending-style]')).toBeNull());
  },
};

export const Open: Story = {
  render: () => (
    <Select defaultValue="EUR" defaultOpen>
      <SelectLabel>Pay currency</SelectLabel>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectGroupLabel>Euro area</SelectGroupLabel>
          <SelectItem value="EUR">Euro (EUR)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectGroupLabel>Other</SelectGroupLabel>
          <SelectItem value="USD">US dollar (USD)</SelectItem>
          <SelectItem value="CHF" disabled>
            Swiss franc (CHF)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const options = canvasElement.ownerDocument.querySelectorAll('[data-slot="select-item"]');
    await expect(options.length).toBe(3);
    for (const option of options) await expect(option.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
