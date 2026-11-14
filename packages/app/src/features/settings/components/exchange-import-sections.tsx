import {
  type Decimal,
  decimal,
  decimalPlaces,
  type Entry,
  type ExchangeId,
  isEstimate,
  isZero,
  MAX_UNIT_DECIMALS,
  type MonthKey,
  type Plan,
  shownPlaces,
  sum,
} from '@proofofcalm/core';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@proofofcalm/ui/components/collapsible';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import type { previewModel } from '../model/exchange-preview';

// The exchange import's preview, worded (CONTENT-STYLE §3 "Import an exchange's file"): the summary, then one section
// per kind of entry with one sentence each, collapsed until opened, the rows left out with their reasons and the
// counted lines, each only when it applies. Units in one sentence share the places the most precise one needs, at
// most the coin's own (DESIGN §5 rule 7); a coin the plan does not list takes 8.

type Model = ReturnType<typeof previewModel>;
type Props = { readonly model: Model; readonly plan: Plan };
/** The sections also take the file's exchange, which the lines left out name. */
type SectionsProps = Props & { readonly exchange: ExchangeId };
// `hint` is a second line inside the item, for a sentence that asks the person to do something about it.
type Item = { readonly key: string; readonly text: string; readonly hint?: string };
/** Past this many, the lines that could not be read or paired end in "and N more". */
const LINES_SHOWN = 5;

/** A count as a figure, grouped as the numbers' locale groups it (CONTENT-STYLE §4). */
export function useFigure() {
  const format = useFormatters();
  const figures = useMemo(() => createNumberInput(format.locales.numbers), [format.locales.numbers]);
  return (value: number) => figures.format(decimal(String(value)));
}

export function useWords(plan: Plan) {
  const format = useFormatters();
  const figure = useFigure();
  const units = (coin: string, value: Decimal, others: readonly Decimal[] = []) =>
    format.units(value, coin, Math.min(shownPlaces(plan, coin), Math.max(0, ...[value, ...others].map(decimalPlaces))));
  const money = (amount: Decimal) => format.money(amount, plan.payCurrency);
  const counted = (count: number) => ({ count, figure: figure(count) });
  return { format, figure, units, money, counted };
}

/** What the import adds, the estimates it replaces and, when no purchase is in the plan's currency, why. */
export function ExchangeSummary({ model, plan }: Props) {
  const t = useTranslations('settings.data.exchange');
  const w = useWords(plan);
  const { entries, replaced, ...kinds } = model.summary;
  const named = (['monthly', 'extra', 'sales', 'added'] as const).flatMap((kind) =>
    kinds[kind] === 0 ? [] : [t(`kinds.${kind}`, w.counted(kinds[kind]))],
  );
  // The trades an earlier import stored that this file shows as cancelled, in the Log's figures. One sentence, so a
  // coin's units share their places (DESIGN §5 rule 7).
  const peers = (coin: string) => model.cancelled.flatMap(({ entry }) => (entry.coin === coin ? [entry.units] : []));
  const items = w.format.list(
    model.cancelled.map(({ entry }) =>
      t('cancelledItem', {
        units: w.units(entry.coin, entry.units, peers(entry.coin)),
        hasAmount: entry.amount === null ? 'no' : 'yes',
        amount: entry.amount === null ? '' : w.money(entry.amount),
        date: w.format.date(entry.date),
      }),
    ),
  );
  // The coins and months whose estimate a named monthly buy replaced: deleting the buy leaves them without one.
  const tapped = model.cancelled.flatMap(({ estimates }) =>
    estimates.flatMap((entry) => (entry.slot === null ? [] : [`${entry.coin} ${entry.slot}`])),
  );
  const months = [...new Set(tapped)].sort().map((key) => {
    const [coin = '', slot = ''] = key.split(' ');
    return t('cancelledMonth', { coin, month: w.format.month(slot as MonthKey) });
  });
  const cancelled = model.cancelled.length > 0 && [
    t('cancelled', { ...w.counted(model.cancelled.length), items }),
    months.length > 0 &&
      t('cancelledEstimates', {
        count: model.cancelled.length,
        months: w.format.list(months),
        monthCount: months.length,
      }),
  ];
  return (
    <>
      <p>{entries === 0 ? t('nothing') : t('summary', { ...w.counted(entries), kinds: w.format.list(named) })}</p>
      {replaced > 0 && <p>{t('replaces', w.counted(replaced))}</p>}
      {model.noneInCurrency !== null && (
        <p>{t('noneInCurrency', { plan: plan.payCurrency, file: w.format.list(model.noneInCurrency) })}</p>
      )}
      {cancelled && <p>{cancelled.filter(Boolean).join(' ')}</p>}
      {model.short.map(({ entry, units, date }) => (
        <p key={entry.id}>
          {t('short', {
            date: w.format.date(entry.date),
            log: w.units(entry.coin, entry.units, [units]),
            file: w.units(entry.coin, units, [entry.units]),
            moved: date === entry.date ? 'no' : 'yes',
            fileDate: w.format.date(date),
          })}
        </p>
      ))}
    </>
  );
}

function Section({ title, items }: { title: string; items: readonly Item[] }) {
  if (items.length === 0) return null;
  return (
    <Collapsible className="flex flex-col gap-stack-sm">
      <CollapsibleTrigger>{title}</CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-stack-sm">
        <ul aria-label={title} className="flex list-disc flex-col gap-stack-xs pl-5">
          {items.map((item) => (
            <li key={item.key}>
              {item.text}
              {item.hint !== undefined && <span className="block text-ink-2">{item.hint}</span>}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One collapsed section per kind of entry, the rows left out and the counted lines. */
export function ExchangeSections({ model, plan, exchange }: SectionsProps) {
  const t = useTranslations('settings.data.exchange');
  const w = useWords(plan);
  const on = (entry: Pick<Entry, 'date'>) => w.format.date(entry.date);
  const month = (entry: Entry) => (entry.slot === null ? '' : w.format.month(entry.slot as MonthKey));
  const piece = (entry: Entry, others: readonly Decimal[] = [], venue = false, estimated = false) =>
    t('piece', {
      units: w.units(entry.coin, entry.units, others),
      estimated: estimated ? 'yes' : 'no',
      hasVenue: venue && entry.venue !== null ? 'yes' : 'no',
      venue: entry.venue ?? '',
      amount: entry.amount === null ? '' : w.money(entry.amount),
      // A fee of 0 reads as no fee: "fee €0.00" says nothing.
      hasFee: entry.fee === null || isZero(entry.fee) ? 'no' : 'yes',
      fee: entry.fee === null ? '' : w.money(entry.fee),
    });
  const each = (entries: readonly Entry[], text: (entry: Entry) => string) =>
    entries.map((entry) => ({ key: entry.id, text: text(entry) }));
  const title = (key: 'fills' | 'replaces' | 'extra' | 'sales' | 'added' | 'recorded' | 'leftOut', items: unknown[]) =>
    t(`section.${key}`, { count: w.figure(items.length) });
  const leftOut = useLeftOut({ model, plan, exchange }, w);
  const replaces = model.replaces.map(({ estimate, by, otherVenue }) => {
    // Several purchases are summed as the recorded line sums a hand entry's dates: their count, units, amount and fees
    // (the app sums the entries the core adds; the core gives no total).
    const total = sum(by.map((entry) => entry.units));
    const all = [estimate.units, ...by.map((entry) => entry.units), total];
    // A purchase has a fee when its fee is more than nothing; a zero fee is no fee in the sum.
    const fees = by.flatMap((entry) => (entry.fee === null || isZero(entry.fee) ? [] : [entry.fee]));
    const venue = by.find((entry) => entry.venue !== null)?.venue ?? null;
    const dates = [...new Set((by.length === 0 ? [estimate] : by).map((entry) => entry.date))].sort();
    const text = t('replace', {
      ...w.counted(by.length),
      month: month(estimate),
      estimate: piece(estimate, all, otherVenue, true),
      by: by.length === 1 ? piece(by[0] as Entry, all, otherVenue) : '',
      hasVenue: otherVenue && venue !== null ? 'yes' : 'no',
      venue: venue ?? '',
      units: w.units(estimate.coin, total, all),
      amount: w.money(sum(by.flatMap((entry) => (entry.amount === null ? [] : [entry.amount])))),
      fees: fees.length === 0 ? 'none' : fees.length === 1 ? 'one' : 'other',
      fee: w.money(sum(fees)),
      dates: w.format.list(dates.map((date) => w.format.date(date))),
    });
    return { key: estimate.id, text };
  });
  const recorded = model.recorded.map((row) => {
    const text = t('recorded', {
      count: row.dates.length,
      dates: w.format.list(row.dates.map((date) => w.format.date(date))),
      units: w.units(row.coin, row.units, [row.entry.units]),
      amount: row.amount === null ? '' : w.money(row.amount),
      label: t('label', { kind: row.entry.kind, month: month(row.entry), date: on(row.entry) }),
      entry: piece(row.entry, [row.units], true),
    });
    // Only where deleting the entry imports what the item says (importRemedies, docs/DOMAIN.md §3.13).
    const hint = row.remedy ? t('recordedHint', { count: row.dates.length }) : undefined;
    return { key: row.entry.id, text, ...(hint === undefined ? {} : { hint }) };
  });
  const { imported, deleted, unitsCut, feesInCoin } = model.counted;

  return (
    <>
      <Section
        title={title('fills', model.fills)}
        items={each(model.fills, (entry) => t('fill', { month: month(entry), piece: piece(entry), date: on(entry) }))}
      />
      <Section title={title('replaces', replaces)} items={replaces} />
      <Section
        title={title('extra', model.extra)}
        items={each(model.extra, (entry) => t('extra', { piece: piece(entry), date: on(entry) }))}
      />
      <Section
        title={title('sales', model.sales)}
        items={each(model.sales, (entry) => t('sale', { piece: piece(entry), date: on(entry) }))}
      />
      <Section
        title={title('added', model.added)}
        items={each(model.added, (entry) => t('added', { units: w.units(entry.coin, entry.units), date: on(entry) }))}
      />
      <Section title={title('recorded', recorded)} items={recorded} />
      <Section title={title('leftOut', leftOut)} items={leftOut} />
      {imported > 0 && <p>{t('counted.imported', { count: w.figure(imported) })}</p>}
      {deleted > 0 && <p>{t('counted.deleted', { count: w.figure(deleted) })}</p>}
      {unitsCut > 0 && <p>{t('counted.unitsCut', { ...w.counted(unitsCut), places: MAX_UNIT_DECIMALS })}</p>}
      {feesInCoin > 0 && <p>{t('counted.feesInCoin', w.counted(feesInCoin))}</p>}
    </>
  );
}

/**
 * The starting-amount line (DOMAIN §3.13 step 3): each purchase left out, the latest ones past `LINES_SHOWN`, and each
 * live lump the Log holds, else the starting amount's date as not in the Log. It asks for no change. Each sentence's
 * units of a coin share their places (DESIGN §5 rule 7).
 */
function useStartingLine({ startingAmount: starting }: Model, w: ReturnType<typeof useWords>) {
  const t = useTranslations('settings.data.exchange.leftOut');
  if (starting === null) return null;
  const peers = (list: readonly { coin: string; units: Decimal }[], coin: string) =>
    list.flatMap((each) => (each.coin === coin ? [each.units] : []));
  const shown = starting.items.slice(-LINES_SHOWN);
  const more = starting.purchases - shown.length;
  const items = shown.map((item) =>
    t('startingItem', {
      units: w.units(item.coin, item.units, peers(shown, item.coin)),
      amount: w.money(item.amount),
      date: w.format.date(item.date),
    }),
  );
  const { lumps } = starting;
  const held = lumps.map((entry) =>
    t('startingLump', {
      units: w.units(entry.coin, entry.units, peers(lumps, entry.coin)),
      estimated: isEstimate(entry) ? 'yes' : 'no',
      // A lump always has a cost: only a `held` entry may have none (DOMAIN §2.2).
      amount: w.money(entry.amount as Decimal),
      date: w.format.date(entry.date),
    }),
  );
  return t('starting', {
    ...w.counted(starting.purchases),
    date: w.format.date(starting.through),
    items: w.format.list(more > 0 ? [...items, t('more', { count: w.figure(more) })] : items),
    logged: lumps.length > 0 ? 'yes' : 'no',
    lumps: w.format.list(held),
    firstBuy: w.format.date(starting.firstBuy),
  });
}

/** The left-out lines in the copy's order, each only when it applies. */
function useLeftOut({ model, plan, exchange }: SectionsProps, w: ReturnType<typeof useWords>): Item[] {
  const t = useTranslations('settings.data.exchange.leftOut');
  const group = (reason: Model['leftOut'][number]['reason']) => model.leftOut.find((each) => each.reason === reason);
  const coins = (named: readonly { key: string; units: Decimal | null }[]) =>
    w.format.list(named.map((each) => (each.units === null ? each.key : w.units(each.key, each.units))));
  const items: Item[] = [];
  const add = (key: string, text: string | null | false) => {
    if (text) items.push({ key, text });
  };
  const currency = group('currency');
  add('currency', currency ? t('currency', { ...w.counted(currency.count), currencies: coins(currency.by) }) : null);
  for (const coin of group('not-in-plan')?.by ?? [])
    add(`not-in-plan-${coin.key}`, t('not-in-plan', { coin: coin.key, ...w.counted(coin.count) }));
  add('starting', useStartingLine(model, w));
  for (const reason of ['reward', 'coin-deposit'] as const) {
    const found = group(reason);
    add(reason, found ? t(reason, { units: coins(found.by), exchange, ...w.counted(found.count) }) : null);
  }
  const { logged, notLogged } = model.withdrawals;
  const moved = (list: typeof logged) => coins(list.map(({ coin, units }) => ({ key: coin, units })));
  add('logged', logged.length > 0 && t('logged', { units: moved(logged), exchange }));
  add('notLogged', notLogged.length > 0 && t('notLogged', { units: moved(notLogged), exchange }));
  const conversion = group('conversion');
  add(
    'conversion',
    conversion ? t('conversion', { ...w.counted(conversion.count), currency: plan.payCurrency }) : null,
  );
  // Cash, benefit credits, rows within the exchange and rows of other types are worded as rows: a two-leg cash
  // trade is two. Only Trade Republic's reader leaves out benefit credits.
  for (const reason of ['cash', 'benefit', 'within'] as const) {
    const found = group(reason);
    add(reason, found ? t(reason, { ...w.counted(found.lines.length), exchange }) : null);
  }
  const lines = [...(group('unpaired')?.lines ?? []), ...(group('unreadable')?.lines ?? [])].sort((a, b) => a - b);
  const shown = lines.slice(0, LINES_SHOWN).map(w.figure);
  const more = lines.length > LINES_SHOWN ? [t('more', { count: w.figure(lines.length - LINES_SHOWN) })] : [];
  const list = w.format.list([...shown, ...more]);
  add('lines', lines.length > 0 && t('lines', { count: lines.length, lines: list, exchange }));
  const other = group('other');
  add('other', other ? t('other', { ...w.counted(other.lines.length), exchange }) : null);
  return items;
}
