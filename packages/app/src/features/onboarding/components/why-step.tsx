import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldDescription } from '@proofofcalm/ui/components/field';
import { Textarea } from '@proofofcalm/ui/components/textarea';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

// Both paths' sentence (docs/CONTENT-STYLE.md §3, "Why sentence"): one optional sentence the Red day page
// shows back, labelled by the step's heading. The field stops at the plan's 280 characters (`PlanSchema.why`);
// the plan keeps it trimmed.
const WHY_MAX_LENGTH = 280;

export type WhyStepProps = {
  readonly value: string;
  onChange(why: string): void;
  onBack(): void;
  onContinue(): void;
};

export function WhyStep({ value, onChange, onBack, onContinue }: WhyStepProps) {
  const t = useTranslations('onboarding');
  const heading = useId();
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 id={heading} tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('why.heading')}
      </h2>
      <Field>
        <Textarea
          aria-labelledby={heading}
          value={value}
          maxLength={WHY_MAX_LENGTH}
          placeholder={t('why.placeholder')}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <FieldDescription>{t('why.line')}</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        <Button onClick={onContinue}>{t('next')}</Button>
      </div>
    </section>
  );
}
