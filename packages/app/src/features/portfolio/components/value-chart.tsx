import { assertNever, CHART_RANGES, type ChartRange, type CurrencyCode, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { LineChart } from '@proofofcalm/ui/charts/line-chart';
import { SegmentedControl } from '@proofofcalm/ui/components/segmented-control';
import { cn } from '@proofofcalm/ui/lib/utils';
import { type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { useClock, useFormatters, useServices } from '../../../lib/services';
import { widestSources } from '../lib/source-reserve';
import type { ChartState } from '../lib/value-chart';

// The Portfolio value chart (ADR-0022, docs/DESIGN.md §4): the plan's value over the chosen range from the
// daily closes (ADR-0036), one neutral line since the total is no coin's, named by its range, its dates and
// its first and last values (by its own dates alone when the closes start after the range), with the table
// view; under it the closes' dates, time and credit, then the past-performance line of the first historic
// view on the path in the same type (docs/LEGAL.md §4, ADR-0047). The range is the device preference
// `chartRange`, written as the Log writes `logShowAll`: a failed write keeps the range and says so. What it
// shows is chartState's one choice (lib/value-chart), made once by the screen, whose holdings rows draw only
// when this chart does or loads: while the closes load, the drawn tree stands busy with
// an empty chart, out of reach and unread, and the source line's place held by its widest forms (lib/source-reserve), unseen and
// unread in both states, so it has its loaded height, the ranges never remount and nothing below moves when
// the line draws, whatever the closes' dates and time (docs/ENGINEERING.md §4); when they cannot be had, the
// same tree stays, its frame, source line and disclosure unseen and unread, and one line stands in the frame's
// place, so a failed read moves nothing either; when a coin has fewer than two, one line says so; when there
// is nothing to draw, the ranges stay and one dated line takes the chart's place. Before the first purchase
// there is no chart.

/** The value chart's viewBox: chartState places the model in it and ValueChart draws it. */
export const VALUE_CHART_VIEW_BOX = { width: 300, height: 100 };

type ValueChartProps = { currency: CurrencyCode; range: ChartRange; state: ChartState };

export function ValueChart({ currency, range, state }: ValueChartProps) {
  const t = useTranslations('portfolio.chart');
  const format = useFormatters();
  const clock = useClock();
  const { domain, toasts } = useServices();
  const widest = useMemo(() => widestSources(format, clock, (values) => t('source', values)), [format, clock, t]);

  const choose = (next: ChartRange) => {
    void domain
      .write((snapshot) => ({ prefs: { ...snapshot.prefs, chartRange: next } }))
      .catch(() => toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS }));
  };

  const ranges = (
    <SegmentedControl
      aria-label={t('range')}
      className="self-start"
      options={CHART_RANGES.map((value) => ({
        value,
        label: (
          <>
            {/* The whole name in one hidden span: a split one gains a space before the comma in browsers. */}
            <span aria-hidden>{t(`ranges.${value}`)}</span>
            <span className="sr-only">{t(`rangeNames.${value}`, { label: t(`ranges.${value}`) })}</span>
          </>
        ),
      }))}
      value={range}
      onValueChange={choose}
    />
  );
  /** A state with nothing to draw: the ranges stay, and one line takes the chart's place. */
  const instead = (line: ReactNode) => (
    <section className="flex flex-col gap-stack-sm">
      {ranges}
      <p className="text-14 text-ink-2">{line}</p>
    </section>
  );

  switch (state.kind) {
    // Nothing bought yet: nothing to chart and no space kept.
    case 'none':
      return null;
    case 'loading':
    case 'unavailable':
    case 'draws':
      break;
    case 'too-few-closes':
      return <p className="text-14 text-ink-2">{t('tooFewCloses', { coins: format.list(state.coins) })}</p>;
    case 'range-empty':
      return instead(t('empty', { range: state.range, start: format.date(state.start), end: format.date(state.end) }));
    case 'starts-later':
      // The All wording names the last close only.
      return instead(t('empty', { range: 'all', start: format.date(state.end), end: format.date(state.end) }));
    case 'nothing-held':
      return instead(t('nothingHeld', { start: format.date(state.start), end: format.date(state.end) }));
    default:
      return assertNever(state);
  }

  const loading = state.kind === 'loading';
  const failed = state.kind === 'unavailable';
  const drawn = state.kind === 'draws' ? state : null;
  const table = { summary: t('table.summary'), columns: [t('table.date'), t('table.value')], numericColumns: [1] };
  // While loading or failed: no line and blank extremes (a no-break space keeps each label's line).
  const blank = ' ';
  const [start, end] = drawn === null ? [blank, blank] : [format.date(drawn.start), format.date(drawn.end)];
  const chart =
    drawn === null ? (
      <LineChart
        viewBox={VALUE_CHART_VIEW_BOX}
        series={[]}
        gridlines={[]}
        axis={{ top: blank, bottom: blank, start: blank, end: blank }}
        label={t('table.value')}
        table={{ ...table, rows: [] }}
      />
    ) : (
      <LineChart
        viewBox={VALUE_CHART_VIEW_BOX}
        series={[
          { id: 'value', label: t('table.value'), colour: 'other', path: drawn.chart.path, end: drawn.chart.end },
        ]}
        gridlines={drawn.chart.gridlines}
        axis={{
          top: format.money(drawn.chart.high, currency),
          bottom: format.money(drawn.chart.low, currency),
          start,
          end,
        }}
        label={t(drawn.ownDates ? 'labelOwnDates' : 'label', {
          range,
          start,
          end,
          from: format.money(drawn.chart.first.value, currency),
          to: format.money(drawn.chart.last.value, currency),
        })}
        table={{
          ...table,
          rows: drawn.chart.points.map((point) => [format.date(point.date), format.money(point.value, currency)]),
        }}
      />
    );
  return (
    <section aria-busy={loading || undefined} className="flex flex-col gap-stack-sm">
      {ranges}
      {/* One cell: a failed read's line stands where the frame was, which keeps its height unseen. The column
          is the section's width (minmax(0, 1fr)): an auto column would take the chart's min-content width,
          wider than a phone. */}
      <div className="grid grid-cols-1">
        <div
          inert={drawn === null}
          aria-hidden={drawn === null || undefined}
          className={cn('col-start-1 row-start-1', failed && 'invisible')}
        >
          {chart}
        </div>
        {failed && <p className="col-start-1 row-start-1 text-14 text-ink-2">{t('unavailable')}</p>}
      </div>
      {/* One cell: the widest lines stand invisible under the drawn one, so its height is theirs in both states. */}
      <div className="grid">
        {widest.map((line) => (
          <p key={line} aria-hidden className="nums invisible col-start-1 row-start-1 text-13 text-ink-2">
            {line}
          </p>
        ))}
        {drawn === null ? null : (
          <p className="nums col-start-1 row-start-1 text-13 text-ink-2">
            {t('source', {
              start,
              end,
              time: format.time(drawn.fetchedAt, clock.timeZone, clock.now()),
              date: format.instantDate(drawn.fetchedAt, clock.timeZone),
            })}
          </p>
        )}
      </div>
      {/* With nothing drawn there is no past performance to disclose: the line keeps its place, unseen and unread. */}
      <p aria-hidden={failed || undefined} className={cn('text-13 text-ink-2', failed && 'invisible')}>
        {t('pastPerformance')}{' '}
        <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
          {t('riskLink')}
        </a>
      </p>
    </section>
  );
}
