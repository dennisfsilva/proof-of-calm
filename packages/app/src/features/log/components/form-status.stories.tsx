import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { FormStatus } from './form-status';

// A Log form's one hidden status (docs/DESIGN.md §6): it renders nothing visible and takes the lines once the form has
// stayed unchanged for SETTLE_MS, one paragraph per shown line.
const meta = {
  title: 'Features/Log/FormStatus',
  component: FormStatus,
  args: {
    lines: [
      'Network fee 0,0001 BTC',
      null,
      'The Log already has this move on 20 Feb 2026. Save it only if you moved these coins twice.',
    ],
    typed: {},
  },
} satisfies Meta<typeof FormStatus>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Two shown lines: the status opens empty, then holds both, the null skipped. */
export const TwoLines: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status');
    await expect(status).toBeEmptyDOMElement();
    await waitFor(
      () =>
        expect([...status.querySelectorAll('p')].map((each) => each.textContent)).toEqual([
          'Network fee 0,0001 BTC',
          'The Log already has this move on 20 Feb 2026. Save it only if you moved these coins twice.',
        ]),
      { timeout: 3_000 },
    );
  },
};

/** No shown line: the status stays an empty region. */
export const NoLines: Story = {
  args: { lines: [null, null] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement();
  },
};
