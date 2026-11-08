import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WhyLink } from './why-link';

// The link inside a sentence, and on a line of its own at the 44 px target.

const NAME = 'Why? The hold phase';
const IDEA = "The fixture's one idea, for the tests and the stories.";

const meta = {
  title: 'Features/Learn/WhyLink',
  component: WhyLink,
  args: { module: 'start-here', section: 'a-section', name: NAME },
  decorators: [
    (Story) => (
      <p className="p-gutter text-16 text-ink-2">
        <Story />
      </p>
    ),
  ],
} satisfies Meta<typeof WhyLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InASentence: Story = {
  play: async ({ canvas, canvasElement }) => {
    const link = canvas.getByRole('button', { name: NAME });
    await expect(link).toHaveTextContent('Why?');
    await userEvent.click(link);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('dialog', { name: IDEA })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(link));
  },
};

export const Standalone: Story = {
  args: { standalone: true },
  play: async ({ canvas }) => {
    const { width, height } = canvas.getByRole('button', { name: NAME }).getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  },
};
