import { isPositive, type Percent, type Plan } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { CountryDateLine, type HoldingCountry, holdingRuleText } from '../../plan';
import type { SetupDraft } from '../model/draft';
import { StartRow } from './start-row';

// The last step of both paths: the plan as `checkPlan` reads it, one row per choice, then the one
// acknowledged disclosure of docs/LEGAL.md §4 and Start in the start row (ADR-0047 Corrections, 2026-10-22).
// It repeats the person's choices only: the holding rule in words, named by its country, with the country's
// date line under it (docs/LEGAL.md §4 "Lines that are data"), and an early sell window the person accepted,
// but never a holding-status date or anything else computed from the rule. A row changes by going Back.
export type SummaryStepProps = {
  readonly plan: Plan;
  /** The chosen country's card: its name, its rule's review date and source, or the generic profile's text. */
  readonly holding: HoldingCountry;
  /** The template's name; null on the custom path. */
  readonly templateName: string | null;
  readonly reminder: SetupDraft['reminder'];
  /** The chosen country's formatting, as the numbers step uses it. */
  readonly format: Formatters;
  /** The plan is being written: Start waits for it. */
  readonly pending?: boolean | undefined;
  onBack(): void;
  onStart(): void;
};

export function SummaryStep({
  plan,
  holding,
  templateName,
  reminder,
  format,
  pending,
  onBack,
  onStart,
}: SummaryStepProps) {
  const t = useTranslations('onboarding');
  const rule = useTranslations('plan.holdingRule');
  const money = (amount: Plan['monthlyAmount']) => format.money(amount, plan.payCurrency);
  const split = plan.coins
    // A coin never breaks from its share (docs/CONTENT-STYLE.md §4).
    .map((coin) => `${coin.id}\u00a0${format.percent(plan.split[coin.id] ?? ('0' as Percent), { decimals: 0 })}`)
    .join(', ');
  const window = plan.sellWindow;
  const generic = holding.unreviewed !== undefined;
  // The rule in words only beside its source (docs/LEGAL.md §6 question 13); the generic profile's own text.
  const { key, values } = holdingRuleText(plan.holdingRule, format);
  const words = generic ? (holding.unreviewed?.text ?? '') : holding.source === null ? '' : rule(`text.${key}`, values);
  const ruleValue = t('summary.holdingRuleValue', { kind: generic ? 'generic' : 'named', name: holding.name, words });
  // Tabular figures only on the values that are numbers or dates (docs/DESIGN.md §5); the country, the rule,
  // the starting point, the sentence and the reminder are words and keep proportional figures. A row's
  // optional node shows under its value.
  type Row = readonly [term: string, value: string, figures: boolean, under?: ReactNode];
  const rows: (Row | null)[] = [
    [t('summary.country'), holding.name, false],
    [t('summary.holdingRule'), ruleValue.trim(), false, <CountryDateLine country={holding} />],
    [t('summary.startingPoint'), templateName ?? t('template.custom.title'), false],
    [t('summary.coins'), split, true],
    [t('summary.monthly'), money(plan.monthlyAmount), true],
    isPositive(plan.startingAmount) ? [t('summary.starting'), money(plan.startingAmount), true] : null,
    [t('summary.firstBuy'), format.date(plan.firstBuy), true],
    [t('summary.buyDay'), t('summary.buyDayValue', { day: plan.buyDay }), true],
    [t('summary.lastBuy'), format.date(plan.lastBuy), true],
    window === null
      ? null
      : [
          t('summary.sellWindow'),
          t(window.acceptedEarlyOpen === true ? 'summary.sellWindowEarly' : 'summary.sellWindowValue', {
            opens: format.date(window.opens),
            closes: format.date(window.closes),
          }),
          true,
        ],
    plan.why === '' ? null : [t('summary.why'), plan.why, false],
    [t('summary.reminder'), t('summary.reminderValue', { choice: reminder ?? 'later' }), false],
  ];
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('summary.heading')}
      </h2>
      <dl className="flex flex-col gap-stack-sm">
        {rows
          .flatMap((row) => (row === null ? [] : [row]))
          .map(([term, value, figures, under]) => (
            <div key={term} className="flex flex-col">
              <dt className="text-14 text-ink-2">{term}</dt>
              <dd className={figures ? 'nums text-16 text-ink' : 'flex flex-col gap-stack-xs text-16 text-ink'}>
                {value}
                {under}
              </dd>
            </div>
          ))}
      </dl>
      <StartRow onBack={onBack} onStart={onStart} pending={pending} />
    </section>
  );
}
