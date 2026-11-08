import { BACKDROP_STROKE, type Backdrop } from '#lib/backdrop';
import { SERIES_FILL, type SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';
import { ChartTable, type ChartTableProps } from './chart-table';

// The allocation bar (ADR-0022, docs/DESIGN.md §4): one row of fills, each coin's share, with 2 px gaps in
// the colour of what the bar sits on. Positions are fractions of the whole, so the viewBox is one unit
// wide; the bar's ends are rounded by its frame. The legend names every fill, so colour is never alone;
// where the holdings table is the legend, turn it off.

type AllocationSegment = {
  readonly id: string;
  readonly label: string;
  readonly colour: SeriesColour;
  /** Where the fill starts and ends, as fractions of the whole (0 to 1). */
  readonly start: number;
  readonly end: number;
  /** The share as the shell formats it ("62 %"). */
  readonly share: string;
};

type AllocationBarProps = {
  segments: readonly AllocationSegment[];
  /** The colour behind the bar, which the gaps show. */
  on?: Backdrop;
  legend?: boolean;
  label: string;
  description?: string;
  table: ChartTableProps;
  className?: string;
};

function AllocationBar({
  segments,
  on = 'surface',
  legend = true,
  label,
  description,
  table,
  className,
}: AllocationBarProps) {
  return (
    <figure data-slot="allocation-bar" className={cn('flex flex-col gap-stack-sm', className)}>
      <div className="overflow-hidden rounded-full">
        <svg
          role="img"
          aria-label={label}
          viewBox="0 0 1 8"
          preserveAspectRatio="none"
          className="block h-(--allocation-height) w-full"
        >
          {description !== undefined && <desc>{description}</desc>}
          {segments.map((segment) => (
            <rect
              key={segment.id}
              x={segment.start}
              y={0}
              width={Math.max(segment.end - segment.start, 0)}
              height={8}
              className={SERIES_FILL[segment.colour]}
            />
          ))}
          {segments.slice(1).map((segment) => (
            <line
              key={segment.id}
              x1={segment.start}
              x2={segment.start}
              y1={0}
              y2={8}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className={BACKDROP_STROKE[on]}
            />
          ))}
        </svg>
      </div>
      {legend && (
        <ul data-slot="allocation-legend" className="flex flex-wrap gap-x-stack-md gap-y-stack-xs">
          {segments.map((segment) => (
            <li key={segment.id} className="inline-flex items-center gap-2 text-13 text-ink-2">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', SERIES_FILL[segment.colour])} />
              {segment.label}
              <span className="nums font-medium text-ink">{segment.share}</span>
            </li>
          ))}
        </ul>
      )}
      <ChartTable {...table} />
    </figure>
  );
}

export { AllocationBar, type AllocationBarProps, type AllocationSegment };
