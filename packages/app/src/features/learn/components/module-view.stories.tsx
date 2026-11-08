import { LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import Body from '../fixtures/start-here.mdx';
import { ModuleView } from './module-view';

// One module, the fixture through the real pipeline with every mapped element, in the page's measure; the
// test projects of vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Learn/ModuleView',
  component: ModuleView,
  parameters: { path: '/learn/start-here' },
  args: { module: LEARN_MODULES[0] as LearnModuleMeta, Body },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StartHere: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Start here' })).toBeVisible();
    await expect(canvas.getByText("The fixture's caveat, in its box.")).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'A section' })).toBeVisible();
    await expect(canvas.getByText('A first step')).toBeVisible();
  },
};
