import { type CalendarDate, type CurrencyCode, MAX_SLOTS, MINOR_UNITS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput, NumericInput } from '@proofofcalm/ui/components/input';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { type EarlyNotice, EarlyWindowNotice } from '../../plan';
import type { SetupDraft } from '../model/draft';
import type { FieldIssue, FieldName } from '../model/setup';

// The user's numbers (ADR-0034: text fields with the decimal keypad, native date pickers), then Back and
// Continue, which runs the plan's dry run (`checkPlan`). A template whose sell window opens before its last
// buy passes the chosen country's rule shows plan's early-window notice, with the acceptance Continue waits for.
export type NumbersStepProps = {
  readonly draft: SetupDraft;
  readonly currency: CurrencyCode;
  /** The chosen country's formatting: the notice's and the refusals' dates are in it. */
  readonly format: Formatters;
  readonly askLastBuy: boolean;
  /** The template's last buy while it stands (no Last buy field): a first buy after it is refused by its date. */
  readonly templateLastBuy: CalendarDate | null;
  readonly fieldIssues: readonly FieldIssue[];
  /** The early opening the template's dates ask to accept under the chosen country's rule, if any. */
  readonly early: EarlyNotice | null;
  /** Continue was refused for want of the acceptance: the notice's box is marked invalid. */
  readonly earlyInvalid?: boolean;
  onChange(patch: Partial<SetupDraft>): void;
  onBack(): void;
  onContinue(): void;
};

export function NumbersStep(props: NumbersStepProps) {
  const { draft, currency, fieldIssues, early, onChange } = props;
  const t = useTranslations('onboarding');
  const input = useTranslations('errors.input');
  const wording = (field: FieldName) => {
    const error = fieldIssues.find((issue) => issue.field === field)?.error;
    switch (error?.code) {
      case undefined:
        return null;
      case 'number-invalid':
        return input('number-invalid', { example: error.example });
      case 'number-empty':
      case 'number-negative':
        return input(error.code);
      case 'date-empty':
        return t('numbers.dateEmpty');
      case 'amount-precision':
        return t('numbers.issue.amount-precision', { max: MINOR_UNITS[currency] });
      case 'plan-too-long':
        // Without a Last buy field the first buy is what to change (setup.ts places the issue).
        return t('numbers.issue.plan-too-long', { max: MAX_SLOTS, field });
      case 'last-buy-before-first-buy':
        return t('numbers.issue.last-buy-before-first-buy', {
          field,
          date: props.templateLastBuy === null ? '' : props.format.date(props.templateLastBuy),
        });
      case 'no-amount':
        return t('numbers.issue.no-amount');
    }
  };
  const field = (name: FieldName, label: string, Input: typeof NumericInput | typeof DateInput, hint?: string) => {
    const issue = wording(name);
    return (
      <Field invalid={issue !== null}>
        <FieldLabel>{label}</FieldLabel>
        <Input value={draft[name]} onChange={(event) => onChange({ [name]: event.currentTarget.value })} />
        {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
        {issue !== null && <FieldError>{issue}</FieldError>}
      </Field>
    );
  };
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('numbers.heading')}
      </h2>
      {field('monthly', t('numbers.monthly', { currency }), NumericInput)}
      {field('starting', t('numbers.starting', { currency }), NumericInput, t('numbers.startingHint'))}
      {field('firstBuy', t('numbers.firstBuy'), DateInput)}
      {props.askLastBuy && field('lastBuy', t('numbers.lastBuy'), DateInput)}
      {early !== null && (
        <EarlyWindowNotice
          {...early}
          on="template"
          format={props.format}
          accepted={draft.acceptEarlyOpen}
          onAccept={(acceptEarlyOpen) => onChange({ acceptEarlyOpen })}
          invalid={props.earlyInvalid === true}
        />
      )}
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={props.onBack}>
          {t('back')}
        </Button>
        <Button onClick={props.onContinue}>{t('next')}</Button>
      </div>
    </section>
  );
}
