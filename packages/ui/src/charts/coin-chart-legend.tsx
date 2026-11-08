import { BACKDROP_FILL, type Backdrop } from '#lib/backdrop';
import { SERIES_FILL, SERIES_STROKE, type SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';
import { ChartLegend, ChartLegendItem } from './chart-frame';

// The coin chart's legend: one entry per kind of mark the chart draws, each swatch drawn like its mark,
// so the hollow circle (a buy), the hollow square (a sale) and the dashed level (the average cost) are
// named, not left to colour or guesswork (docs/DESIGN.md §4).

type CoinChartLegendLabels = {
  /** Names the line ("BTC price"). */
  readonly price: string;
  readonly buy: string;
  readonly sell: string;
  readonly average: string;
};

type CoinChartLegendProps = {
  labels: CoinChartLegendLabels;
  colour: SeriesColour;
  on: Backdrop;
  /** Which marks the chart shows. */
  buys: boolean;
  sells: boolean;
  average: boolean;
};

function CoinChartLegend({ labels, colour, on, buys, sells, average }: CoinChartLegendProps) {
  const mark = cn(SERIES_STROKE[colour], BACKDROP_FILL[on]);
  return (
    <ChartLegend data-slot="coin-chart-legend">
      <ChartLegendItem
        swatch={<span aria-hidden className={cn('h-0.5 w-4 shrink-0 rounded-full', SERIES_FILL[colour])} />}
      >
        {labels.price}
      </ChartLegendItem>
      {buys && (
        <ChartLegendItem
          swatch={
            <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0 overflow-visible">
              <circle cx={5} cy={5} r={4} strokeWidth={2} className={mark} />
            </svg>
          }
        >
          {labels.buy}
        </ChartLegendItem>
      )}
      {sells && (
        <ChartLegendItem
          swatch={
            <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0 overflow-visible">
              <rect x={1} y={1} width={8} height={8} strokeWidth={2} className={mark} />
            </svg>
          }
        >
          {labels.sell}
        </ChartLegendItem>
      )}
      {average && (
        <ChartLegendItem swatch={<span aria-hidden className="w-4 shrink-0 border-ink-2 border-t-2 border-dashed" />}>
          {labels.average}
        </ChartLegendItem>
      )}
    </ChartLegend>
  );
}

export { CoinChartLegend, type CoinChartLegendLabels };
