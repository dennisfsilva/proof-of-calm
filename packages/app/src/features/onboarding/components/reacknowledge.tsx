import { Button } from '@proofofcalm/ui/components/button';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { useServices } from '../../../lib/services';
import { reacknowledge } from '../actions';

// The plan-creation disclosure asked again (docs/DOMAIN.md §2.1): in Today's place while it is due, never a
// modal (docs/LEGAL.md §4), so every other screen stays open. The button records the acknowledgement, and the
// route table shows Today once the plan is no longer due.
export type ReacknowledgeProps = {
  /** The wording version the screen shows, which the button records. */
  readonly version: number;
};

export function Reacknowledge({ version }: ReacknowledgeProps) {
  const t = useTranslations('onboarding');
  const errors = useTranslations('errors');
  const services = useServices();
  const [failed, setFailed] = useState(false);
  const tapped = useRef(false);
  // The pathname stays, so the shell moves no focus and no scroll: as this screen goes, the heading of the
  // one that takes its place gets the focus, which never drops to the body, and comes into view, since the
  // button may have been scrolled down to on a short window (docs/DESIGN.md §6).
  useEffect(
    () => () => {
      if (!tapped.current) return;
      const heading = document.querySelector<HTMLElement>('#main h1');
      if (heading === null) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'nearest' });
    },
    [],
  );
  const accept = () => {
    tapped.current = true;
    setFailed(false);
    reacknowledge(services, version).catch(() => {
      tapped.current = false;
      setFailed(true);
    });
  };
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 className="font-semibold text-28 tracking-heading">{t('reask.title')}</h1>
      <p>
        {t('disclosure.text', { product: BRAND.name })} <a href="/risk">{t('disclosure.riskLink')}</a>
      </p>
      <div className="flex flex-wrap gap-target-gap">
        <Button onClick={accept}>{t('reask.continue')}</Button>
      </div>
      {failed && (
        <p role="alert" className="text-negative">
          {errors('unknown')}
        </p>
      )}
    </div>
  );
}
