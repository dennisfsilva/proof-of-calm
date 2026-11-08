import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { DateInput, Input, NumericInput } from './input';

const meta = {
  title: 'Components/Input',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  render: () => (
    <Field>
      <FieldLabel>Your one sentence</FieldLabel>
      <Input placeholder="Why this plan, in your words" />
      <FieldDescription>Shown on Today when a month is hard.</FieldDescription>
    </Field>
  ),
};

export const Numeric: Story = {
  render: () => (
    <Field>
      <FieldLabel>Monthly amount</FieldLabel>
      <NumericInput defaultValue="250,00" />
      <FieldDescription>In euros, on the buy day of each month.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Monthly amount');
    await expect(input).toHaveAttribute('inputmode', 'decimal');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

export const CalendarDate: Story = {
  render: () => (
    <Field>
      <FieldLabel>First buy</FieldLabel>
      <DateInput defaultValue="2026-11-01" min="2026-10-17" />
    </Field>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Field invalid>
      <FieldLabel>Units</FieldLabel>
      <NumericInput defaultValue="1,234,56" />
      <FieldError>Enter a number such as 0,0125.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Units')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Disabled: Story = {
  render: () => (
    <Field disabled>
      <FieldLabel>Pay currency</FieldLabel>
      <Input defaultValue="EUR" />
    </Field>
  ),
};
