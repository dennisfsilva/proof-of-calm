import { decimal } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { Link } from '../../../lib/navigation';
import { useFormatters, useMissingEntries } from '../../../lib/services';

/**
 * Saved entries that could not be read and are still missing, in one plain line under the title: text and a
 * link to the Log, which says how to bring them back and hides the line (ADR-0019 Readings, 2026-11-26).
 */
export function SetAsideLine() {
  const t = useTranslations('today');
  const f = useFormatters();
  const { count } = useMissingEntries();
  if (count === 0) return null;
  const figure = createNumberInput(f.locales.numbers).format(decimal(String(count)));
  return (
    <p className="text-16 text-ink-2">
      {t.rich('setAside', {
        count,
        figure,
        log: (chunks) => (
          <Link href="/log" className="text-ink underline underline-offset-4">
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
