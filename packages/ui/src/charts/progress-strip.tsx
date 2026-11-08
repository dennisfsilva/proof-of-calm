import type { Strip, StripSegment } from '@proofofcalm/core';
import { cn } from '#lib/utils';
import { ChartTable, type ChartTableProps } from './chart-table';

// The Buy / Hold / Sell strip with the today marker (docs/DESIGN.md §8, docs/DOMAIN.md §3.10). It draws
// the core's strip geometry as it is: the positions are ratios from 0 to 1, used directly as x in a
// viewBox one unit wide, stretched to the width with strokes that keep their pixel size. Phases differ
// by weight and by their text below, not by hue; the accent marks today and nothing else.

type ProgressStripProps = {
  strip: Strip;
  /** One entry per phase in order, already formatted by the shell ("Buy", "Jan 2026 to Dec 2026"). */
  phases: readonly { readonly kind: StripSegment['kind']; readonly label: string; readonly range: string }[];
  /** The summary read by assistive technology: the phases and where today is. */
  label: string;
  description?: string;
  table: ChartTableProps;
  className?: string;
};

const HEIGHT = 20;
const BAR_Y = 12;

const SEGMENT: Record<StripSegment['kind'], { width: number; className: string; dashed: boolean }> = {
  buy: { width: 8, className: 'stroke-line-2', dashed: false },
  hold: { width: 2, className: 'stroke-line-2', dashed: false },
  sell: { width: 8, className: 'stroke-ink-2', dashed: false },
  exit: { width: 2, className: 'stroke-line-2', dashed: true },
};

function ProgressStrip({ strip, phases, label, description, table, className }: ProgressStripProps) {
  return (
    <figure data-slot="progress-strip" className={cn('flex flex-col gap-stack-sm', className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 1 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-(--strip-height) w-full overflow-visible"
      >
        {description !== undefined && <desc>{description}</desc>}
        {strip.segments.map((segment) => {
          const style = SEGMENT[segment.kind];
          return (
            <line
              key={segment.kind}
              x1={segment.from}
              x2={segment.to}
              y1={BAR_Y}
              y2={BAR_Y}
              strokeWidth={style.width}
              strokeDasharray={style.dashed || (segment.kind === 'hold' && segment.openEnded) ? '4 4' : undefined}
              vectorEffect="non-scaling-stroke"
              className={style.className}
            />
          );
        })}
        {strip.peak !== null && (
          <line
            x1={strip.peak.from}
            x2={strip.peak.to}
            y1={HEIGHT - 1}
            y2={HEIGHT - 1}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-3"
          />
        )}
        <line
          x1="0"
          x2={strip.elapsed}
          y1={BAR_Y}
          y2={BAR_Y}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-ink"
        />
        {strip.today !== null && (
          <g data-slot="progress-strip-today" className="stroke-accent">
            <line
              x1={strip.today}
              x2={strip.today}
              y1={4}
              y2={HEIGHT}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <path d={`M${strip.today} 4h0`} strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <ol aria-hidden className="flex flex-wrap gap-x-stack-lg gap-y-stack-xs">
        {phases.map((phase) => (
          <li key={phase.kind} className="flex flex-col">
            <span className="font-semibold text-13 text-ink">{phase.label}</span>
            <span className="nums text-13 text-ink-2">{phase.range}</span>
          </li>
        ))}
      </ol>
      <ChartTable {...table} />
    </figure>
  );
}

export { ProgressStrip, type ProgressStripProps };
