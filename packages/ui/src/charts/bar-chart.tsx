import { cn } from '#lib/utils';
import { ChartTable, type ChartTableProps } from './chart-table';

// The bar chart (ADR-0022, docs/DESIGN.md §4): one horizontal bar per row from a shared zero, its label before it and
// its value after it, both in HTML so the text never stretches. Every row is one `--bar-row` high, so the drawing,
// placed in percent and stretched to the labels' height, lines up with them at any text size. One series in the
// neutral fill: the labels name each bar, so colour carries nothing. The table holds the same values.

type BarChartBar = {
  readonly id: string;
  /** The bar's name, formatted by the shell ("BTC 2017"). */
  readonly label: string;
  /** The bar's length as a fraction of the drawing's width (0 to 1). */
  readonly fraction: number;
  /** The value as the shell formats it ("−84%"). */
  readonly value: string;
};

type BarChartProps = {
  bars: readonly BarChartBar[];
  /** The summary read by assistive technology: the series and its range. */
  label: string;
  description?: string;
  table: ChartTableProps;
  className?: string;
};

const percent = (value: number) => `${value * 100}%`;
const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);

function BarChart({ bars, label, description, table, className }: BarChartProps) {
  const rows = Math.max(bars.length, 1);
  return (
    <figure data-slot="bar-chart" className={cn('flex flex-col gap-stack-sm', className)}>
      <div className="flex gap-2">
        <ol aria-hidden className="flex flex-col">
          {bars.map((bar) => (
            <li key={bar.id} className="flex h-(--bar-row) items-center whitespace-nowrap text-13 text-ink-2">
              {bar.label}
            </li>
          ))}
        </ol>
        <div className="relative min-w-0 flex-1">
          <svg role="img" aria-label={label} className="absolute inset-0 size-full overflow-visible">
            {description !== undefined && <desc>{description}</desc>}
            {bars.map((bar, index) => (
              <rect
                key={bar.id}
                data-slot="bar-chart-bar"
                x={0}
                y={percent((index + 0.25) / rows)}
                width={percent(clamp(bar.fraction))}
                height={percent(0.5 / rows)}
                className="fill-coin-other"
              />
            ))}
            <line x1={0} x2={0} y1="0%" y2="100%" strokeWidth={2} className="stroke-line-2" />
          </svg>
        </div>
        <ol aria-hidden className="flex flex-col">
          {bars.map((bar) => (
            <li
              key={bar.id}
              data-slot="bar-chart-value"
              className="nums flex h-(--bar-row) items-center justify-end font-medium text-13 text-ink"
            >
              {bar.value}
            </li>
          ))}
        </ol>
      </div>
      <ChartTable {...table} />
    </figure>
  );
}

export { BarChart, type BarChartBar, type BarChartProps };
