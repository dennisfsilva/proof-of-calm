import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
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
