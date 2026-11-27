import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { SimulatorChart } from './simulator-chart';

// The simulator's chart (docs/EDUCATION.md §7): a year of 100 € a month whose value falls below an earlier high
// three times, the last fall not recovered by the end. The paths are what packages/core's linePath and
// underwaterPath write for these values on a 300 × 100 viewBox with 1 500 € at the top.

const months = [
  'October 2025',
  'November 2025',
  'December 2025',
  'January 2026',
  'February 2026',
  'March 2026',
  'April 2026',
  'May 2026',
  'June 2026',
  'July 2026',
  'August 2026',
  'September 2026',
];
const euros = (amount: number) => `${amount.toLocaleString('en-GB').replace(',', ' ')} €`;
/** The table's rows: each month's value and the money invested by then, 100 € a month. */
const rows = (values: readonly number[]) =>
  months.map((month, index) => [month, euros(values[index] ?? 0), euros((index + 1) * 100)]);

const meta = {
  title: 'Charts/Simulator chart',
  component: SimulatorChart,
  args: {
    viewBox: { width: 300, height: 100 },
    gridlines: [0, 50, 100],
    value:
      'M0 93.3L27.3 87.3L54.5 78L81.8 82.7L109.1 80L136.4 62.7L163.6 52L190.9 59.3L218.2 57.3L245.5 34.7L272.7 23.3L300 32.7',
    invested:
      'M0 93.3L27.3 86.7L54.5 80L81.8 73.3L109.1 66.7L136.4 60L163.6 53.3L190.9 46.7L218.2 40L245.5 33.3L272.7 26.7L300 20',
    underwater:
      'M54.5 78L109.1 78L136.4 62.7L109.1 80L81.8 82.7ZM163.6 52L218.2 52L245.5 34.7L218.2 57.3L190.9 59.3ZM272.7 23.3L300 23.3L300 32.7Z',
    legend: { value: 'Value', invested: 'Invested', underwater: 'Below an earlier high' },
    axis: { top: '1 500 €', bottom: '0 €', start: 'Oct 2025', end: 'Sep 2026' },
    label: 'Simulated value and money invested, October 2025 to September 2026: value from 100 € to 1 010 €',
    description: 'The value fell below an earlier high three times; the last fall had not recovered by September 2026.',
    table: {
      summary: 'Show the values as a table',
      columns: ['Month', 'Value', 'Invested'],
      rows: rows([100, 190, 330, 260, 300, 560, 720, 610, 640, 980, 1150, 1010]),
      numericColumns: [1, 2],
    },
  },
} satisfies Meta<typeof SimulatorChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Falls: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getByRole('img', { name: args.label })).toBeVisible();
    // Every mark the chart draws is named in the legend.
    const legend = canvasElement.querySelector('[data-slot="simulator-chart-legend"]');
    await expect(legend).toHaveTextContent('Value');
    await expect(legend).toHaveTextContent('Invested');
    await expect(legend).toHaveTextContent('Below an earlier high');
    // One shaded path holds every fall, one closed subpath each, under the two lines.
    const shading = canvasElement.querySelectorAll('[data-slot="simulator-chart-underwater"]');
    await expect(shading).toHaveLength(1);
    await expect(shading[0]?.getAttribute('d')?.match(/Z/g)).toHaveLength(3);
    await expect(shading[0]?.nextElementSibling).toHaveAttribute('data-slot', 'simulator-chart-invested');
    // The table toggle opens the same values as text. Its <summary> has no ARIA role that testing-library maps, so
    // it is found by its words, the name a browser gives it.
    const toggle = canvas.getByText(args.table.summary);
    await expect(toggle.tagName).toBe('SUMMARY');
    await userEvent.click(toggle);
    const table = canvas.getByRole('table');
    await waitFor(() => expect(table).toBeVisible());
    await expect(canvas.getAllByRole('row')).toHaveLength(13);
    await expect(canvas.getByRole('columnheader', { name: 'Invested' })).toBeVisible();
  },
};

/** A year that only rises: nothing is shaded, and the legend names only the two lines. */
export const NoFall: Story = {
  args: {
    value:
      'M0 93.3L27.3 86.3L54.5 79L81.8 71.3L109.1 64L136.4 56L163.6 48L190.9 40L218.2 32L245.5 23.3L272.7 14.7L300 6.7',
    underwater: '',
    label: 'Simulated value and money invested, October 2025 to September 2026: value from 100 € to 1 400 €',
    description: 'The value did not fall below an earlier high.',
    table: {
      summary: 'Show the values as a table',
      columns: ['Month', 'Value', 'Invested'],
      rows: rows([100, 205, 315, 430, 540, 660, 780, 900, 1020, 1150, 1280, 1400]),
      numericColumns: [1, 2],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="simulator-chart-underwater"]')).toBeNull();
    const legend = canvasElement.querySelector('[data-slot="simulator-chart-legend"]');
    await expect(legend).toHaveTextContent('Value');
    await expect(legend).toHaveTextContent('Invested');
    await expect(legend).not.toHaveTextContent('Below an earlier high');
  },
};
