import {
  assertNever,
  type CalendarDate,
  type CoinId,
  type CountryRules,
  compareInstants,
  type Entry,
  type Instant,
  liveEntries,
  type Plan,
  type PriceHistories,
  snapshotValue,
} from '@proofofcalm/core';
import { type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useFormatters, useToday } from '../../../lib/services';
import { type HistoriesState, servesHistory } from '../lib/use-histories';

// The Dutch line on Portfolio (docs/JURISDICTIONS.md §7.8, docs/CONTENT-STYLE.md §3): the value at the start
// of 1 January of the current calendar year, which is the end of 31 December before it (docs/DOMAIN.md
// §3.13), from the closes the screen already loaded and in their currency, never stored (ADR-0036). It
// shows only for the `wealth-snapshot` model. The figure is labelled as an estimate with the closes' date,
// the coins it covers and the credit, unlinked at text-14 (ADR-0050); a coin without a close dated that day,
// or outside the loaded histories, leaves no partial sum, and its name is said instead. Coins added in the
// Log with a later date are named, since they may have been held that day (§2.2). A failed read says nothing
// here: the value chart's line names it and the retry. Nothing held and nothing added later: no line.
// CoinGecko's last point is the price at the call, dated that UTC day (apps/web/lib/history/coingecko.ts),
// and a copy lives 24 hours on the server and the device (ADR-0036): the point dated 31 December is that
// day's close only in a copy fetched upstream at or after 00:10:30 UTC on 1 January. `fetchedAt` is the route's
// upstream fetch time, carried in its body and kept with the device's copy, and the oldest of the coins'
// (use-histories); until it reaches that moment no figure shows, and one line says why. The past-performance
// line comes once per path, directly under the historic figure (docs/LEGAL.md §4): the value chart carries it
// while it loads or draws (chartDiscloses); otherwise this line does, under its figure and the closes' date.

type JanuaryValueProps = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly histories: HistoriesState;
  readonly rules: CountryRules;
  /** Whether this line carries the past-performance line under its figure: the value chart shows none. */
  readonly pastPerformance: boolean;
};

export function JanuaryValue({ plan, entries, histories, rules, pastPerformance }: JanuaryValueProps) {
  const model = rules.computationModel;
  switch (model.kind) {
    case 'per-lot':
    case 'portfolio-wide':
      return null;
    case 'wealth-snapshot':
      return <OpeningValue plan={plan} entries={entries} histories={histories} pastPerformance={pastPerformance} />;
    default:
      return assertNever(model);
  }
}

// The UTC time of day from which a copy holds the close of the day before: CoinGecko's market_chart reference
// (read 2026-11-08) says "The last completed UTC day (00:00) data is available 10 minutes after midnight
// (00:10 UTC)", and caches its answer 30 seconds, so 00:10 plus 30 s (ADR-0036's Readings).
const CLOSE_FINAL_AT = '00:10:30';

/** Whether a copy fetched at `fetchedAt` holds the final close of 31 December before `year`: fetched at or after 1 January {@link CLOSE_FINAL_AT} UTC. */
function closedAfter(fetchedAt: Instant, year: string): boolean {
  return compareInstants(fetchedAt, `${year}-01-01T${CLOSE_FINAL_AT}Z` as Instant) >= 0;
}

// The step's Log link, as the screen's `notBought` line links it.
const logLink = (chunks: ReactNode) => (
  <Link href="/log" className="text-ink underline underline-offset-4">
    {chunks}
  </Link>
);

function OpeningValue({ plan, entries, histories, pastPerformance }: Omit<JanuaryValueProps, 'rules'>) {
  const t = useTranslations('portfolio.januaryValue');
  const chart = useTranslations('portfolio.chart');
  const format = useFormatters();
  const year = useToday().slice(0, 4);
  const eve = `${Number(year) - 1}-12-31` as CalendarDate;
  const value = useMemo(() => {
    const none: PriceHistories = { currency: plan.payCurrency, coins: {} };
    return snapshotValue(plan, entries, histories.status === 'ready' ? histories.histories : none, eve);
  }, [plan, entries, histories, eve]);
  const addedAfter = [
    ...new Set<CoinId>(
      liveEntries(entries)
        .filter((entry) => entry.kind === 'held' && entry.date > eve)
        .map((entry) => entry.coin),
    ),
  ];

  if (histories.status === 'failed') return null;
  if (value.coins.length === 0 && addedAfter.length === 0) return null;
  const date = format.date(eve);
  const loading = histories.status === 'loading' && value.coins.some((coin) => servesHistory(coin.coin));
  const pending = histories.status === 'ready' && !closedAfter(histories.fetchedAt, year);
  const figure = (() => {
    if (value.coins.length === 0) return <dd className="text-14 text-ink-2">{t('none', { date })}</dd>;
    if (loading) return <dd className="text-14 text-ink-2">{t('loading', { date })}</dd>;
    if (pending) return <dd className="text-14 text-ink-2">{t('pending', { date })}</dd>;
    if (value.total === null) {
      return <dd className="text-14 text-ink-2">{t('missing', { date, coins: format.list(value.missing) })}</dd>;
    }
    return <dd className="nums font-semibold text-16">{format.money(value.total, value.currency)}</dd>;
  })();
  const priced = !loading && !pending && value.coins.length > 0 && value.total !== null;

  return (
    <div className="flex flex-col gap-stack-xs">
      <dl>
        <dt className="text-13 text-ink-2">{t('value', { year })}</dt>
        {figure}
      </dl>
      {priced && (
        <p className="text-14 text-ink-2">
          {t('estimate', { date, coins: format.list(value.coins.map((coin) => coin.coin)) })}
        </p>
      )}
      {priced && pastPerformance && (
        <p className="text-13 text-ink-2">
          {chart('pastPerformance')}{' '}
          <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
            {chart('riskLink')}
          </a>
        </p>
      )}
      {addedAfter.length > 0 && (
        <p className="text-14 text-ink-2">
          {t.rich('heldAfter', { date, coins: format.list(addedAfter), log: logLink })}
        </p>
      )}
    </div>
  );
}
