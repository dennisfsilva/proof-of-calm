import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { Textarea } from './textarea';

const meta = {
  title: 'Components/Textarea',
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WhySentence: Story = {
  render: () => (
    <Field className="max-w-reading">
      <FieldLabel>Why this plan, in one sentence</FieldLabel>
      <Textarea placeholder="So that a red month does not change what I decided today." maxLength={200} />
      <FieldDescription>Shown on Today when a month is hard. Up to 200 characters.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const textarea = canvas.getByLabelText('Why this plan, in one sentence');
    await expect(textarea.tagName).toBe('TEXTAREA');
    await expect(textarea).toHaveAccessibleDescription('Shown on Today when a month is hard. Up to 200 characters.');
    const empty = textarea.getBoundingClientRect().height;
    await expect(empty).toBeGreaterThanOrEqual(88);

    await userEvent.tab();
    await expect(textarea).toHaveFocus();
    await expect(getComputedStyle(textarea).outlineStyle).toBe('solid');
    await userEvent.type(textarea, 'To own a part of bitcoin in 2030 without watching the price every day.');
    await expect(textarea).toHaveValue('To own a part of bitcoin in 2030 without watching the price every day.');
  },
};

export const Note: Story = {
  render: () => (
    <Field className="max-w-reading">
      <FieldLabel>Note</FieldLabel>
      <Textarea rows={2} defaultValue="Bought on the exchange app, fee shown after the order." />
    </Field>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Field invalid className="max-w-reading">
      <FieldLabel>Why this plan, in one sentence</FieldLabel>
      <Textarea defaultValue="" />
      <FieldError>Write a sentence, or skip this step.</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Why this plan, in one sentence')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Disabled: Story = {
  render: () => (
    <Field disabled className="max-w-reading">
      <FieldLabel>Note</FieldLabel>
      <Textarea defaultValue="Imported from the prototype." />
    </Field>
  ),
};
