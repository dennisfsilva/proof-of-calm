import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
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

// The stacking table (docs/DESIGN.md §8): its columns side by side while they fit its box, each row's cells stacked
// while they are wider, measured afresh at each change. The box, 384 px at every viewport, lies between the columns'
// width in English (about 345 px) and in pt-PT (about 430 px). The strings are the app's formats of one purchase:
// pt-PT's long dates (docs/CONTENT-STYLE.md §4) and English.

type Purchase = readonly [date: string, units: string, paid: string];

const PT: readonly Purchase[] = [
  ['28 de fevereiro de 2027', '0,240000 ETH', '12 345,67 €'],
  ['20 de setembro de 2026', '0,037120 ETH', '612,30 €'],
];
const EN: readonly Purchase[] = [
  ['28 Feb 2027', '0.240000 ETH', '€12,345.67'],
  ['20 Sep 2026', '0.037120 ETH', '€612.30'],
];

function Purchases({ rows }: { rows: readonly Purchase[] }) {
  return (
    <div data-testid="box">
      <Table stack label="Purchases">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col" numeric>
              Units
            </TableHead>
            <TableHead scope="col" numeric>
              Paid
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([date, units, paid]) => (
            <TableExpandableRow
              key={date}
              summary={<span className="whitespace-nowrap">{date}</span>}
              colSpan={3}
              detail={<p className="nums">{units}</p>}
            >
              <TableCell numeric>{units}</TableCell>
              <TableCell numeric>{paid}</TableCell>
            </TableExpandableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The window errors a play function saw, the ResizeObserver loop's among them. */
function windowErrors() {
  const seen: string[] = [];
  const listen = (event: ErrorEvent) => seen.push(event.message);
  window.addEventListener('error', listen);
  return {
    seen,
    stop: () => window.removeEventListener('error', listen),
  };
}

/**
 * Whether the table is wider than its box with its columns side by side, measured now; the attribute is restored.
 * Never inside waitFor, whose MutationObserver would run it again on each toggle of the attribute.
 */
function measuredWider(table: HTMLTableElement) {
  const stacked = table.hasAttribute('data-stacked');
  table.removeAttribute('data-stacked');
  const box = table.parentElement?.firstElementChild?.getBoundingClientRect().width ?? 0;
  const wider = table.getBoundingClientRect().width - box > 0.01;
  table.toggleAttribute('data-stacked', stacked);
  return wider;
}

function parts(canvasElement: HTMLElement) {
  const box = canvasElement.querySelector<HTMLElement>('[data-testid="box"]');
  const table = canvasElement.querySelector<HTMLTableElement>('table');
  if (box === null || table === null) throw new Error('the story renders its box and table');
  return { box, table };
}

const between = (box: HTMLElement) => {
  box.style.width = '384px';
};

/** Two frames: the probe's ResizeObserver has reported the box by then. */
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export const StacksLongDates: Story = {
  render: () => <Purchases rows={PT} />,
  play: async ({ canvasElement }) => {
    const errors = windowErrors();
    const { box, table } = parts(canvasElement);
    between(box);
    await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
    await expect(measuredWider(table)).toBe(true);
    // Stacked, each row's amount sits below its date.
    for (const row of table.querySelectorAll('tbody tr[data-slot="table-row"]')) {
      const [date, , paid] = row.querySelectorAll('td');
      await expect((paid?.getBoundingClientRect().top ?? 0) >= (date?.getBoundingClientRect().bottom ?? 0)).toBe(true);
    }
    // Shorter rows lay the columns side by side again: nothing kept from the stacked check holds them.
    const english = new Map(PT.flatMap((row, index) => row.map((text, cell) => [text, EN[index]?.[cell] ?? text])));
    for (const element of table.querySelectorAll('tbody *')) {
      const text = element.childElementCount === 0 ? english.get(element.textContent ?? '') : undefined;
      if (text !== undefined) element.textContent = text;
    }
    await waitFor(() => expect(table).not.toHaveAttribute('data-stacked'));
    await expect(measuredWider(table)).toBe(false);
    errors.stop();
    await expect(errors.seen).toEqual([]);
  },
};

export const KeepsColumnsInEnglish: Story = {
  render: () => <Purchases rows={EN} />,
  play: async ({ canvasElement }) => {
    const { box, table } = parts(canvasElement);
    between(box);
    await frames();
    await expect(measuredWider(table)).toBe(false);
    await expect(table).not.toHaveAttribute('data-stacked');
  },
};

// The text size alone decides it: in a box a little wider than the columns at 16 px, a 20 px root stacks the table
// and 16 px turns it back.
export const StacksWithTheTextSize: Story = {
  render: () => <Purchases rows={EN} />,
  play: async ({ canvasElement }) => {
    const errors = windowErrors();
    const root = document.documentElement;
    const before = root.style.fontSize;
    const { box, table } = parts(canvasElement);
    try {
      root.style.fontSize = '16px';
      box.style.width = '0px';
      await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
      table.removeAttribute('data-stacked');
      const columns = table.getBoundingClientRect().width;
      box.style.width = `${Math.ceil(columns) + 8}px`;
      await waitFor(() => expect(table).not.toHaveAttribute('data-stacked'));
      root.style.fontSize = '20px';
      await waitFor(() => expect(table).toHaveAttribute('data-stacked'));
      root.style.fontSize = '16px';
      await waitFor(() => expect(table).not.toHaveAttribute('data-stacked'));
    } finally {
      root.style.fontSize = before;
    }
    errors.stop();
    await expect(errors.seen).toEqual([]);
  },
};

// A computed CSS length in pixels.
function px(value: string) {
  return Number(value.replace('px', ''));
}
