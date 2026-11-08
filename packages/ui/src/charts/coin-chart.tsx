'use client';

import { type PointerEvent, useState } from 'react';
import { BACKDROP_STROKE, type Backdrop } from '#lib/backdrop';
import { clamp, nearestIndex, percent } from '#lib/chart-geometry';
import type { SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';
import { Tooltip, TooltipContent } from '../components/tooltip';
import { type ChartAxis, ChartFrame } from './chart-frame';
import { ChartTable, type ChartTableProps } from './chart-table';
import { CoinChartLegend, type CoinChartLegendLabels } from './coin-chart-legend';
import { type CoinChartMarker, CoinChartPlot } from './coin-chart-plot';

// One coin's price chart in a holdings row (ADR-0022, docs/DESIGN.md §4, the prototype's drawChart):
// the price line in the coin's colour, a hollow circle at each buy and a hollow square at each sale, the
// dashed level of the average cost labelled at its right end, and a crosshair with a tooltip that follows
// the pointer, by mouse or by a finger sliding sideways. The geometry is the core's, in viewBox units;
// marks keep their pixel size and stay inside the plot (docs/DOMAIN.md §3.14); the table says it all.

type ViewBox = { readonly width: number; readonly height: number };

type CoinChartPoint = {
  /** In viewBox units, ascending. */
  readonly x: number;
  readonly y: number;
  /** What the tooltip says at this point ("5 Oct 2026: 61 640 €, bought 70 €"). */
  readonly label: string;
};

type CoinChartProps = {
  viewBox: ViewBox;
  colour: SeriesColour;
  /** The price line, SVG path data in viewBox units. */
  path: string;
  /** The last point, marked. */
  end?: { readonly x: number; readonly y: number };
  markers?: readonly CoinChartMarker[];
  /** The average cost as a level, labelled at its right end ("Average 59 266 €"); drawn inside the range only. */
  average?: { readonly y: number; readonly label: string };
  /** Horizontal gridlines, as y in viewBox units. */
  gridlines?: readonly number[];
  axis: ChartAxis;
  legend: CoinChartLegendLabels;
  /** The points the crosshair snaps to; leave it out for a chart without hover. */
  points?: readonly CoinChartPoint[];
  /** States the coin, the range, the change and the average ("BTC price, last year, …"). */
  label: string;
  description?: string;
  table: ChartTableProps;
  /** The colour behind the chart, which fills the hollow marks. */
  on?: Backdrop;
  className?: string;
};

/** The point under the pointer; it stays after the pointer leaves, so the tooltip fades out in place. */
type Hover = { readonly index: number; readonly plot: HTMLElement; readonly active: boolean };

/** Where the tooltip points: the hovered point on the screen, read whenever Base UI positions it. */
function anchorAt(plot: HTMLElement, point: CoinChartPoint, viewBox: ViewBox) {
  return {
    contextElement: plot,
    getBoundingClientRect: () => {
      const box = plot.getBoundingClientRect();
      const left = box.left + (point.x / viewBox.width) * box.width;
      const top = box.top + (point.y / viewBox.height) * box.height;
      return new DOMRect(left, top, 0, 0);
    },
  };
}

function CoinChart(props: CoinChartProps) {
  const { viewBox, markers = [], average, points = [], on = 'surface' } = props;
  const [hover, setHover] = useState<Hover | null>(null);
  const last = hover === null ? undefined : points[hover.index];
  const point = hover?.active ? last : undefined;
  const shown = markers
    .filter((marker) => marker.x >= 0 && marker.x <= viewBox.width)
    .map((marker) => ({ ...marker, y: clamp(marker.y, 0, viewBox.height) }));
  const level = average !== undefined && average.y >= 0 && average.y <= viewBox.height ? average : undefined;
  const hoverable = points.length > 0;

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const plot = event.currentTarget;
    const box = plot.getBoundingClientRect();
    const index = nearestIndex(
      points.map((each) => each.x),
      ((event.clientX - box.left) / box.width) * viewBox.width,
    );
    setHover((previous) =>
      previous?.active && previous.index === index && previous.plot === plot ? previous : { index, plot, active: true },
    );
  };
  const leave = () => setHover((previous) => (previous === null ? null : { ...previous, active: false }));

  return (
    <figure data-slot="coin-chart" className={cn('flex flex-col gap-stack-xs', props.className)}>
      <ChartFrame axis={props.axis}>
        <div
          data-slot="coin-chart-plot"
          onPointerMove={hoverable ? follow : undefined}
          onPointerDown={hoverable ? follow : undefined}
          onPointerLeave={hoverable ? leave : undefined}
          className={cn('relative min-w-0 flex-1', hoverable && 'cursor-crosshair touch-pan-y')}
        >
          <CoinChartPlot
            viewBox={viewBox}
            colour={props.colour}
            path={props.path}
            end={props.end}
            markers={shown}
            level={level?.y}
            gridlines={props.gridlines ?? []}
            crosshair={point}
            on={on}
            label={props.label}
            description={props.description}
          />
          {level !== undefined && (
            // SVG text in an overlay without a viewBox, placed in percent: it sits on the level at the
            // plot's right end, never stretches, and needs no style attribute (docs/SECURITY.md §4).
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <text
                data-slot="coin-chart-average-label"
                x="100%"
                y={percent(level.y / viewBox.height)}
                dy="-0.5em"
                textAnchor="end"
                paintOrder="stroke"
                strokeWidth={4}
                strokeLinejoin="round"
                className={cn('nums fill-ink-2 text-13', BACKDROP_STROKE[on])}
              >
                {level.label}
              </text>
            </svg>
          )}
          {hoverable && (
            <Tooltip open={point !== undefined}>
              <TooltipContent
                {...(hover === null || last === undefined ? {} : { anchor: anchorAt(hover.plot, last, viewBox) })}
              >
                {last?.label}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </ChartFrame>
      <CoinChartLegend
        labels={props.legend}
        colour={props.colour}
        on={on}
        buys={shown.some((marker) => marker.kind === 'buy')}
        sells={shown.some((marker) => marker.kind === 'sell')}
        average={level !== undefined}
      />
      <ChartTable {...props.table} />
    </figure>
  );
}

export { CoinChart, type CoinChartMarker, type CoinChartPoint, type CoinChartProps };
