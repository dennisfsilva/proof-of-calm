import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { CoinChip } from './coin-chip';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableExpandableRow,
  TableGroupHeader,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const meta = {
  title: 'Components/Table',
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const holdings = [
  { coin: 'BTC', value: '2 412,50 €', pnl: '+212,50 €', units: '0.03712000 BTC', average: '59 266,16 €' },
  { coin: 'ETH', value: '612,30 €', pnl: '−87,70 €', units: '0.240000 ETH', average: '2 916,67 €' },
];

export const Holdings: Story = {
  render: () => (
    <Table>
      <TableCaption>Holdings on 17 October 2026, prices from 14:05</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Coin</TableHead>
          <TableHead scope="col" numeric>
            Value
          </TableHead>
          <TableHead scope="col" numeric>
            Gain or loss
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => (
          <TableExpandableRow
            key={holding.coin}
            summary={holding.coin}
            colSpan={3}
            detail={
              <dl className="grid grid-cols-2 gap-x-stack-md gap-y-stack-xs text-14">
                <dt className="text-ink-2">Units</dt>
                <dd className="nums text-right">{holding.units}</dd>
                <dt className="text-ink-2">Average cost</dt>
                <dd className="nums text-right">{holding.average}</dd>
              </dl>
            }
          >
            <TableCell numeric>{holding.value}</TableCell>
            <TableCell numeric>{holding.pnl}</TableCell>
          </TableExpandableRow>
        ))}
      </TableBody>
    </Table>
  ),
  play: async ({ canvas }) => {
    const btc = canvas.getByRole('button', { name: 'BTC' });
    await expect(btc).toHaveAttribute('aria-expanded', 'false');
    await expect(btc.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(btc);
    await expect(btc).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('0.03712000 BTC')).toBeVisible();
  },
};

// A focused row's ring lies wholly inside the scrolling wrapper, whose overflow would otherwise clip it at the
// left edge and under the last row (docs/DESIGN.md §6 and §8): the first and the last row, by keyboard.
export const FocusedRowRing: Story = {
  ...Holdings,
  play: async ({ canvas, canvasElement }) => {
    const container = canvasElement.querySelector('[data-slot="table-container"]');
    if (!(container instanceof HTMLElement)) throw new Error('the table has its wrapper');
    for (const name of ['BTC', 'ETH']) {
      await userEvent.tab();
      const row = canvas.getByRole('button', { name });
      await expect(row).toHaveFocus();
      const style = getComputedStyle(row);
      const extent = px(style.outlineWidth) + px(style.outlineOffset);
      await expect(extent).toBeGreaterThan(0);
      const box = row.getBoundingClientRect();
      const clip = container.getBoundingClientRect();
      await expect(box.left - extent).toBeGreaterThanOrEqual(clip.left);
      await expect(box.right + extent).toBeLessThanOrEqual(clip.right);
      await expect(box.top - extent).toBeGreaterThanOrEqual(clip.top);
      await expect(box.bottom + extent).toBeLessThanOrEqual(clip.bottom);
    }
  },
};

// No caption, so the `label` names the region on a width where the table scrolls.
export const LogWithMonths: Story = {
  render: () => (
    <Table label="Purchases by month">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Date</TableHead>
          <TableHead scope="col">Kind</TableHead>
          <TableHead scope="col" numeric>
            Total
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableGroupHeader colSpan={3}>October 2026 · bought 250 €</TableGroupHeader>
        <TableRow>
          <TableCell className="nums">5 Oct 2026</TableCell>
          <TableCell>
            <span className="flex flex-wrap gap-1">
              <CoinChip coin="BTC" colour="btc" amount="175 €" />
              <CoinChip coin="ETH" colour="eth" amount="75 €" />
            </span>
          </TableCell>
          <TableCell numeric>250,00 €</TableCell>
        </TableRow>
        <TableGroupHeader colSpan={3}>September 2026 · skipped</TableGroupHeader>
        <TableRow>
          <TableCell className="nums">5 Sep 2026</TableCell>
          <TableCell className="text-ink-2">Skipped: travelling</TableCell>
          <TableCell numeric>0,00 €</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

// Wider than its column at every width: the wrapper scrolls, so it becomes a region named by the
// caption with a tab stop, and the keyboard reaches it.
export const Scrolling: Story = {
  render: () => (
    <div className="max-w-xs">
      <Table>
        <TableCaption>Bought each month</TableCaption>
        <TableHeader>
          <TableRow>
            {months.map((month) => (
              <TableHead key={month} scope="col" numeric>
                {month} 2026
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            {months.map((month) => (
              <TableCell key={month} numeric>
                2412,50 €
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Bought each month' });
    await expect(region).toHaveAttribute('tabindex', '0');
    await userEvent.tab();
    await expect(region).toHaveFocus();
  },
};

// A computed CSS length in pixels.
function px(value: string) {
  return Number(value.replace('px', ''));
}
