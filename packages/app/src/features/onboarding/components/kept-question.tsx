import {
  CURRENCIES,
  type CurrencyCode,
  decimal,
  type KeptCurrencyQuestion,
  type Plan,
  planIssues,
} from '@proofofcalm/core';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import { useEffect, useId, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { createNumberInput, type Formatters } from '../../../lib/format';

// The summary's question when entries kept with no plan hold amounts the plan would show in another currency
// (ADR-0053 Readings, 2026-11-26): one card per currency they could have been paid in, nothing chosen, the kept
// currency first when it reads, else the plan's and then the rest. The cards are packages/ui's radio group, built as
// Settings' currency question is (currency-question.tsx); the answer only relabels, nothing is converted.

/** The cards in their order: the kept currency, then the plan's; with the kept one unread, the plan's, then the rest. */
const cardsOf =({ kept, next }: KeptCurrencyQuestion): CurrencyCode[] =>
  kept === null ? [next, ...CURRENCIES.filter((code) => code !== next)] : [kept, next];

/** The plan Start writes for entries paid in `paid`: in that currency, or null when the plan would not pass. */
export function paidIn(plan: Plan, paid: CurrencyCode): Plan | null {
  if (paid === plan.payCurrency) return plan;
  const next: Plan = { ...plan, payCurrency: paid, displayCurrency: paid };
  return planIssues(next).length === 0 ? next : null;
}

const figureOf = (format: Formatters, count: number) =>
  createNumberInput(format.locales.numbers).format(decimal(String(count)));

type Props = {
  readonly question: KeptCurrencyQuestion;
  readonly format: Formatters;
  /** Takes each choice, and null when the group mounts; a stable function (the summary's state setter). */
  readonly onAnswer: (paid: CurrencyCode | null) => void;
  /** Marks the group and shows the refusal under it after a Start without an answer. */
  readonly invalid: boolean;
};

/** Uncontrolled, as Settings' question is: each mount clears the answer, and the summary keys it by the question. */
export function KeptQuestion({ question, format, onAnswer, invalid }: Props) {
  useEffect(() => onAnswer(null), [onAnswer]);
  const t = useTranslations('onboarding.summary.kept');
  const ids = { legend: useId(), kept: useId(), issue: useId(), line: useId() };
  const { kept, next, count, first, last } = question;
  const figure = useMemo(() => figureOf(format, count), [format, count]);
  const span = first === last ? 'day' : 'range';
  return (
    <div className="flex flex-col gap-stack-xs">
      <p id={ids.legend} className="text-16 text-ink">
        {t('legend', { count, figure, span, first: format.date(first), last: format.date(last) })}
      </p>
      <p id={ids.kept} className="text-14 text-ink-2">
        {kept === null ? t('unknown', { count }) : t('known', { count, kept })}
      </p>
      <RadioGroup<CurrencyCode>
        aria-labelledby={ids.legend}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${ids.kept} ${ids.issue}` : ids.kept}
        onValueChange={onAnswer}
      >
        {cardsOf(question).map((currency) => (
          <RadioCard
            key={currency}
            value={currency}
            title={t('card', { count, currency })}
            line={t('cardLine', { count, currency, next, instead: currency === next ? 'no' : 'yes' })}
            describedBy={ids.line}
          />
        ))}
      </RadioGroup>
      {invalid && (
        <p id={ids.issue} role="alert" className="text-13 text-negative">
          {t('issue', { count })}
        </p>
      )}
      <p id={ids.line} className="text-13 text-ink-2">
        {t('oneCurrency')}
      </p>
    </div>
  );
}

/** With saved entries and nothing to ask: why Today counts them (they hold no amount, or the currency is the same). */
export function SavedEntriesLine({ count, format }: { readonly count: number; readonly format: Formatters }) {
  const t = useTranslations('onboarding.summary.kept');
  if (count === 0) return null;
  return <p className="text-16 text-ink-2">{t('stay', { count, figure: figureOf(format, count) })}</p>;
}
