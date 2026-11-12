import { LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import Body from '../fixtures/start-here.mdx';
import TaxesBody from '../fixtures/taxes-where-you-live.mdx';
import { TAXES_MODULE } from '../lib/taxes';
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

const TAXES = LEARN_MODULES.find((module) => module.slug === TAXES_MODULE) as LearnModuleMeta;

// The tax module the day after its next review was due: the line says so with `review overdue` in ink, and the
// sentence stands on its own line at the line's size (docs/CONTENT-STYLE.md §5).
export const TaxesOverdue: Story = {
  args: { module: TAXES, Body: TaxesBody },
  parameters: { path: `/learn/${TAXES_MODULE}`, nowMs: Date.parse('2027-01-02T10:00:00Z') },
  play: async ({ canvas }) => {
    const line = canvas.getByRole('heading', { level: 1, name: 'Taxes where you live' }).nextElementSibling;
    await expect(line?.textContent).toMatch(/^Last reviewed 9\sNov\s2026 · review overdue$/u);
    await expect(canvas.getByText('review overdue')).toBeVisible();
    await expect(
      canvas.getByText('Rules may have changed since this date. Check your tax authority before filing.'),
    ).toBeVisible();
  },
};

// The day it is due, the line names that day instead.
export const TaxesDue: Story = {
  args: { module: TAXES, Body: TaxesBody },
  parameters: { path: `/learn/${TAXES_MODULE}`, nowMs: Date.parse('2027-01-01T10:00:00Z') },
  play: async ({ canvas }) => {
    const line = canvas.getByRole('heading', { level: 1, name: 'Taxes where you live' }).nextElementSibling;
    await expect(line?.textContent).toMatch(/^Last reviewed 9\sNov\s2026 · Next review due 1\sJan\s2027$/u);
  },
};
