import { cn } from '#lib/utils';
import { type ChartAxis, ChartFrame, ChartLegend, ChartLegendItem } from './chart-frame';
import { ChartTable, type ChartTableProps } from './chart-table';

// The simulator's one chart (docs/EDUCATION.md §7, ADR-0022): the simulated value against the money invested over
// the months simulated, with the drawdown shaded under the running maximum. Composed like LineChart: the paths
// come from the core's chart maths in viewBox units (linePath for the lines, underwaterPath for the shading),
// the SVG stretches to its box with strokes that keep their pixel size, and text stays in HTML. Neither line is
// a coin, so neither takes a series colour: the value is the ink line, the money invested the dashed level.

type SimulatorChartLegend = {
  readonly value: string;
  readonly invested: string;
  /** Names the shading ("Below an earlier high"); shown only while something is shaded. */
  readonly underwater: string;
};

type SimulatorChartProps = {
  viewBox: { readonly width: number; readonly height: number };
  /** The simulated value, SVG path data in viewBox units. */
  value: string;
  /** The money invested to date, SVG path data in viewBox units. */
  invested: string;
  /** underwaterPath's output as it comes: one path, a closed subpath per fall; empty when nothing fell. */
  underwater: string;
  /** Horizontal gridlines, as y in viewBox units. */
  gridlines?: readonly number[];
  axis: ChartAxis;
  legend: SimulatorChartLegend;
  /** States the series, the range with its dates and the first and last values, with no change figure. */
  label: string;
  /** The falls in words: how many, the deepest and the longest under water. */
  description: string;
  table: ChartTableProps;
  className?: string;
};

function SimulatorChart({
  viewBox,
  value,
  invested,
  underwater,
  gridlines = [],
  axis,
  legend,
  label,
  description,
  table,
  className,
}: SimulatorChartProps) {
  const shaded = underwater !== '';
  return (
    <figure data-slot="simulator-chart" className={cn('flex flex-col gap-stack-xs', className)}>
      <ChartFrame axis={axis}>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="none"
          className="h-(--chart-height) min-w-0 flex-1 overflow-visible"
        >
          <desc>{description}</desc>
          {gridlines.map((y) => (
            <line
              key={y}
              x1={0}
              x2={viewBox.width}
              y1={y}
              y2={y}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="stroke-line"
            />
          ))}
          {shaded && <path data-slot="simulator-chart-underwater" d={underwater} className="fill-surface-3" />}
          <path
            data-slot="simulator-chart-invested"
            d={invested}
            fill="none"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-2"
          />
          <path
            data-slot="simulator-chart-value"
            d={value}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-ink"
          />
        </svg>
      </ChartFrame>
      <ChartLegend data-slot="simulator-chart-legend">
        <ChartLegendItem swatch={<span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full bg-ink" />}>
          {legend.value}
        </ChartLegendItem>
        <ChartLegendItem swatch={<span aria-hidden className="w-4 shrink-0 border-ink-2 border-t-2 border-dashed" />}>
          {legend.invested}
        </ChartLegendItem>
        {shaded && (
          <ChartLegendItem swatch={<span aria-hidden className="size-3 shrink-0 rounded-sm bg-surface-3" />}>
            {legend.underwater}
          </ChartLegendItem>
        )}
      </ChartLegend>
      <ChartTable {...table} />
    </figure>
  );
}

export { SimulatorChart, type SimulatorChartLegend, type SimulatorChartProps };
