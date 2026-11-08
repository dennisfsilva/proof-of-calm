'use client';

import { Field, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput } from '@proofofcalm/ui/components/input';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import { useId } from 'react';
import { useTranslations } from 'use-intl';
import type { EarlyNotice, SellWindowIssue, SellWindowValue } from '../lib/sell-window';
import { EarlyWindowNotice } from './early-window-notice';

// The plan's sell window (docs/DOMAIN.md §2.1, §3.8), controlled by the host: Settings' Hold & sell tab. Two
// choice cards, no window and a dated one; the dated one shows its three dates, each bounded by the one before.
// A window that opens before the last buy passes the holding rule shows the notice with its acceptance, which
// any change of a date or of the choice drops. Each message sits under the date it concerns, the one marked
// invalid, where a refused save moves the focus; an early window not accepted marks the acceptance.

export type SellWindowEditorProps = {
  readonly value: SellWindowValue;
  /** From `sellWindowOf`; the host may pass other issues, which the editor leaves unworded. */
  readonly issues: readonly { readonly code: string; readonly path: readonly unknown[] }[];
  /** From `earlyOpenOf`, with the rule and the last buy the save would keep, and the rule's name. */
  readonly early: EarlyNotice | null;
  readonly onChange: (value: SellWindowValue) => void;
};

type DateField = 'opens' | 'closes' | 'exitBy';
const issueOn = (issues: SellWindowEditorProps['issues'], field: DateField | 'acceptEarly') =>
  issues.find((issue) => issue.path[0] === 'sellWindow' && issue.path[1] === field) as SellWindowIssue | undefined;

export function SellWindowEditor({ value, issues, early, onChange }: SellWindowEditorProps) {
  const t = useTranslations('plan.sellWindow');
  const legend = useId();
  const set = (patch: Partial<SellWindowValue>) => onChange({ ...value, ...patch, acceptEarly: false });

  const date = (field: DateField, min: string) => {
    const issue = issueOn(issues, field);
    const message =
      issue?.code === 'sell-window-order'
        ? t(`issue.order.${issue.path[1]}`)
        : issue?.code === 'date-required'
          ? t('issue.date-required')
          : null;
    return (
      <Field invalid={message !== null}>
        <FieldLabel>{t(field)}</FieldLabel>
        <DateInput
          value={value[field]}
          onChange={(event) => set({ [field]: event.currentTarget.value })}
          {...(min === '' ? {} : { min })}
        />
        {message !== null && <FieldError>{message}</FieldError>}
      </Field>
    );
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-stack-md">
      <legend id={legend} className="mb-stack-sm font-medium text-16 text-ink">
        {t('legend')}
      </legend>
      <RadioGroup<SellWindowValue['mode']>
        aria-labelledby={legend}
        value={value.mode}
        onValueChange={(mode) => set({ mode })}
      >
        <RadioCard value="none" title={t('none')} line={t('noneLine')} />
        <RadioCard value="dates" title={t('dates')} line={t('datesLine')} />
      </RadioGroup>
      {value.mode === 'dates' && (
        <>
          {date('opens', '')}
          {date('closes', value.opens)}
          {date('exitBy', value.closes)}
          {early !== null && (
            <EarlyWindowNotice
              {...early}
              on="window"
              accepted={value.acceptEarly}
              onAccept={(acceptEarly) => onChange({ ...value, acceptEarly })}
              invalid={issueOn(issues, 'acceptEarly') !== undefined}
            />
          )}
        </>
      )}
    </fieldset>
  );
}
