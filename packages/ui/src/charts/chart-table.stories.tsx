import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Table, TableBody, TableCell, TableExpandableRow } from '../components/table';
import { ChartTable } from './chart-table';

// A chart's table view stacks each row's cells while its columns are wider than its box (docs/DESIGN.md §8), as
// Today's dates table does with pt-PT's long dates in a 360 px phone's column (328 px), at every viewport.

const meta = {
  title: 'Charts/ChartTable',
  component: ChartTable,
  decorators: [
    (Story) => (
      <div data-testid="column">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const columns = ['Phase', 'From', 'To'];

/** A date as the app writes it, with no-break spaces (docs/CONTENT-STYLE.md §4), so it never wraps inside its cell. */
const date = (text: string) => text.replaceAll(' ', ' ');

export const LongDates: Story = {
  args: {
    summary: 'Show the dates as a table',
    columns,
    rows: [
      ['Buying', date('28 de fevereiro de 2026'), date('28 de fevereiro de 2027')],
      ['Holding', date('28 de fevereiro de 2027'), date('20 de setembro de 2028')],
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    const seen: string[] = [];
    const listen = (event: ErrorEvent) => seen.push(event.message);
    window.addEventListener('error', listen);
    const table = await open(canvas, canvasElement);
    await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
    // Closed, it is not checked; reopened, it is checked again and stays stacked.
    await userEvent.click(canvas.getByText('Show the dates as a table'));
    await userEvent.click(canvas.getByText('Show the dates as a table'));
    await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
    window.removeEventListener('error', listen);
    await expect(seen).toEqual([]);
  },
};

export const EnglishDates: Story = {
  args: {
    summary: 'Show the dates as a table',
    columns,
    rows: [
      ['Buying', date('28 Feb 2026'), date('28 Feb 2027')],
      ['Holding', date('28 Feb 2027'), date('20 Sep 2028')],
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    const table = await open(canvas, canvasElement);
    // Two frames: the probe's ResizeObserver has reported the 328 px column by then.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(table).not.toHaveAttribute('data-stacked');
  },
};

// Portfolio's Holdings in pt-PT: a coin's daily closes open in its detail row, a cell of a table that does not
// stack. The table view fills the cell without widening it, so it stacks, and the holdings stay inside their box.
export const InsideATableCell: Story = {
  args: {
    summary: 'Show the daily closes as a table',
    columns: ['Data', 'Fecho', 'Comprado', 'Vendido'],
    rows: [
      [date('16 de novembro de 2026'), date('84 123,45 €'), date('100,00 €'), ''],
      [date('15 de novembro de 2026'), date('83 990,12 €'), '', date('1 250,00 €')],
    ],
    numericColumns: [1, 2, 3],
  },
  render: (args) => (
    <Table label="Holdings">
      <TableBody>
        <TableExpandableRow summary="BTC" colSpan={2} defaultOpen detail={<ChartTable {...args} />}>
          <TableCell numeric>{date('1 329,00 €')}</TableCell>
        </TableExpandableRow>
      </TableBody>
    </Table>
  ),
  play: async ({ canvas, canvasElement }) => {
    const seen: string[] = [];
    const listen = (event: ErrorEvent) => seen.push(event.message);
    window.addEventListener('error', listen);
    const table = await open(canvas, canvasElement, 'Show the daily closes as a table');
    await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
    const scroller = canvasElement.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (scroller === null) throw new Error('the story renders the holdings table');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
    // Whenever it does scroll, its wrapper is a named tab stop (WCAG 2.1.1).
    if (scroller.scrollWidth > scroller.clientWidth) {
      await expect(scroller).toHaveAttribute('tabindex', '0');
      await expect(scroller).toHaveAttribute('role', 'region');
    }
    window.removeEventListener('error', listen);
    await expect(seen).toEqual([]);
  },
};

/** Opens the table view in a 328 px column and returns its table. */
async function open(
  canvas: Parameters<NonNullable<Story['play']>>[0]['canvas'],
  canvasElement: HTMLElement,
  summary = 'Show the dates as a table',
) {
  const column = canvasElement.querySelector<HTMLElement>('[data-testid="column"]');
  const details = canvasElement.querySelector<HTMLElement>('details[data-slot="chart-table"]');
  const table = details?.querySelector('table');
  if (column === null || details == null || table == null) throw new Error('the story renders the table view');
  column.style.width = '328px';
  await userEvent.click(canvas.getByText(summary));
  await expect(details).toHaveAttribute('open');
  return table;
}
