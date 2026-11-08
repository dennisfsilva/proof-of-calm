import type { CalendarDate, ChartRange, CoinId, CurrencyCode, Money } from '@proofofcalm/core';
import { CoinChart } from '@proofofcalm/ui/charts/coin-chart';
import type { SeriesColour } from '@proofofcalm/ui/lib/series';
import { cn } from '@proofofcalm/ui/lib/utils';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { COIN_CHART_VIEW_BOX, type CoinChartModel, type CoinChartPoint } from '../lib/coin-chart';

// A holdings row's price chart (ADR-0022, docs/DESIGN.md §4 and §8): the coin's daily closes over the value
// chart's range, its buys and sales marked, the average cost as a level, named by the coin, the range, its
// dates and its first and last close with no change figure (by its own dates alone when the closes start
// after the range), with the table view; under it the credit in fixed words (ADR-0036). No past-performance
// line: a row chart draws only while the value chart above it draws, and that chart carries the line
// (docs/LEGAL.md §4, docs/CONTENT-STYLE.md §3). While the closes load, the same frame stands empty, out of
// reach and unread, so an open row keeps its height when the chart draws; when the closes cannot be had, that
// frame stays unseen as well, so the row keeps it then too, and the value chart's line says why. A coin with
// fewer than two closes inside the range gets one line in the chart's place, with the coin and the range's dates.

export type CoinRowChartProps = {
  coin: CoinId;
  colour: SeriesColour;
  currency: CurrencyCode;
  chart:
    | { readonly kind: 'loading' }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'few-closes'; readonly start: CalendarDate; readonly end: CalendarDate }
    | {
        readonly kind: 'draws';
        readonly model: CoinChartModel;
        readonly range: ChartRange;
        readonly ownDates: boolean;
      };
};

/** While loading: blank extremes, a no-break space keeping each label's line. */
const BLANK = ' ';

export function CoinRowChart({ coin, colour, currency, chart }: CoinRowChartProps) {
  const t = useTranslations('portfolio.holdings.chart');
  const format = useFormatters();
  if (chart.kind === 'few-closes') {
    const [start, end] = [format.date(chart.start), format.date(chart.end)];
    return <p className="text-14 text-ink-2">{t('fewCloses', { coin, start, end })}</p>;
  }
  const loading = chart.kind === 'loading';
  const failed = chart.kind === 'unavailable';
  const legend = {
    price: t('legend.price', { coin }),
    buy: t('legend.buy'),
    sell: t('legend.sell'),
    average: t('legend.average'),
  };
  const table = {
    summary: t('table.summary'),
    columns: [t('table.date'), t('table.close'), t('table.bought'), t('table.sold')],
    numericColumns: [1, 2, 3],
  };
  const money = (amount: Money | null) => (amount === null ? '' : format.money(amount, currency));

  let drawing: ReactNode;
  if (chart.kind !== 'draws') {
    drawing = (
      <CoinChart
        viewBox={COIN_CHART_VIEW_BOX}
        colour={colour}
        path=""
        axis={{ top: BLANK, bottom: BLANK, start: BLANK, end: BLANK }}
        legend={legend}
        label={legend.price}
        table={{ ...table, rows: [] }}
      />
    );
  } else {
    const { model, range, ownDates } = chart;
    // A model has at least two points.
    const [first, last] = [model.points[0], model.points.at(-1)] as [CoinChartPoint, CoinChartPoint];
    const [start, end] = [format.date(first.date), format.date(last.date)];
    const from = format.money(first.close, currency);
    const to = format.money(last.close, currency);
    drawing = (
      <CoinChart
        viewBox={COIN_CHART_VIEW_BOX}
        colour={colour}
        path={model.path}
        end={model.end}
        markers={model.markers}
        {...(model.average === null
          ? {}
          : {
              average: {
                y: model.average.y,
                label: t('average', { price: format.money(model.average.price, currency) }),
              },
            })}
        gridlines={model.gridlines}
        axis={{ top: format.money(model.high, currency), bottom: format.money(model.low, currency), start, end }}
        legend={legend}
        points={model.points.map((point) => ({
          x: point.x,
          y: point.y,
          label: t('tooltip', {
            date: format.date(point.date),
            close: format.money(point.close, currency),
            trades:
              point.bought === null ? (point.sold === null ? 'none' : 'sold') : point.sold === null ? 'bought' : 'both',
            bought: money(point.bought),
            sold: money(point.sold),
          }),
        }))}
        label={t(ownDates ? 'labelOwnDates' : 'label', { coin, range, start, end, from, to })}
        table={{
          ...table,
          rows: model.points.map((point) => [
            format.date(point.date),
            format.money(point.close, currency),
            money(point.bought),
            money(point.sold),
          ]),
        }}
      />
    );
  }

  return (
    <div
      data-slot="coin-row-chart"
      aria-busy={loading || undefined}
      aria-hidden={failed || undefined}
      className={cn('flex flex-col gap-stack-xs', failed && 'invisible')}
    >
      <div inert={loading || failed} aria-hidden={loading || failed || undefined}>
        {drawing}
      </div>
      <p className={cn('text-13 text-ink-2', loading && 'invisible')}>{t('credit')}</p>
    </div>
  );
}
