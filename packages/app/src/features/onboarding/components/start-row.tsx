import { Button } from '@proofofcalm/ui/components/button';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';

// The end of both paths: the one acknowledged disclosure of docs/LEGAL.md §4 with its Risk link, then Back
// and the button whose label says the tap accepts the text, in a row that wraps when the text is large.
export type StartRowProps = {
  /** The plan is being written: Start waits for it. */
  readonly pending?: boolean | undefined;
  onBack(): void;
  onStart(): void;
};

export function StartRow({ pending, onBack, onStart }: StartRowProps) {
  const t = useTranslations('onboarding');
  return (
    <>
      <p>
        {t('disclosure.text', { product: BRAND.name })} <a href="/risk">{t('disclosure.riskLink')}</a>
      </p>
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        {/* Focusable while pending, so the focus never drops to the body (docs/DESIGN.md §6). */}
        <Button disabled={pending === true} focusableWhenDisabled onClick={onStart}>
          {t('start')}
        </Button>
      </div>
    </>
  );
}
