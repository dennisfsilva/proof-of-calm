import { decimal } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import { useFormatters, useSnapshot } from '../../../lib/services';

/**
 * Entries a newer build wrote, left in place unread (ADR-0019 Readings, "Row shape"), in one plain line under
 * Today's title, where a tab navigation puts the focus. A newer plan takes the whole screen in the shell instead.
 */
export function NewerEntriesLine() {
  const t = useTranslations('today.newer');
  const entries = useSnapshot((snapshot) => snapshot.newer.entries);
  const { locales } = useFormatters();
  if (entries === 0) return null;
  // The count grouped as the plan's country groups it (`1,234`, `1.234`; CONTENT-STYLE §4), never ICU's `#`.
  const figure = createNumberInput(locales.numbers).format(decimal(String(entries)));
  return <p className="text-16 text-ink-2">{t('entries', { count: entries, figure, product: BRAND.name })}</p>;
}
