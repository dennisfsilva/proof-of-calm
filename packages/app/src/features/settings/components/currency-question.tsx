import {
  type CurrencyAnswer,
  type CurrencyQuestion,
  decimal,
  type Entry,
  isZero,
  liveEntries,
  type Plan,
} from '@proofofcalm/core';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import { useEffect, useId, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import { TaxYearExport } from './tax-year-export';

// The parts the country change adds when the currency can move (ADR-0053, docs/DOMAIN.md §6 "Change country"):
// the currency question, two choice cards with nothing chosen and the one-currency line under them; the rows that
// say the plan's own amounts take the new currency; and the files-first block, the current country's tax-year
// files offered under the export line before the rules change (docs/LEGAL.md §4: the block sits above Your data's
// line, so it carries its own). The cards are packages/ui's radio group, never native inputs (docs/SECURITY.md §4).

/** What the change asks and how the person answered, as the section holds them. */
export type CurrencyState = { readonly question: CurrencyQuestion | null; readonly answer: CurrencyAnswer | null };

/** The answer the summary shows before one is given: `keep` relabels nothing, so the rows promise nothing. */
export const previewAnswer = ({ question, answer }: CurrencyState): CurrencyAnswer =>
  question === null ? 'country' : (answer ?? 'keep');

/** The answer the write takes: null when the screen asked nothing (`changeCountryOf`). */
export const givenAnswer = ({ question, answer }: CurrencyState): CurrencyAnswer | null =>
  question === null ? null : answer;

/** Whether confirming is refused for want of an answer, as the rule tick is. */
export const unanswered = ({ question, answer }: CurrencyState): boolean => question !== null && answer === null;

type QuestionProps = {
  readonly question: CurrencyQuestion;
  /** Takes each choice, and null when the group mounts; a stable function (the section's state setter). */
  readonly onAnswer: (answer: CurrencyAnswer | null) => void;
  /** Marks the group and shows the refusal under it after a confirm without an answer. */
  readonly invalid: boolean;
};

/**
 * Uncontrolled, so nothing is chosen at first. What it shows checked is the answer the write takes, both ways: each
 * mount clears the answer (the group can mount again while a change stays open, when the plan leaves and comes back),
 * and the section remounts it (a key) whenever it clears the answer. Not controlled: the group's value type has no
 * "nothing chosen", and a stand-in value would take the first card's tab stop from a group with none chosen.
 */
export function CurrencyQuestionGroup({ question, onAnswer, invalid }: QuestionProps) {
  useEffect(() => onAnswer(null), [onAnswer]);
  const t = useTranslations('settings.country.question');
  const f = useFormatters();
  const figures = useMemo(() => createNumberInput(f.locales.numbers), [f.locales.numbers]);
  const ids = { legend: useId(), issue: useId(), line: useId() };
  const { logged, country, count } = question;
  const figure = figures.format(decimal(String(count)));
  return (
    <div className="flex flex-col gap-stack-xs">
      <p id={ids.legend} className="text-16 text-ink">
        {t('legend', { count, figure, first: f.date(question.first), last: f.date(question.last), logged })}
      </p>
      <RadioGroup<CurrencyAnswer>
        aria-labelledby={ids.legend}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? ids.issue : undefined}
        onValueChange={onAnswer}
      >
        <RadioCard
          value="keep"
          title={t('keep', { logged })}
          line={t('keepLine', { count, logged })}
          describedBy={ids.line}
        />
        <RadioCard
          value="country"
          title={t('country', { country })}
          line={t('countryLine', { count, country })}
          describedBy={ids.line}
        />
      </RadioGroup>
      {invalid && (
        <p id={ids.issue} role="alert" className="text-13 text-negative">
          {t('issue', { logged, country })}
        </p>
      )}
      <p id={ids.line} className="text-13 text-ink-2">
        {t('oneCurrency', { logged, country })}
      </p>
    </div>
  );
}

/** One row for each of the plan's own amounts that is not zero, when the change moves the pay currency. */
export function AmountRows({ opened, next }: { readonly opened: Plan; readonly next: Plan }) {
  const t = useTranslations('settings.country.row');
  const f = useFormatters();
  if (next.payCurrency === opened.payCurrency) return null;
  return (['monthlyAmount', 'startingAmount'] as const)
    .filter((field) => !isZero(opened[field]))
    .map((field) => (
      <li key={field}>
        {t('amount', {
          field,
          from: f.money(opened[field], opened.payCurrency),
          to: f.money(opened[field], next.payCurrency),
        })}
      </li>
    ));
}

/** The block above the confirm button: with any live entry, the current country's tax-year files first. */
export function FilesFirst({ entries }: { readonly entries: readonly Entry[] }) {
  const t = useTranslations('settings');
  if (liveEntries(entries).length === 0) return null;
  return (
    <div className="flex flex-col gap-stack-sm">
      <p className="text-16 text-ink">{t('country.files')}</p>
      <p className="text-ink-2">
        {t('data.exportLine', { product: BRAND.name })}{' '}
        <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
          {t('data.riskLink')}
        </a>
      </p>
      <TaxYearExport />
    </div>
  );
}
