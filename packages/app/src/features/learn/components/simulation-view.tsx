import {
  type CalendarDate,
  type CurrencyCode,
  decimal,
  type Percent,
  type SensitivityRow,
  type Simulation,
} from '@proofofcalm/core';
import { ChartTable } from '@proofofcalm/ui/charts/chart-table';
import { SimulatorChart } from '@proofofcalm/ui/charts/simulator-chart';
import { type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import { simulatorGeometry } from '../lib/simulator-chart';

// The simulator's result (docs/EDUCATION.md §7 and §8): the path first, with its table view by month; directly
// under it the past-performance line of the first view of historic data (docs/LEGAL.md §4) with the Risk link, as a
// Learn module sets it, and the closes' credit at text-14 (docs/CONTENT-STYLE.md §3); then the falls, the months in
// loss and the gaps; then the multiple, never an annualised return; the caveat; and the same plan started in each
// of 12 months behind one disclosure, the rows the closes cannot cover said once above it.

/** The chart's viewBox: simulatorGeometry places the paths in it. */
const SIMULATION_VIEW_BOX = { width: 300, height: 100 };

export type SimulationViewProps = {
  readonly simulation: Simulation;
  readonly sensitivity: readonly SensitivityRow[];
  /** The histories' currency, which the amounts are in. */
  readonly currency: CurrencyCode;
  /** The day the chosen coins' closes begin, which the line over the refused rows names. */
  readonly closesFrom: CalendarDate;
};

function Figure({
  term,
  value,
  children,
}: {
  readonly term: string;
  readonly value: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-stack-2xs">
      <dt className="text-14 text-ink-2">{term}</dt>
      <dd className="nums text-20">{value}</dd>
      {children !== undefined && <dd className="text-14 text-ink-2">{children}</dd>}
    </div>
  );
}

export function SimulationView({ simulation, sensitivity, currency, closesFrom }: SimulationViewProps) {
  const t = useTranslations('learn');
  const f = useFormatters();
  const geometry = useMemo(() => simulatorGeometry(simulation.series, SIMULATION_VIEW_BOX), [simulation.series]);
  const { summary } = simulation;
  const first = simulation.series[0];
  const last = simulation.series.at(-1);
  if (geometry === null || first === undefined || last === undefined) return null;

  const figure = (value: number) => createNumberInput(f.locales.numbers).format(decimal(String(value)));
  const money = (value: string) => f.money(decimal(value), currency);
  const [start, end] = [f.date(first.date), f.date(last.date)];
  const fall = summary.maxDrawdown;
  const under = summary.longestUnderwater;
  const zero = '0' as Percent;
  const refused = sensitivity.filter((row) => !row.result.ok).length;
  // The core keeps a gap per coin and due date (docs/EDUCATION.md §8); the figure counts the buy days.
  const gapDays = new Set(simulation.gaps.map((gap) => gap.due)).size;

  return (
    <div className="flex flex-col gap-stack-md">
      <div className="flex flex-col gap-stack-xs">
        <SimulatorChart
          viewBox={SIMULATION_VIEW_BOX}
          value={geometry.value}
          invested={geometry.invested}
          underwater={geometry.underwater}
          gridlines={geometry.gridlines}
          axis={{
            top: money(geometry.axis.high),
            bottom: money(geometry.axis.low),
            start: f.date(geometry.axis.start),
            end: f.date(geometry.axis.end),
          }}
          legend={{
            value: t('simulator.result.legend.value'),
            invested: t('simulator.result.legend.invested'),
            underwater: t('simulator.result.legend.underwater'),
          }}
          label={t('simulator.result.label', { start, end, from: money(first.value), to: money(last.value) })}
          description={t('simulator.result.description', {
            fell: fall === null ? 'no' : 'yes',
            depth: f.percent(fall?.depth ?? zero),
            peak: fall === null ? '' : f.date(fall.peak),
            trough: fall === null ? '' : f.date(fall.trough),
          })}
          table={{
            summary: t('simulator.result.table.summary'),
            columns: [
              t('simulator.result.table.month'),
              t('simulator.result.table.value'),
              t('simulator.result.table.invested'),
            ],
            rows: geometry.months.map((row) => [f.month(row.month), money(row.value), money(row.invested)]),
            numericColumns: [1, 2],
          }}
        />
        <p className="text-14 text-ink-2">
          {t('simulator.result.closes', { start, end })} {t('module.pastPerformance')}{' '}
          <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
            {t('module.riskLink')}
          </a>
        </p>
        <p className="text-14 text-ink-2">{t('simulator.credit')}</p>
      </div>
      <dl className="grid grid-cols-1 gap-stack-sm sm:grid-cols-2">
        <Figure term={t('simulator.result.drawdown')} value={f.percent(fall?.depth ?? zero)}>
          {fall === null
            ? t('simulator.result.noFall')
            : t('simulator.result.drawdownDates', {
                recovered: fall.recovery === null ? 'no' : 'yes',
                peak: f.date(fall.peak),
                trough: f.date(fall.trough),
                recovery: fall.recovery === null ? '' : f.date(fall.recovery),
                end,
              })}
        </Figure>
        <Figure
          term={t('simulator.result.underwater')}
          value={t('simulator.result.days', { count: under?.days ?? 0, figure: figure(under?.days ?? 0) })}
        >
          {under === null
            ? undefined
            : t('simulator.result.underwaterDates', {
                recovered: under.recovered ? 'yes' : 'no',
                from: f.date(under.from),
                to: f.date(under.to),
              })}
        </Figure>
        <Figure
          term={t('simulator.result.monthsInLoss')}
          value={t('simulator.result.monthsOf', {
            figure: figure(summary.monthsInLoss),
            months: figure(summary.months),
          })}
        />
        <Figure term={t('simulator.result.gaps')} value={figure(gapDays)} />
      </dl>
      {summary.multiple !== null && (
        <dl>
          <Figure term={t('simulator.result.multiple')} value={f.multiple(summary.multiple)}>
            {t('simulator.result.multipleLine', {
              value: money(summary.value),
              end,
              invested: money(summary.invested),
            })}
          </Figure>
        </dl>
      )}
      <p className="text-16">{t('simulator.result.caveat')}</p>
      <ChartTable
        summary={t('simulator.result.starts.summary')}
        {...(refused === 0
          ? {}
          : {
              caption: t('simulator.result.starts.refused', {
                date: f.date(closesFrom),
                count: refused,
                figure: figure(refused),
              }),
            })}
        columns={[
          t('simulator.result.starts.start'),
          t('simulator.result.starts.end'),
          t('simulator.result.multiple'),
          t('simulator.result.drawdown'),
        ]}
        rows={sensitivity.map((row) => {
          const dates = [f.date(row.startDate), f.date(row.endDate)];
          if (!row.result.ok) return [...dates, t('simulator.result.starts.none'), ''];
          const { multiple, maxDrawdown } = row.result.value;
          return [...dates, multiple === null ? '' : f.multiple(multiple), f.percent(maxDrawdown?.depth ?? zero)];
        })}
        numericColumns={[2, 3]}
      />
    </div>
  );
}
