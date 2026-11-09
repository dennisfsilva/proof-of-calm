'use client';

import {
  type CoinId,
  compare,
  decimalPlaces,
  holdingContext,
  isPositive,
  isZero,
  matchLots,
  type Percent,
  type Plan,
  type Portfolio,
  portfolio,
  product,
  type Units,
} from '@proofofcalm/core';
import { AllocationBar, type AllocationSegment } from '@proofofcalm/ui/charts/allocation-bar';
import { coinColour, type SeriesColour } from '@proofofcalm/ui/lib/series';
import { type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { Link } from '../../../lib/navigation';
import { useFormatters, usePrices, useRules, useSnapshot } from '../../../lib/services';
import { WhyLink } from '../../learn';
import { NoPlan, PricesLine, useOnline } from '../../today';
import { useHistories } from '../lib/use-histories';
import { chartCoins, chartState } from '../lib/value-chart';
import { formatPnl, Holdings, pnlTone } from './holdings';
import { JanuaryValue } from './january-value';
import { chartDiscloses, VALUE_CHART_VIEW_BOX, ValueChart } from './value-chart';

// The Portfolio screen (docs/DOMAIN.md §3.6, docs/DESIGN.md §7): the value of what is held in the pay
// currency, P/L against cost with the fees beside it (never subtracted) and, wherever the P/L stands, its
// Why? to Risk honestly (docs/EDUCATION.md, the links table), the allocation, the holdings
// and the plan's coins not bought yet, and units sold before the purchases that cover them (imported data, §3.7,
// §3.13: kept as written and named here). No total without a price for every coin held, never a partial
// sum; the allocation then weighs by the amount invested, as the core does. The value carries Today's prices
// line: its time, delayed or offline, and for CoinGecko's prices their source (docs/CONTENT-STYLE.md §3).
// The value chart follows the summary once something was bought; its one state, from the closes read here,
// also decides whether an open holdings row draws its coin's chart (docs/DESIGN.md §8). With nothing held
// there is no allocation: a bar weighed by the amount invested would sit beside a value of 0. Coins added
// with no recorded cost are named after the summary, whose Invested and P/L leave them out (§3.6), and the
// not-bought line links to the Log, where they go in. Last, for the Netherlands' model only, the value on
// 1 January from the same closes (january-value.tsx), where its load moves nothing below it; it carries the
// past-performance line when the value chart, in the same state, shows none (docs/LEGAL.md §4).

const SCREEN = 'mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg';
const TEN = '10' as Percent;
const HUNDRED = '100' as Percent;

type Share = AllocationSegment & { readonly amount: string };

const logLink = (chunks: ReactNode) => (
  <Link href="/log" className="text-ink underline underline-offset-4">
    {chunks}
  </Link>
);

/** The units at the coin's decimals, with no trailing zeros. */
function unitsOf(plan: Plan, coin: CoinId, units: Units, format: Formatters): string {
  const decimals = Math.min(plan.coins.find((each) => each.id === coin)?.decimals ?? 8, decimalPlaces(units));
  return format.units(units, coin, decimals);
}

/** Each coin's series colour in the plan's coin order; a coin without a fixed colour takes the next extended one. */
function positionColours(value: Portfolio): ReadonlyMap<CoinId, SeriesColour> {
  const colours = new Map<CoinId, SeriesColour>();
  let extended = 0;
  for (const position of value.positions) {
    colours.set(position.coin, coinColour(position.coin, extended));
    // Index -1 names no extended slot, so only a coin with a fixed colour gets one back.
    if (coinColour(position.coin, -1) === 'other') extended += 1;
  }
  return colours;
}

/** The fills of the bar in the plan's coin order, in the colours the holdings rows' charts take too. */
function shares(
  value: Portfolio,
  colours: ReadonlyMap<CoinId, SeriesColour>,
  byValue: boolean,
  currency: Plan['payCurrency'],
  format: Formatters,
): Share[] {
  const result: Share[] = [];
  let start = 0;
  for (const position of value.positions) {
    const colour = colours.get(position.coin) ?? 'other';
    if (position.weight === null || !isPositive(position.weight)) continue;
    const percent = product<Percent>(position.weight, HUNDRED);
    const end = Math.min(1, start + Number(position.weight));
    const share = format.percent(percent, { decimals: compare(percent, TEN) > 0 ? 0 : 1 });
    const amount = format.money((byValue ? position.value : null) ?? position.invested, currency);
    result.push({ id: position.coin, label: position.coin, colour, start, end, share, amount });
    start = end;
  }
  return result;
}

export function PortfolioScreen() {
  const t = useTranslations('portfolio');
  const plan = useSnapshot((snapshot) => snapshot.plan);
  if (plan === null) {
    return (
      <div className={SCREEN}>
        <h1 className="text-28">{t('title')}</h1>
        <NoPlan />
      </div>
    );
  }
  return <PlanPortfolio plan={plan} />;
}

function PlanPortfolio({ plan }: { plan: Plan }) {
  const t = useTranslations('portfolio');
  const format = useFormatters();
  const online = useOnline();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const range = useSnapshot((snapshot) => snapshot.prefs.chartRange);
  const { state: prices, failure } = usePrices();
  const rules = useRules();
  // The profile's lot scope and rule decide which sales take units with no recorded cost (DOMAIN §3.6).
  const value = useMemo(
    () => portfolio(plan, entries, prices?.snapshot ?? null, holdingContext(plan, rules)),
    [plan, entries, prices, rules],
  );
  const currency = plan.payCurrency;
  const coins = useMemo(() => chartCoins(plan, entries), [plan, entries]);
  const histories = useHistories(coins, currency);
  const chart = useMemo(
    () => chartState(plan, entries, histories, range, VALUE_CHART_VIEW_BOX),
    [plan, entries, histories, range],
  );
  const colours = useMemo(() => positionColours(value), [value]);

  const held = value.positions.filter((position) => isPositive(position.units));
  const unpriced = held.filter((position) => position.price === null).map((position) => position.coin);
  const notBought = value.positions.filter((position) => isZero(position.boughtUnits)).map((position) => position.coin);
  const unmatched = value.positions.flatMap(({ coin }) => {
    const units = matchLots(entries, coin, 'global').unmatchedUnits;
    return isPositive(units) ? [{ coin, text: t('unmatched', { units: unitsOf(plan, coin, units, format) }) }] : [];
  });
  const unrecorded = value.positions
    .filter((position) => isPositive(position.unrecordedUnits))
    .map((position) => unitsOf(plan, position.coin, position.unrecordedUnits, format));
  const byValue = value.value !== null && isPositive(value.value);
  const allocation = shares(value, colours, byValue, currency, format);
  const pnl = formatPnl(value, format, currency);
  const facts: readonly (readonly [string, string, string])[] = [
    [t('summary.invested'), format.money(value.invested, currency), 'text-ink'],
    [t('summary.fees'), format.money(value.fees, currency), 'text-ink'],
  ];

  return (
    <div className={SCREEN}>
      <h1 className="text-28">{t('title')}</h1>
      <div className="flex flex-col gap-stack-sm">
        <dl>
          <dt className="text-13 text-ink-2">{t('summary.value')}</dt>
          {value.value === null ? (
            <dd className="text-16">{t('summary.unpriced', { coins: unpriced.join(', ') })}</dd>
          ) : (
            <dd className="nums font-semibold text-40">{format.money(value.value, currency)}</dd>
          )}
        </dl>
        {/* One fetch gives every price the screen uses, so the line's time is the oldest of them. */}
        {value.value !== null && prices !== null && (
          <p className="text-13 text-ink-2">
            <PricesLine prices={prices} online={online} failure={failure} />
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-stack-md gap-y-stack-xs text-14">
          {pnl !== null && (
            <div className="contents">
              {/* The Why? target makes the row 44 px tall: the label meets the figure on its baseline. */}
              <dt className="self-baseline text-ink-2">{t('summary.pnl')}</dt>
              <dd className="flex flex-wrap items-center gap-x-stack-xs self-baseline">
                <span className={`nums ${pnlTone(value)}`}>{pnl}</span>
                <WhyLink module="risk-honestly" name={t('summary.why')} standalone />
              </dd>
            </div>
          )}
          {facts.map(([term, figure, tone]) => (
            <div key={term} className="contents">
              <dt className="text-ink-2">{term}</dt>
              <dd className={`nums ${tone}`}>{figure}</dd>
            </div>
          ))}
        </dl>
        {unrecorded.length > 0 && (
          <p className="text-14 text-ink-2">{t('unrecorded', { coins: format.list(unrecorded) })}</p>
        )}
      </div>
      <ValueChart currency={currency} range={range} state={chart} />
      {held.length > 0 && allocation.length > 0 && (
        <AllocationBar
          on="background"
          segments={allocation}
          label={t(byValue ? 'allocation.byValue' : 'allocation.byInvested', {
            shares: allocation.map((segment) => `${segment.label} ${segment.share}`).join(', '),
          })}
          table={{
            summary: t('allocation.table'),
            columns: [
              t('allocation.coin'),
              t('allocation.share'),
              t(byValue ? 'allocation.value' : 'allocation.invested'),
            ],
            rows: allocation.map((segment) => [segment.label, segment.share, segment.amount]),
            numericColumns: [1, 2],
          }}
        />
      )}
      {held.length > 0 && (
        <Holdings plan={plan} portfolio={value} charts={{ entries, state: chart, histories, range, colours }} />
      )}
      {notBought.length > 0 && (
        <p className="text-14 text-ink-2">{t.rich('notBought', { coins: format.list(notBought), log: logLink })}</p>
      )}
      {unmatched.map(({ coin, text }) => (
        <p key={coin} className="text-14 text-ink-2">
          {text}
        </p>
      ))}
      {rules !== null && (
        <JanuaryValue
          plan={plan}
          entries={entries}
          histories={histories}
          rules={rules}
          pastPerformance={!chartDiscloses(chart)}
        />
      )}
    </div>
  );
}
