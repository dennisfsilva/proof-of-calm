import { SERIES_FILL, SERIES_STROKE, type SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';
import { type ChartAxis, ChartFrame, ChartLegend, ChartLegendItem } from './chart-frame';
import { ChartTable, type ChartTableProps } from './chart-table';

// The value chart (ADR-0022, docs/DESIGN.md §4): one axis, 2 px lines coloured by entity, recessive
// gridlines in line, a legend from two series up, and the table view. The paths and gridlines come from
// the core's chart maths in viewBox units; the SVG stretches to its box with strokes and markers that
// keep their pixel size. Text stays in HTML so it never stretches: the axis extremes beside and below.

type LineSeries = {
  readonly id: string;
  readonly label: string;
  readonly colour: SeriesColour;
  /** SVG path data in viewBox units. */
  readonly path: string;
  /** The marker at the last point, in viewBox units. */
  readonly end?: { readonly x: number; readonly y: number };
};

type LineChartProps = {
  viewBox: { readonly width: number; readonly height: number };
  series: readonly LineSeries[];
  /** Horizontal gridlines, as y in viewBox units. */
  gridlines?: readonly number[];
  axis: ChartAxis;
  /** States the series, the range and the change ("Portfolio value, last year, from 1,200 € to 1,860 €, +55 %"). */
  label: string;
  description?: string;
  table: ChartTableProps;
  className?: string;
};

function LineChart({ viewBox, series, gridlines = [], axis, label, description, table, className }: LineChartProps) {
  return (
    <figure data-slot="line-chart" className={cn('flex flex-col gap-stack-xs', className)}>
      <ChartFrame axis={axis}>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="none"
          className="h-(--chart-height) min-w-0 flex-1 overflow-visible"
        >
          {description !== undefined && <desc>{description}</desc>}
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
          {series.map((line) => (
            <g key={line.id} className={SERIES_STROKE[line.colour]}>
              <path
                d={line.path}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {line.end !== undefined && (
                <path
                  d={`M${line.end.x} ${line.end.y}h0`}
                  strokeWidth={8}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
        </svg>
      </ChartFrame>
      {series.length > 1 && (
        <ChartLegend data-slot="line-chart-legend">
          {series.map((line) => (
            <ChartLegendItem
              key={line.id}
              swatch={<span aria-hidden className={cn('h-0.5 w-4 shrink-0 rounded-full', SERIES_FILL[line.colour])} />}
            >
              {line.label}
            </ChartLegendItem>
          ))}
        </ChartLegend>
      )}
      <ChartTable {...table} />
    </figure>
  );
}

export { LineChart, type LineChartProps, type LineSeries };
