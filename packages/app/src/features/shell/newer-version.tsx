import { decimal } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../lib/brand';
import { createNumberInput } from '../../lib/format';
import { usePathname } from '../../lib/navigation';
import { useFormatters, usePlatform, useSnapshot } from '../../lib/services';

// Rows a newer build wrote, left in place unread (ADR-0019 readings, "Row shape"): an old tab still open,
// or a build rolled back after a newer one wrote. A newer live plan takes the screen area with Reload in
// place of every screen, so this build neither shows "No plan yet" beside it nor writes a second plan;
// newer entries alone leave the screens as they are, with one line above Today. Nothing here writes.

export type NewerVersionProps = {
  readonly children: ReactNode;
};

export function NewerVersion({ children }: NewerVersionProps) {
  const t = useTranslations('shell.newer');
  const platform = usePlatform();
  const pathname = usePathname();
  const newer = useSnapshot((snapshot) => snapshot.newer);
  const { locales } = useFormatters();
  const product = BRAND.name;
  if (newer.plans > 0) {
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
  const onToday = pathname === '/today' || pathname.startsWith('/today/');
  // The count grouped as the plan's country groups it (`1,234`, `1.234`; CONTENT-STYLE §4), never ICU's `#`.
  const figure = createNumberInput(locales.numbers).format(decimal(String(newer.entries)));
  return (
    <>
      {newer.entries > 0 && onToday && (
        <p className="mx-auto w-full max-w-reading px-gutter pt-stack-lg text-16 text-ink-2">
          {t('entries', { count: newer.entries, figure, product })}
        </p>
      )}
      {children}
    </>
  );
}
