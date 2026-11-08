import { BACKDROP_STROKE, type Backdrop } from '#lib/backdrop';
import { SERIES_STROKE, type SeriesColour } from '#lib/series';
import { ChartDot } from './chart-mark';

// The coin chart's drawing (charts/coin-chart.tsx): gridlines, the dashed level of the average cost, the
// price line, the buys and sales, the last point and the crosshair, in viewBox units and stretched to the
// plot. Every mark keeps its pixel size; hollow marks are cut out of the line in the backdrop's colour.

type CoinChartMarker = {
  readonly id: string;
  readonly kind: 'buy' | 'sell';
  /** In viewBox units. */
  readonly x: number;
  readonly y: number;
};

type CoinChartPlotProps = {
  viewBox: { readonly width: number; readonly height: number };
  colour: SeriesColour;
  path: string;
  end?: { readonly x: number; readonly y: number } | undefined;
  /** Already kept inside the plot. */
  markers: readonly CoinChartMarker[];
  /** The average cost's y, when it falls inside the range. */
  level?: number | undefined;
  gridlines: readonly number[];
  /** The hovered point. */
  crosshair?: { readonly x: number; readonly y: number } | undefined;
  on: Backdrop;
  label: string;
  description?: string | undefined;
};

function CoinChartPlot(props: CoinChartPlotProps) {
  const { viewBox, colour, path, end, markers, level, gridlines, crosshair, on } = props;
  const stroke = SERIES_STROKE[colour];
  const backdrop = BACKDROP_STROKE[on];
  return (
    <svg
      role="img"
      aria-label={props.label}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="none"
      className="block h-(--chart-height) w-full overflow-visible"
    >
      {props.description !== undefined && <desc>{props.description}</desc>}
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
      {level !== undefined && (
        <line
          data-slot="coin-chart-average"
          x1={0}
          x2={viewBox.width}
          y1={level}
          y2={level}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          className="stroke-ink-2"
        />
      )}
      <path
        d={path}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={stroke}
      />
      {markers.map((marker) => (
        <g key={marker.id} data-slot={`coin-chart-${marker.kind}`}>
          <ChartDot x={marker.x} y={marker.y} size={10} square={marker.kind === 'sell'} className={stroke} />
          <ChartDot x={marker.x} y={marker.y} size={6} square={marker.kind === 'sell'} className={backdrop} />
        </g>
      ))}
      {end !== undefined && <ChartDot x={end.x} y={end.y} size={8} className={stroke} />}
      {crosshair !== undefined && (
        <g data-slot="coin-chart-crosshair">
          <line
            x1={crosshair.x}
            x2={crosshair.x}
            y1={0}
            y2={viewBox.height}
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-3"
          />
          <ChartDot x={crosshair.x} y={crosshair.y} size={12} className={backdrop} />
          <ChartDot x={crosshair.x} y={crosshair.y} size={8} className={stroke} />
        </g>
      )}
    </svg>
  );
}

export { type CoinChartMarker, CoinChartPlot, type CoinChartPlotProps };
