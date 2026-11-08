import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { Input } from './input';

const meta = {
  title: 'Components/Field',
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Labelled: Story = {
  render: () => (
    <Field>
      <FieldLabel>Plan name</FieldLabel>
      <Input defaultValue="Monthly bitcoin" />
      <FieldDescription>Shown on Today and in the export.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Plan name');
    await expect(input).toHaveAccessibleDescription('Shown on Today and in the export.');
  },
};

export const WithError: Story = {
  render: () => (
    <Field invalid>
      <FieldLabel>Plan name</FieldLabel>
      <Input defaultValue="" />
      <FieldError>Enter a name.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Plan name')).toHaveAttribute('aria-invalid', 'true');
  },
};
