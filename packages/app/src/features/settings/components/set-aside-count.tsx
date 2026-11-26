import { decimal } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import { useFormatters, useSnapshot } from '../../../lib/services';

/** How many saved items were set aside as unreadable, under Your data, while any is (ADR-0019 Readings, 2026-11-26). */
export function SetAsideCount() {
  const t = useTranslations('settings.data');
  const f = useFormatters();
  const count = useSnapshot((snapshot) => snapshot.quarantined);
  if (count === 0) return null;
  const figure = createNumberInput(f.locales.numbers).format(decimal(String(count)));
  return <p className="text-ink-2">{t('setAside', { count, figure, product: BRAND.name })}</p>;
}
