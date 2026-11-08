import type { CurrencyCode } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { ScheduleEditor, type ScheduleIssue, type ScheduleValue } from '../../plan';

// The custom path's amounts and dates: plan's amount-and-dates editor, then Back and Continue, which runs
// the plan's dry run (`checkPlan`). The custom plan has no sell window (Settings adds one), so the editor
// shows no early-window notice; its legend is for screen readers only under the step heading, and the starting amount's
// hint is onboarding's, which names the Log's way in for coins already held. A refused Continue moves the focus to the first field the issues mark invalid.
export type DatesStepProps = {
  readonly value: ScheduleValue;
  /** From `checkPlan`, set by the last Continue. */
  readonly issues: readonly ScheduleIssue[];
  /** The chosen country's currency: the amounts are in it. */
  readonly currency: CurrencyCode;
  onChange(value: ScheduleValue): void;
  onBack(): void;
  onContinue(): void;
};

export function DatesStep({ value, issues, currency, onChange, onBack, onContinue }: DatesStepProps) {
  const t = useTranslations('onboarding');
  const section = useRef<HTMLElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current) return;
    asked.current = false;
    section.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [issues]);
  return (
    <section ref={section} className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('dates.heading')}
      </h2>
      <ScheduleEditor
        value={value}
        issues={issues}
        currency={currency}
        early={null}
        startingHint={t('dates.startingHint')}
        onChange={onChange}
        legend="hidden"
      />
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          onClick={() => {
            asked.current = true;
            onContinue();
          }}
        >
          {t('next')}
        </Button>
      </div>
    </section>
  );
}
