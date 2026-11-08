'use client';

import { type CurrencyCode, MAX_SLOTS, MINOR_UNITS } from '@proofofcalm/core';
import { Field, FieldDescription, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput, NumericInput } from '@proofofcalm/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { type ReactNode, useId } from 'react';
import { useTranslations } from 'use-intl';
import { lastBuyMax, MAX_PLAN_YEARS, type ScheduleIssue, type ScheduleValue } from '../lib/schedule';
import type { EarlyNotice } from '../lib/sell-window';
import { EarlyWindowNotice } from './early-window-notice';

// The plan's amounts and dates (docs/DOMAIN.md §2.1), controlled by the host: Settings' Plan tab and
// onboarding's custom path, its dates step. The amounts are numeric
// fields (ADR-0034) read by the host's `schedule`; the dates are date inputs, the last buy bounded by
// the first and the last date the plan accepts (`lastBuyMax`); the buy day is a select of 1 to 28. Each message sits under the
// field it concerns, which is the one marked invalid, so a host that refuses a save moves the focus to
// the first invalid field. A last buy that opens the plan's sell window before it passes the holding rule shows
// the notice under it, with the acceptance a save waits for; moving the last buy drops the acceptance.

export type ScheduleEditorProps = {
  readonly value: ScheduleValue;
  /** From `schedule`: the issues of the amounts and the dates. */
  readonly issues: readonly ScheduleIssue[];
  /** The plan's pay currency: the amounts are in it and have its minor unit. */
  readonly currency: CurrencyCode;
  /** From `earlyToAccept` with the rule's name: the early opening this last buy asks to accept, if any. */
  readonly early: EarlyNotice | null;
  /** The starting amount's hint: onboarding's own; Settings' Plan tab keeps the plan's. */
  readonly startingHint?: ReactNode;
  /** A line under the last buy that describes it, such as Settings' ended line. */
  readonly lastBuyHint?: string | undefined;
  readonly onChange: (value: ScheduleValue) => void;
  /** `hidden` under a host's own heading (onboarding): the legend still names the group for screen readers. */
  readonly legend?: 'shown' | 'hidden' | undefined;
};

type ScheduleField = keyof ScheduleValue;
const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

export function ScheduleEditor({
  value,
  issues,
  currency,
  early,
  startingHint,
  lastBuyHint,
  onChange,
  legend = 'shown',
}: ScheduleEditorProps) {
  const t = useTranslations('plan.schedule');
  const input = useTranslations('errors.input');
  const buyDayHint = useId();
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });

  const message = (field: ScheduleField) => {
    const issue = issues.find((candidate) => candidate.path[0] === field);
    if (issue === undefined) return null;
    switch (issue.code) {
      case 'number-invalid':
        return input('number-invalid', { example: issue.example });
      case 'number-empty':
      case 'number-negative':
        return input(issue.code);
      case 'amount-negative':
        return input('number-negative');
      case 'amount-precision':
        return t('issue.amount-precision', { max: MINOR_UNITS[currency] });
      case 'plan-too-long':
        return 'limit' in issue && issue.limit === 'years'
          ? t('issue.plan-too-long-years', { years: MAX_PLAN_YEARS })
          : t('issue.plan-too-long', { max: MAX_SLOTS });
      case 'no-amount':
      case 'date-required':
      case 'last-buy-before-first-buy':
        return t(`issue.${issue.code}`);
      default:
        return null;
    }
  };

  const amount = (field: 'monthlyAmount' | 'startingAmount', label: string, hint?: ReactNode) => {
    const issue = message(field);
    return (
      <Field invalid={issue !== null}>
        <FieldLabel>{label}</FieldLabel>
        <NumericInput value={value[field]} onChange={(event) => set({ [field]: event.currentTarget.value })} />
        {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
        {issue !== null && <FieldError>{issue}</FieldError>}
      </Field>
    );
  };

  const date = (
    field: 'firstBuy' | 'lastBuy',
    label: string,
    bounds: { min?: string; max?: string } = {},
    hint?: string,
  ) => {
    const issue = message(field);
    return (
      <Field invalid={issue !== null}>
        <FieldLabel>{label}</FieldLabel>
        <DateInput
          value={value[field]}
          onChange={(event) =>
            set({ [field]: event.currentTarget.value, acceptEarly: field === 'firstBuy' && value.acceptEarly })
          }
          {...bounds}
        />
        {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
        {issue !== null && <FieldError>{issue}</FieldError>}
      </Field>
    );
  };

  const { firstBuy, buyDay } = value;
  const lastBounds = firstBuy === '' ? {} : { min: firstBuy, max: lastBuyMax(firstBuy, buyDay) };

  return (
    <fieldset className="flex min-w-0 flex-col gap-stack-md">
      <legend className={legend === 'hidden' ? 'sr-only' : 'mb-stack-sm font-medium text-16 text-ink'}>
        {t('legend')}
      </legend>
      {amount('monthlyAmount', t('monthly', { currency }))}
      {amount('startingAmount', t('starting', { currency }), startingHint ?? t('startingHint'))}
      {date('firstBuy', t('firstBuy'))}
      <div className="flex flex-col gap-stack-xs">
        <Select<number> value={value.buyDay} onValueChange={(day) => day !== null && set({ buyDay: day })}>
          <SelectLabel>{t('buyDay')}</SelectLabel>
          <SelectTrigger aria-describedby={buyDayHint}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((day) => (
              <SelectItem key={day} value={day}>
                {day}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={buyDayHint} className="text-13 text-ink-2">
          {t('buyDayHint')}
        </p>
      </div>
      {date('lastBuy', t('lastBuy'), lastBounds, lastBuyHint)}
      {early !== null && (
        <EarlyWindowNotice
          {...early}
          on="lastBuy"
          accepted={value.acceptEarly}
          onAccept={(acceptEarly) => set({ acceptEarly })}
          invalid={issues.some((issue) => issue.path[0] === 'acceptEarly')}
        />
      )}
    </fieldset>
  );
}
