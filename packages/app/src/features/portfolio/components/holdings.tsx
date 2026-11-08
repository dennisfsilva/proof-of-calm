'use client';

import {
  type ChartRange,
  type CoinId,
  type Entry,
  isNegative,
  isPositive,
  isZero,
  type Plan,
  type Portfolio,
  type Position,
  valueRange,
} from '@proofofcalm/core';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableExpandableRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@proofofcalm/ui/components/table';
import type { SeriesColour } from '@proofofcalm/ui/lib/series';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import { COIN_CHART_VIEW_BOX, coinChart } from '../lib/coin-chart';
import type { HistoriesState } from '../lib/use-histories';
import type { ChartState } from '../lib/value-chart';
import { CoinRowChart, type CoinRowChartProps } from './coin-row-chart';

// The holdings table (docs/DESIGN.md §7, §8): one row per coin held, in the plan's order, with its value
// and its P/L beneath it in the pay currency; the row opens to the units, the average cost and the
// amount invested, then the coin's chart over the value chart's range. Two columns, and no figure broken
// inside, keep it within a phone at 125 % text. A coin never bought or sold in full has no row (the screen
// names the ones not bought yet). A closed row's detail is only hidden, so it gets no chart; an open row
// draws one only while the value chart draws, which carries the past-performance line, or its empty frame
// while the closes load, kept unseen when they fail (docs/LEGAL.md §4); a coin with fewer than two closes inside the range shows one line
// saying so, with the range's dates, and a coin with no closes none, since the value chart's line then says why.

/** The fixed decimals of a coin's units: the plan's, or 8 for a coin the plan no longer holds. */
const UNIT_DECIMALS = 8;

/** The colour of a P/L figure, which also carries its sign and a header (docs/DESIGN.md §3). */
export function pnlTone(position: Pick<Position, 'pnl'>): string {
  if (position.pnl === null || isZero(position.pnl)) return 'text-ink';
  return isNegative(position.pnl) ? 'text-negative' : 'text-positive';
}

/** The P/L as its money and, when there is one, its percent in brackets: two parts a line may wrap between. */
function pnlParts(
  position: Pick<Position, 'pnl' | 'pnlPct'>,
  format: Formatters,
  currency: Plan['payCurrency'],
): readonly string[] | null {
  if (position.pnl === null) return null;
  const money = format.money(position.pnl, currency, { signed: true });
  return position.pnlPct === null ? [money] : [money, `(${format.percent(position.pnlPct, { signed: true })})`];
}

export function formatPnl(
  position: Pick<Position, 'pnl' | 'pnlPct'>,
  format: Formatters,
  currency: Plan['payCurrency'],
) {
  return pnlParts(position, format, currency)?.join(' ') ?? null;
}

/** What the rows' charts follow: the value chart's state, the closes and range it drew from, the coins' colours. */
export type RowCharts = {
  readonly entries: readonly Entry[];
  readonly state: ChartState;
  readonly histories: HistoriesState;
  readonly range: ChartRange;
  readonly colours: ReadonlyMap<CoinId, SeriesColour>;
};

type HoldingsProps = { readonly plan: Plan; readonly portfolio: Portfolio; readonly charts: RowCharts };

export function Holdings({ plan, portfolio, charts }: HoldingsProps) {
  const t = useTranslations('portfolio.holdings');
  const format = useFormatters();
  const currency = plan.payCurrency;
  const held = portfolio.positions.filter((position) => isPositive(position.units));
  const [open, setOpen] = useState<ReadonlySet<CoinId>>(() => new Set());
  const { entries, state, histories, range } = charts;
  // Every chart follows the one range; only a drawing value chart has its closes.
  const covered = useMemo(
    () =>
      state.kind === 'draws' && histories.status === 'ready'
        ? valueRange(plan, entries, histories.histories, range)
        : null,
    [plan, entries, state, histories, range],
  );

  const toggle = (coin: CoinId) => (next: boolean) =>
    setOpen((current) => {
      const changed = new Set(current);
      if (next) changed.add(coin);
      else changed.delete(coin);
      return changed;
    });

  /** The chart an open row draws, or null for none. */
  const rowChart = (position: Position): CoinRowChartProps['chart'] | null => {
    if (state.kind === 'loading' || state.kind === 'unavailable') return { kind: state.kind };
    const history = histories.status === 'ready' ? histories.histories.coins[position.coin] : undefined;
    if (covered === null || history === undefined) return null;
    const model = coinChart(entries, position.coin, history, covered, position.average, COIN_CHART_VIEW_BOX);
    if (model === null) return { kind: 'few-closes', start: covered.start, end: covered.end };
    const first = model.points[0]?.date ?? covered.start;
    return { kind: 'draws', model, range, ownDates: first > covered.start };
  };
  return (
    <Table>
      <TableCaption>{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('coin')}</TableHead>
          <TableHead scope="col" numeric>
            <span className="block">{t('value')}</span> <span className="block">{t('pnl')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {held.map((position) => {
          const decimals = plan.coins.find((coin) => coin.id === position.coin)?.decimals ?? UNIT_DECIMALS;
          // Coins added with no recorded cost alone give no average cost, so the row leaves the line out.
          const detail: readonly (readonly [string, string])[] = [
            [t('units'), format.units(position.units, position.coin, decimals)],
            ...(position.average === null ? [] : [[t('average'), format.money(position.average, currency)] as const]),
            [t('invested'), format.money(position.invested, currency)],
          ];
          const [pnlMoney, pnlPercent] = pnlParts(position, format, currency) ?? [];
          const isOpen = open.has(position.coin);
          const chart = isOpen ? rowChart(position) : null;
          return (
            <TableExpandableRow
              key={position.coin}
              colSpan={2}
              summary={position.coin}
              open={isOpen}
              onOpenChange={toggle(position.coin)}
              detail={
                <div className="flex flex-col gap-y-stack-md">
                  <dl className="flex flex-col gap-y-stack-xs text-14">
                    {detail.map(([term, value]) => (
                      <div key={term} className="flex flex-wrap gap-x-stack-md">
                        <dt className="text-ink-2">{term}</dt>
                        <dd className="nums ml-auto whitespace-nowrap">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {chart === null ? null : (
                    <CoinRowChart
                      coin={position.coin}
                      colour={charts.colours.get(position.coin) ?? 'other'}
                      currency={currency}
                      chart={chart}
                    />
                  )}
                </div>
              }
            >
              {/* Not `numeric`: its nowrap would hold the P/L's two parts on one line. */}
              <TableCell className="nums text-right">
                <span className="block whitespace-nowrap">
                  {position.value === null ? t('noPrice') : format.money(position.value, currency)}
                </span>
                {pnlMoney === undefined ? null : (
                  <span className={`block ${pnlTone(position)}`}>
                    <span className="whitespace-nowrap">{pnlMoney}</span>
                    {pnlPercent === undefined ? null : (
                      <>
                        {' '}
                        <span className="whitespace-nowrap">{pnlPercent}</span>
                      </>
                    )}
                  </span>
                )}
              </TableCell>
            </TableExpandableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
