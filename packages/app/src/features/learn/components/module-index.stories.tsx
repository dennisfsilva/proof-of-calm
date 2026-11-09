import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ModuleIndex } from './module-index';

// Learn's index with modules and with none, each ending with the countries row, in the page's measure; the
// test projects of vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const start: LearnModuleMeta = {
  slug: 'start-here',
  title: 'Start here',
  idea: 'The fixture idea of the first module, one line at most on a wide screen.',
  caveat: 'One caveat.',
  chart: 'none',
  facts: [],
  lastReviewed: '2026-10-30',
  nextReviewDue: '2027-10-30',
  reviewedBy: 'agent-draft',
  words: 300,
  readingMinutes: 2,
};

const meta = {
  title: 'Features/Learn/ModuleIndex',
  component: ModuleIndex,
  parameters: { path: '/learn' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleIndex>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Modules: Story = {
  args: {
    modules: [
      start,
      { ...start, slug: 'cycles', title: 'Cycles', idea: 'The fixture idea of another module.', readingMinutes: 3 },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /^Start here/ })).toHaveAttribute('href', '/start-here');
    await expect(canvas.getByText('3 min read')).toBeVisible();
    await expect(canvas.getAllByRole('link').at(-1)).toHaveAttribute('href', '/countries');
  },
};

export const DuringAFall: Story = {
  args: { modules: [start], thisFall: true },
  play: async ({ canvas }) => {
    const rows = canvas.getAllByRole('link');
    await expect(rows[0]).toHaveAttribute('href', '/this-fall');
    await expect(rows[0]).toHaveTextContent(/^This fall and your plan/);
  },
};

export const NoModules: Story = {
  args: { modules: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await expect(canvas.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/countries']);
  },
};
