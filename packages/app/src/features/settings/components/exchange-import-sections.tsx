import {
  type Decimal,
  decimal,
  decimalPlaces,
  type Entry,
  IMPORT_MATCH_DAYS,
  MAX_UNIT_DECIMALS,
  type MonthKey,
  type Plan,
} from '@proofofcalm/core';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@proofofcalm/ui/components/collapsible';
import { type ReactNode, useMemo } from 'react';
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
type Item = { readonly key: string; readonly text: string };
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
  const places = (coin: string) => plan.coins.find((each) => each.id === coin)?.decimals ?? 8;
  const units = (coin: string, value: Decimal, others: readonly Decimal[] = []) =>
    format.units(value, coin, Math.min(places(coin), Math.max(0, ...[value, ...others].map(decimalPlaces))));
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
  return (
    <>
      <p>{entries === 0 ? t('nothing') : t('summary', { ...w.counted(entries), kinds: w.format.list(named) })}</p>
      {replaced > 0 && <p>{t('replaces', w.counted(replaced))}</p>}
      {model.noneInCurrency !== null && (
        <p>{t('noneInCurrency', { plan: plan.payCurrency, file: w.format.list(model.noneInCurrency) })}</p>
      )}
    </>
  );
}

function Section({ title, items, children }: { title: string; items: readonly Item[]; children?: ReactNode }) {
  if (items.length === 0) return null;
  return (
    <Collapsible className="flex flex-col gap-stack-sm">
      <CollapsibleTrigger>{title}</CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-stack-sm">
        <ul aria-label={title} className="flex list-disc flex-col gap-stack-xs pl-5">
          {items.map((item) => (
            <li key={item.key}>{item.text}</li>
          ))}
        </ul>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One collapsed section per kind of entry, the rows left out and the counted lines. */
export function ExchangeSections({ model, plan }: Props) {
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
      hasFee: entry.fee === null ? 'no' : 'yes',
      fee: entry.fee === null ? '' : w.money(entry.fee),
    });
  const each = (entries: readonly Entry[], text: (entry: Entry) => string) =>
    entries.map((entry) => ({ key: entry.id, text: text(entry) }));
  const title = (key: 'fills' | 'replaces' | 'extra' | 'sales' | 'added' | 'recorded' | 'leftOut', items: unknown[]) =>
    t(`section.${key}`, { count: w.figure(items.length) });
  const leftOut = useLeftOut(model, plan, w);
  const replaces = model.replaces.map(({ estimate, by, otherVenue }) => {
    const all = [estimate.units, ...by.map((entry) => entry.units)];
    const becomes = w.format.list(by.map((entry) => piece(entry, all, otherVenue)));
    const text = t('replace', {
      month: month(estimate),
      estimate: piece(estimate, all, otherVenue, true),
      by: becomes,
      date: on(by[0] ?? estimate),
    });
    return { key: estimate.id, text };
  });
  const recorded = model.recorded.map((row) => ({
    key: row.entry.id,
    text: t('recorded', {
      date: w.format.date(row.date),
      units: w.units(row.coin, row.units, [row.entry.units]),
      amount: row.amount === null ? '' : w.money(row.amount),
      label: t('label', { kind: row.entry.kind, month: month(row.entry), date: on(row.entry) }),
      entry: piece(row.entry, [row.units], true),
    }),
  }));
  const { imported, deleted, unitsCut, feesInCoin } = model.counted;

  return (
    <>
      <Section
        title={title('fills', model.fills)}
        items={each(model.fills, (entry) => t('fill', { month: month(entry), piece: piece(entry), date: on(entry) }))}
      />
      <Section title={title('replaces', replaces)} items={replaces}>
        <p className="text-ink-2">{t('replacesHint')}</p>
      </Section>
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
      <Section title={title('recorded', recorded)} items={recorded}>
        <p className="text-ink-2">{t('recordedHint')}</p>
      </Section>
      <Section title={title('leftOut', leftOut)} items={leftOut} />
      {imported > 0 && <p>{t('counted.imported', { count: w.figure(imported) })}</p>}
      {deleted > 0 && <p>{t('counted.deleted', { count: w.figure(deleted) })}</p>}
      {unitsCut > 0 && <p>{t('counted.unitsCut', { ...w.counted(unitsCut), places: MAX_UNIT_DECIMALS })}</p>}
      {feesInCoin > 0 && <p>{t('counted.feesInCoin', w.counted(feesInCoin))}</p>}
    </>
  );
}

/** The left-out lines in the copy's order, each only when it applies. */
function useLeftOut(model: Model, plan: Plan, w: ReturnType<typeof useWords>): Item[] {
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
  const starting = model.startingAmount;
  add(
    'starting',
    starting !== null &&
      t('starting', {
        ...w.counted(starting.purchases),
        days: IMPORT_MATCH_DAYS,
        date: w.format.date(starting.firstBuy),
      }),
  );
  for (const reason of ['reward', 'coin-deposit'] as const) {
    const found = group(reason);
    add(reason, found ? t(reason, { units: coins(found.by) }) : null);
  }
  const { logged, notLogged } = model.withdrawals;
  const moved = (list: typeof logged) => coins(list.map(({ coin, units }) => ({ key: coin, units })));
  add('logged', logged.length > 0 && t('logged', { units: moved(logged) }));
  add('notLogged', notLogged.length > 0 && t('notLogged', { units: moved(notLogged) }));
  const conversion = group('conversion');
  add(
    'conversion',
    conversion ? t('conversion', { ...w.counted(conversion.count), currency: plan.payCurrency }) : null,
  );
  // Cash, rows within the exchange and rows of other types are worded as rows: a two-leg cash trade is two.
  for (const reason of ['cash', 'within'] as const) {
    const found = group(reason);
    add(reason, found ? t(reason, w.counted(found.lines.length)) : null);
  }
  const lines = [...(group('unpaired')?.lines ?? []), ...(group('unreadable')?.lines ?? [])].sort((a, b) => a - b);
  const shown = lines.slice(0, LINES_SHOWN).map(w.figure);
  const more = lines.length > LINES_SHOWN ? [t('more', { count: w.figure(lines.length - LINES_SHOWN) })] : [];
  add('lines', lines.length > 0 && t('lines', { count: lines.length, lines: w.format.list([...shown, ...more]) }));
  const other = group('other');
  add('other', other ? t('other', w.counted(other.lines.length)) : null);
  return items;
}
