import { assertNever, CHART_RANGES, type ChartRange, type CurrencyCode, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { LineChart } from '@proofofcalm/ui/charts/line-chart';
import { SegmentedControl } from '@proofofcalm/ui/components/segmented-control';
import { cn } from '@proofofcalm/ui/lib/utils';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { useClock, useFormatters, useServices } from '../../../lib/services';
import { widestSources } from '../lib/source-reserve';
import type { ChartState } from '../lib/value-chart';

// The Portfolio value chart (ADR-0022, docs/DESIGN.md §4): the plan's value over the chosen range from the
// daily closes (ADR-0036), one neutral line since the total is no coin's, named by its range, its dates and
// its first and last values (by its own dates alone when the closes start after the range), with the table
// view; under it the closes' dates, time and credit, then the past-performance line of the first historic
// view on the path in the same type, text-14 since the line ends in the credit (docs/LEGAL.md §4, ADR-0047,
// ADR-0050). The range is the device preference
// `chartRange`, written as the Log writes `logShowAll`: a failed write keeps the range and says so. What it
// shows is chartState's one choice (lib/value-chart), made once by the screen, whose holdings rows draw only
// when this chart does or loads. Once anything is bought there is one tree: while the closes load it stands
// busy with an empty frame, unseen, out of reach and unread, and the source line's place held by its widest
// forms (lib/source-reserve), unseen and unread in every state, so it has its loaded height, the ranges never
// remount (focus stays) and nothing below moves when the line draws, whatever the closes' dates and time
// (docs/ENGINEERING.md §4). Every state with nothing to draw (the closes unavailable, a coin with fewer than two,
// a range with nothing, closes that end before the first entry, nothing held) keeps that tree, its frame and
// disclosure unseen and unread, and one line at the frame's top in the polite status slot, mounted empty with
// the section, so it is spoken once per change and nothing moves. A coin outside the catalogue, known before
// any read, gets the bare line with no box. Before the first purchase there is no chart.

/**
 * Whether the chart shows the past-performance line (docs/LEGAL.md §4): while it loads or draws. In every other
 * state the screen's next historic figure, the Dutch value on 1 January, carries it.
 */
export function chartDiscloses(state: ChartState): boolean {
  return state.kind === 'loading' || state.kind === 'draws';
}

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
      .writePrefs((prefs) => ({ ...prefs, chartRange: next }))
      .catch(() => toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS }));
  };

  // At most the column's width: where a language's labels run wider than the page (pt-PT's Tudo at 125 % text on
  // CI's fonts), each option gives up some of its padding, down to its 44 px target, instead of scrolling the page.
  const ranges = (
    <SegmentedControl
      aria-label={t('range')}
      className="max-w-full self-start"
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
  /** The line in the frame's place: none while loading or drawn. */
  let line: string | null = null;
  switch (state.kind) {
    // Nothing bought yet: nothing to chart and no space kept.
    case 'none':
      return null;
    // Known before any read and never drawn: no box to keep.
    case 'outside-catalogue':
      return <p className="text-14 text-ink-2">{t('tooFewCloses', { coins: format.list(state.coins) })}</p>;
    case 'loading':
    case 'draws':
      break;
    case 'unavailable':
      line = t('unavailable');
      break;
    case 'too-few-closes':
      line = t('tooFewCloses', { coins: format.list(state.coins) });
      break;
    case 'range-empty':
      line = t('empty', { range: state.range, start: format.date(state.start), end: format.date(state.end) });
      break;
    case 'starts-later':
      // The All wording names the last close only.
      line = t('empty', { range: 'all', start: format.date(state.end), end: format.date(state.end) });
      break;
    case 'nothing-held':
      line = t('nothingHeld', { start: format.date(state.start), end: format.date(state.end) });
      break;
    default:
      return assertNever(state);
  }

  const loading = state.kind === 'loading';
  const undisclosed = !chartDiscloses(state);
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
      {/* One cell: a line stands at the top of the frame, which keeps its height unseen. The status slot is
          mounted empty with the section, so a line that comes later is spoken once; it sits at the cell's top
          (self-start), since a slot stretched over a drawn chart would take its taps. The column is the section's
          width (minmax(0, 1fr)): an auto column would take the chart's min-content width, wider than a phone.
          The frame and every element in it transition nothing: visibility is inherited, and under reduced motion
          each element's 1 ms duration with the initial `all` list would run a transition when the frame shows or
          hides, one that never ends inside the closed table (docs/DESIGN.md §6). */}
      <div className="grid grid-cols-1">
        <div
          inert={drawn === null}
          aria-hidden={drawn === null || undefined}
          className={cn(
            'col-start-1 row-start-1 transition-none **:transition-none',
            drawn === null && 'invisible',
          )}
        >
          {chart}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="col-start-1 row-start-1 self-start text-14 text-ink-2"
        >
          {line}
        </p>
      </div>
      {/* One cell: the widest lines stand invisible under the drawn one, so its height is theirs in both states. */}
      <div className="grid">
        {widest.map((line) => (
          <p key={line} aria-hidden className="nums invisible col-start-1 row-start-1 text-14 text-ink-2">
            {line}
          </p>
        ))}
        {drawn === null ? null : (
          <p className="nums col-start-1 row-start-1 text-14 text-ink-2">
            {t('source', {
              start,
              end,
              time: format.time(drawn.fetchedAt, clock.timeZone, clock.now()),
              date: format.instantDate(drawn.fetchedAt, clock.timeZone),
            })}
          </p>
        )}
      </div>
      {/* With nothing drawn there is no past performance to disclose: the line keeps its place, unseen and unread,
          and, as the frame, transitions nothing when it shows or hides. */}
      <p
        aria-hidden={undisclosed || undefined}
        className={cn('text-14 text-ink-2 transition-none **:transition-none', undisclosed && 'invisible')}
      >
        {t('pastPerformance')}{' '}
        <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
          {t('riskLink')}
        </a>
      </p>
    </section>
  );
}
