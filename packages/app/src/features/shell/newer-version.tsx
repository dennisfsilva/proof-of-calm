import { Button } from '@proofofcalm/ui/components/button';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../lib/brand';
import { usePlatform, useSnapshot } from '../../lib/services';

// Rows a newer build wrote, left in place unread (ADR-0019 readings, "Row shape"): an old tab still open,
// or a build rolled back after a newer one wrote. A newer live plan takes the screen area with Reload in
// place of every screen, so this build neither shows "No plan yet" beside it nor writes a second plan;
// newer entries alone leave the screens as they are, with Today's line under its heading (NewerEntriesLine).
// Nothing here writes.

export type NewerVersionProps = {
  readonly children: ReactNode;
};

export function NewerVersion({ children }: NewerVersionProps) {
  const t = useTranslations('shell.newer');
  const platform = usePlatform();
  const plans = useSnapshot((snapshot) => snapshot.newer.plans);
  const product = BRAND.name;
  if (plans > 0) {
    return (
      <div className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-stack-lg px-gutter py-stack-lg">
        <h1 tabIndex={-1} className="text-28">
          {t('title', { product })}
        </h1>
        <p className="text-16 text-ink-2">{t('line')}</p>
        <p className="text-16 text-ink-2">{t('again', { product })}</p>
        <div>
          <Button onClick={() => platform.reload()}>{t('reload')}</Button>
        </div>
      </div>
    );
  }
  return children;
}
