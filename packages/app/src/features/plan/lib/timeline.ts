import {
  type CalendarDate,
  type CountryRules,
  compare,
  compareDates,
  daysBetween,
  decimal,
  type Entry,
  eligibleFrom,
  holdingContext,
  isPositive,
  isZero,
  liveEntries,
  maxDate,
  minDate,
  monthKey,
  monthStart,
  type Percent,
  type Plan,
  phase,
  planTotals,
  ruleFor,
  sellableNow,
  sellTranches,
  strip,
} from '@proofofcalm/core';
import type {
  TimelineMilestone,
  TimelinePhase,
  TimelineProps,
  TimelineReference,
} from '@proofofcalm/ui/charts/timeline';
import type { useTranslations } from 'use-intl';
import { createNumberInput, type Formatters } from '../../../lib/format';

// The Plan screen's words and geometry (docs/DOMAIN.md §3.5, §3.7, §3.8, §3.10, §5; docs/DESIGN.md §8):
// the timeline from the core's strip, the holding date of the last buy, the sell parts and the
// references, and the lines around it. Plan reads no prices and no history: everything here comes from
// the plan, its entries, today and the country's rules.

export type PlanText = { readonly f: Formatters; readonly t: ReturnType<typeof useTranslations<'plan'>> };

type Dated = Omit<TimelineMilestone, 'when'> & { readonly on: CalendarDate };

/**
 * A date or month as the timeline writes it: never broken across lines, so its spaces
 * become no-break spaces. A range keeps its plain spaces around "to", so it can still break there.
 */
const kept = (text: string) => text.replaceAll(' ', ' ');

/**
 * The holding date of the last buy, its words for the hold segment and its milestone label (the date
 * stands once, in its own column), or null where no rule applies (docs/JURISDICTIONS.md §1) and while
 * the country's rules load (ADR-0020 readings, "The first-boot gate").
 */
function holdingDate(plan: Plan, rules: CountryRules | null, { f, t }: PlanText) {
  if (rules === null) return null;
  const rule = ruleFor(plan.lastBuy, plan.holdingRule, holdingContext(plan, rules).overrides);
  if (rule.kind === 'none') return null;
  const on = eligibleFrom(plan.lastBuy, rule);
  const exempt = rule.effect === 'exempt';
  return {
    on,
    text: t(exempt ? 'holding.exempt' : 'holding.lowerRate', { date: kept(f.date(on)) }),
    label: t(exempt ? 'timeline.milestone.exempt' : 'timeline.milestone.lowerRate'),
  };
}

export function planTimeline(
  plan: Plan,
  _entries: readonly Entry[],
  today: CalendarDate,
  rules: CountryRules | null,
  text: PlanText,
): TimelineProps {
  const { f, t } = text;
  const date = (on: CalendarDate) => kept(f.date(on));
  const month = (key: Parameters<Formatters['month']>[0]) => kept(f.month(key));
  const bar = strip(plan, today);
  const span = Math.max(daysBetween(bar.start, bar.end), 1);
  const at = (date: CalendarDate) => Math.min(Math.max(daysBetween(bar.start, date), 0) / span, 1);
  const range = (from: CalendarDate, to: CalendarDate) => t('timeline.range', { from: date(from), to: date(to) });
  const holding = holdingDate(plan, rules, text);
  const window = plan.sellWindow;
  const parts = sellTranches(plan).map((part) => ({
    ...part,
    on:
      window === null ? monthStart(part.month) : minDate(maxDate(monthStart(part.month), window.opens), window.closes),
  }));

  const detail: Record<TimelinePhase['kind'], string> = {
    buy: range(plan.firstBuy, plan.lastBuy),
    hold: holding?.text ?? (window === null ? t('timeline.noEnd') : range(plan.lastBuy, window.opens)),
    sell: window === null ? '' : range(window.opens, window.closes),
    exit: window === null ? '' : date(window.exitBy),
  };
  const phases = bar.segments.map((segment): TimelinePhase => {
    const marks =
      segment.kind === 'hold' && holding !== null
        ? [{ at: at(holding.on), done: holding.on <= today }]
        : segment.kind === 'sell'
          ? parts.map((part) => ({ at: at(part.on), done: part.done }))
          : undefined;
    return {
      kind: segment.kind,
      label: t(`timeline.phase.${segment.kind}`),
      detail: detail[segment.kind],
      from: Number(segment.from),
      to: Number(segment.to),
      openEnded: segment.openEnded,
      ...(marks === undefined ? {} : { marks }),
    };
  });

  const { halving, peakFrom, peakTo } = plan.references;
  const references: TimelineReference[] = [];
  const dated: Dated[] = [
    { id: 'first', on: plan.firstBuy, date: date(plan.firstBuy), label: t('timeline.milestone.first') },
    { id: 'last', on: plan.lastBuy, date: date(plan.lastBuy), label: t('timeline.milestone.last') },
  ];
  if (holding !== null) dated.push({ id: 'free', on: holding.on, date: date(holding.on), label: holding.label });
  if (halving !== undefined) {
    const around = t('timeline.around', { month: month(monthKey(halving)) });
    references.push({ id: 'halving', label: t('timeline.milestone.halving'), detail: around, from: at(halving) });
    dated.push({ id: 'halving', on: halving, date: around, label: t('timeline.milestone.halving') });
  }
  if (peakFrom !== undefined && peakTo !== undefined && peakTo > peakFrom) {
    const label = t('timeline.milestone.peak', { source: plan.templateId === null ? 'page' : 'template' });
    references.push({ id: 'peak', label, detail: range(peakFrom, peakTo), from: at(peakFrom), to: at(peakTo) });
    dated.push({ id: 'peak', on: peakFrom, date: range(peakFrom, peakTo), label });
  }
  for (const part of parts) {
    const id = `part${part.part}` as const;
    dated.push({ id, on: part.on, date: month(part.month), label: t(`timeline.milestone.${id}`) });
  }
  if (window !== null) {
    dated.push({ id: 'out', on: window.exitBy, date: date(window.exitBy), label: t('timeline.milestone.out') });
  }

  const sorted = dated.sort((a, b) => compareDates(a.on, b.on));
  const past = sorted.filter((milestone) => milestone.on <= today);
  const ahead = sorted.filter((milestone) => milestone.on > today);
  const as =
    (when: TimelineMilestone['when']) =>
    ({ id, date, label }: Dated): TimelineMilestone => ({ id, date, label, when });
  const milestones: TimelineMilestone[] = [
    ...past.map(as('past')),
    { id: 'today', date: date(today), label: t('timeline.milestone.today'), when: 'today' },
    ...ahead.map(as('future')),
  ];

  const now = phase(plan, today).kind;
  const current = bar.today === null || now === 'before' || now === 'done' ? null : now;
  // An open-ended hold has no end date: the strip's end is only where it stops drawing (docs/DOMAIN.md §3.10).
  const open = window === null;
  const ends = { start: date(bar.start), end: open ? t('timeline.noEnd') : date(bar.end) };
  const named = { ...ends, open: open ? 'yes' : 'no' };
  return {
    phases,
    references,
    today: bar.today === null ? null : Number(bar.today),
    elapsed: Number(bar.elapsed),
    todayLabel: t('timeline.today', { date: date(today) }),
    axis: ends,
    milestones,
    label:
      current === null
        ? t('timeline.label', named)
        : t('timeline.labelToday', { ...named, date: date(today), phase: t(`timeline.current.${current}`) }),
    description: phases.map((row) => `${row.label}: ${row.detail}.`).join(' '),
    table: {
      summary: t('timeline.table.summary'),
      columns: [t('timeline.table.date'), t('timeline.table.milestone')],
      rows: milestones.map((milestone) => [milestone.date, milestone.label]),
    },
  };
}

export type PlanSummary = {
  /** The plan in a sentence or two (the prototype's reference). */
  readonly reference: readonly string[];
  /** The person's own reason, when they gave one. */
  readonly why: string | null;
  readonly totals: string;
  /**
   * Names what Portfolio's Invested counts and the totals leave out, while there is one: the extra buys dated before
   * the first buy day, and the `held` entries with a cost (docs/DOMAIN.md §3.10).
   */
  readonly beforeFirstBuy: string | null;
  /** One line per coin in the sell phase, where a holding rule applies. */
  readonly sellable: readonly string[];
  /** Whether a holding date shows, so the screen says once that it is computed from the dates. */
  readonly holdingNote: boolean;
};

/** The plan in its own words, the Plan screen's lead and the review page's (docs/CONTENT-STYLE.md §3). */
export function planReference(plan: Plan, { f, t }: PlanText): readonly string[] {
  const window = plan.sellWindow;
  const money = (amount: Plan['monthlyAmount']) => f.money(amount, plan.payCurrency);
  const split = plan.coins.map(
    (coin) => `${coin.id} ${f.percent(plan.split[coin.id] ?? ('0' as Percent), { decimals: 0 })}`,
  );
  const amounts = { monthly: money(plan.monthlyAmount), buyDay: String(plan.buyDay), split: split.join(', ') };
  return [
    window === null
      ? t('reference.openEnded', { lastBuy: f.date(plan.lastBuy) })
      : t('reference.window', {
          lastBuy: f.date(plan.lastBuy),
          opens: f.date(window.opens),
          closes: f.date(window.closes),
          exitBy: f.date(window.exitBy),
        }),
    isZero(plan.startingAmount)
      ? t('reference.monthly', amounts)
      : t('reference.amounts', { ...amounts, starting: money(plan.startingAmount) }),
  ];
}

export function planSummary(
  plan: Plan,
  entries: readonly Entry[],
  today: CalendarDate,
  rules: CountryRules | null,
  text: PlanText,
): PlanSummary {
  const { f, t } = text;
  const money = (amount: Plan['monthlyAmount']) => f.money(amount, plan.payCurrency);
  const reference = planReference(plan, text);

  const totals = planTotals(plan, entries, today);
  // A share over 10 % has no decimals, one at or below it (docs/DESIGN.md §5, number typography 10).
  const share = (value: Percent) => f.percent(value, compare(value, '10' as Percent) > 0 ? { decimals: 0 } : {});
  const invested = money(totals.investedSoFar);
  // planTotals leaves these out and Portfolio's Invested counts them (docs/DOMAIN.md §3.10): the line says so, in
  // every phase. A `held` entry with no cost is in neither, so the line leaves it out.
  const live = liveEntries(entries);
  const early = live.filter((entry) => entry.kind === 'extra' && entry.date < plan.firstBuy).length;
  const heldCosted = live.filter((entry) => entry.kind === 'held' && entry.amount !== null).length;
  // The count is a figure in the country's number format, like End buying's (docs/CONTENT-STYLE.md §4).
  const figure = (count: number) => createNumberInput(f.locales.numbers).format(decimal(String(count)));
  const earlyArgs = { count: early, figure: figure(early), date: f.date(plan.firstBuy) };
  // With both kinds, one message names each and says "Portfolio's Invested counts" once (docs/CONTENT-STYLE.md §3).
  const outside =
    heldCosted === 0
      ? early === 0
        ? null
        : t('totals.beforeFirstBuy', earlyArgs)
      : early === 0
        ? t('totals.heldWithCost', { count: heldCosted, figure: figure(heldCosted) })
        : t('totals.beforeFirstBuyAndHeld', { ...earlyArgs, held: heldCosted, heldFigure: figure(heldCosted) });
  const holding = holdingDate(plan, rules, text);
  const context = holdingContext(plan, rules);
  const now = phase(plan, today).kind;
  const selling = now === 'sell' && holding !== null;
  const sellable = selling
    ? plan.coins.flatMap((coin) => {
        const units = (value: Entry['units']) => f.units(value, coin.id, coin.decimals);
        const { now, later } = sellableNow(plan, entries, coin.id, today, context);
        if (!isPositive(now) && later.length === 0) return [];
        const parts = later.map((lot) => t('sellable.later', { units: units(lot.units), date: f.date(lot.from) }));
        return [[t('sellable.now', { units: units(now) }), ...parts].join(' · ')];
      })
    : [];

  return {
    reference,
    why: plan.why.trim() === '' ? null : t('reference.why', { why: plan.why.trim() }),
    // From the sell window on, no buy is left to count: the line drops "Buys left". After End buying, in any
    // phase, the planned total is no longer the plan's: the line says when buying ended, with no share.
    totals:
      plan.endedBuyingOn !== null
        ? t('totals.ended', { invested, date: f.date(plan.endedBuyingOn) })
        : totals.percentIn === null
          ? t('totals.nothingPlanned', { invested })
          : now === 'sell' || now === 'exit' || now === 'done'
            ? t('totals.sellPhase', { invested, planned: money(totals.plannedTotal), percent: share(totals.percentIn) })
            : t('totals.planned', {
                invested,
                planned: money(totals.plannedTotal),
                percent: share(totals.percentIn),
                left: String(totals.buysLeft),
              }),
    beforeFirstBuy: outside,
    sellable,
    holdingNote: holding !== null,
  };
}
