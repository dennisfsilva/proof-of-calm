import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Decimal } from '@proofofcalm/core';
import { BarChart } from '@proofofcalm/ui/charts/bar-chart';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import type { Formatters } from '../../../lib/format';
import { uiLang } from '../../../lib/i18n/text-lang';
import { useFormatters, useServices } from '../../../lib/services';
import type { PastFall } from '../../../lib/services/red-day-types';
import { MODULE_ELEMENTS } from '../lib/body-elements';
import { fallsSources } from '../lib/falls-basis';

// A module's `<Chart />` (docs/EDUCATION.md §2 and §10): the chart its front matter names, then, inside the
// element, its source as text and the past-performance line (docs/LEGAL.md §3.4 and §4). The rows come through
// the red-day port the fall page reads, so no value of core or content lands in this lazy chunk.

/** Every coin of the cycles file, in its order (a test holds this to packages/content/cycles). */
export const DRAWDOWN_COINS: readonly PastFall['coin'][] = ['BTC', 'ETH', 'LINK', 'SOL'].map(
  (coin) => coin as PastFall['coin'],
);

type Falls = readonly PastFall[] | 'failed';

/** The cycles file's rows, null while they load. */
function useDrawdowns(): Falls | null {
  const { redDay } = useServices();
  const [falls, setFalls] = useState<Falls | null>(null);
  useEffect(() => {
    let live = true;
    redDay.pastFalls(DRAWDOWN_COINS).then(
      (rows) => live && setFalls(rows),
      () => live && setFalls('failed'),
    );
    return () => {
      live = false;
    };
  }, [redDay]);
  return falls;
}

const earliest = <T extends string>(dates: readonly T[]) => dates.reduce((a, b) => (b < a ? b : a));
const latest = <T extends string>(dates: readonly T[]) => dates.reduce((a, b) => (b > a ? b : a));

/** A fall as a page writes it: with its sign, no decimals. */
export const fallPercent = (f: Formatters, fall: PastFall['fall']) => f.percent(`-${fall}` as Decimal, { decimals: 0 });

/**
 * The source sentence's values for the rows given: the rows' basis and each publisher once under it
 * (`fallsSources`), the first high and the last low.
 */
export function fallsSpan(falls: readonly PastFall[], f: Formatters) {
  return {
    ...fallsSources(falls, f),
    first: f.date(earliest(falls.map(({ high }) => high))),
    last: f.date(latest(falls.map(({ low }) => low))),
  };
}

export type DrawdownBarsProps = { falls: readonly PastFall[]; f: Formatters };

/** The chart over the rows given, with no services: the app's chart below and the static site pages draw it. */
export function DrawdownBars({ falls, f }: DrawdownBarsProps) {
  const t = useTranslations('learn.chart');
  // The chart stands inside the module's body; its lines are the page's (ADR-0057).
  const lang = uiLang(useLocale());
  if (falls.length === 0)
    return (
      <p lang={lang} className="text-16">
        {t('failed')}
      </p>
    );
  const span = fallsSpan(falls, f);
  const { first, last } = span;
  const percent = (fall: PastFall['fall']) => fallPercent(f, fall);
  const coins = [...new Set(falls.map(({ coin }) => coin))];
  return (
    <div lang={lang} className="flex flex-col gap-stack-xs">
      <BarChart
        bars={falls.map((row) => ({
          id: `${row.coin}-${row.high}`,
          label: t('bar', { coin: row.coin, year: row.high.slice(0, 4) }),
          fraction: Number(row.fall) / 100,
          value: percent(row.fall),
        }))}
        label={t('label', { coins: f.list(coins), first, last })}
        description={t('description')}
        table={{
          summary: t('summary'),
          columns: [t('columns.coin'), t('columns.high'), t('columns.low'), t('columns.fall')],
          rows: falls.map((row) => [row.coin, f.date(row.high), f.date(row.low), percent(row.fall)]),
          numericColumns: [3],
        }}
      />
      <p className="text-16">
        {t('source', { ...span, product: BRAND.name })} <MODULE_ELEMENTS.PastPerformance />
      </p>
    </div>
  );
}

function DrawdownsBar() {
  const f = useFormatters();
  const falls = useDrawdowns();
  if (falls === null) return null;
  return <DrawdownBars falls={falls === 'failed' ? [] : falls} f={f} />;
}

/** The drawing a module's front matter names; a chart with no renderer yet draws nothing. */
export function ModuleChart({ chart }: { chart: LearnModuleMeta['chart'] }) {
  return chart === 'drawdowns-bar' ? <DrawdownsBar /> : null;
}
