import { SERIES_STROKE, type SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';
import { ChartTable, type ChartTableProps } from './chart-table';

// A small line without axes (ADR-0022). The path comes from the core's chart maths in the given viewBox;
// the SVG stretches to its box and the 2 px stroke keeps its width. The last point can carry a marker.

type SparklineProps = {
  viewBox: { readonly width: number; readonly height: number };
  /** SVG path data in viewBox units. */
  path: string;
  colour: SeriesColour;
  /** The marker at the last point, in viewBox units. */
  end?: { readonly x: number; readonly y: number };
  /** States the series, the range and the change. */
  label: string;
  description?: string;
  table: ChartTableProps;
  className?: string;
};

function Sparkline({ viewBox, path, colour, end, label, description, table, className }: SparklineProps) {
  const stroke = SERIES_STROKE[colour];
  return (
    <figure data-slot="sparkline" className={cn('flex flex-col', className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="none"
        className="h-(--sparkline-height) w-full overflow-visible"
      >
        {description !== undefined && <desc>{description}</desc>}
        <path
          d={path}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={stroke}
        />
        {end !== undefined && (
          <path
            d={`M${end.x} ${end.y}h0`}
            strokeWidth={8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className={stroke}
          />
        )}
      </svg>
      <ChartTable {...table} />
    </figure>
  );
}

export { Sparkline, type SparklineProps };
