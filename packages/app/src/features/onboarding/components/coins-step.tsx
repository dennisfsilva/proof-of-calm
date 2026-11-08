import { COINS } from '@proofofcalm/content';
import { Button } from '@proofofcalm/ui/components/button';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { CoinEditor, type CoinSplitValue, type SplitIssue } from '../../plan';

// The custom path's first step: plan's coin editor over the whole catalogue, alphabetical and with nothing
// suggested (ADR-0009), its legend for screen readers only under the step heading. Continue waits for a coin; a refused Continue moves the focus to the first share
// the issues mark invalid.
export type CoinsStepProps = {
  readonly value: CoinSplitValue;
  /** From `coinsIssues`, set by the last Continue. */
  readonly issues: readonly SplitIssue[];
  onChange(value: CoinSplitValue): void;
  onBack(): void;
  onContinue(): void;
};

export function CoinsStep({ value, issues, onChange, onBack, onContinue }: CoinsStepProps) {
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
        {t('coins.heading')}
      </h2>
      <CoinEditor value={value} catalogue={COINS} issues={issues} onChange={onChange} legend="hidden" />
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          disabled={value.coins.length === 0}
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
