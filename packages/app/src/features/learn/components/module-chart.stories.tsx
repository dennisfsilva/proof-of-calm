import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ModuleChart } from './module-chart';

// The risk module's chart from the cycles file through the red-day port, in the page's measure; the test projects
// of vitest.config.ts render it at 360 and 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Learn/ModuleChart',
  component: ModuleChart,
  args: { chart: 'drawdowns-bar' },
  decorators: [
    (Story) => (
      <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DrawdownsBar: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByRole('img', { name: /^Falls from each completed cycle’s high/ })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-slot="bar-chart-bar"]')).toHaveLength(9);
    await expect(canvas.getByText(/intraday highs and lows/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Risk disclosure' })).toBeVisible();
  },
};
