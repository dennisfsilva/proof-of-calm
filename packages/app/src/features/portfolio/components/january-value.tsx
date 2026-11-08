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
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
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
// day's close only in a copy fetched upstream at or after 00:00 UTC on 1 January. `fetchedAt` is the route's
// upstream fetch time, carried in its body and kept with the device's copy, and the oldest of the coins'
// (use-histories); until it reaches that moment no figure shows, and one line says why.

type JanuaryValueProps = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly histories: HistoriesState;
  readonly rules: CountryRules;
};

export function JanuaryValue({ plan, entries, histories, rules }: JanuaryValueProps) {
  const model = rules.computationModel;
  switch (model.kind) {
    case 'per-lot':
    case 'portfolio-wide':
      return null;
    case 'wealth-snapshot':
      return <OpeningValue plan={plan} entries={entries} histories={histories} />;
    default:
      return assertNever(model);
  }
}

/** Whether a copy fetched at `fetchedAt` holds the final close of 31 December before `year`: fetched at or after 1 January 00:00 UTC. */
function closedAfter(fetchedAt: Instant, year: string): boolean {
  return compareInstants(fetchedAt, `${year}-01-01T00:00:00Z` as Instant) >= 0;
}

function OpeningValue({ plan, entries, histories }: Omit<JanuaryValueProps, 'rules'>) {
  const t = useTranslations('portfolio.januaryValue');
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
      {addedAfter.length > 0 && (
        <p className="text-14 text-ink-2">{t('heldAfter', { date, coins: format.list(addedAfter) })}</p>
      )}
    </div>
  );
}
