import { decimal, liveEntries } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import type { Snapshot } from '../../../lib/ports';
import { useFormatters, useSnapshot } from '../../../lib/services';

/** The set-aside rows an import brought back: entries whose id is live again, and the plan row of the plan shown. */
function recovered({ plan, entries, setAside }: Snapshot): number {
  const live = new Set<string>(liveEntries(entries).map((entry) => entry.id));
  const back = setAside.entries.filter((row) => live.has(row.id)).length;
  return back + setAside.plans.filter((row) => row.id === plan?.id).length;
}

/** How many saved items were set aside as unreadable, under Your data, while any is (ADR-0019 Readings, 2026-11-26). */
export function SetAsideCount() {
  const t = useTranslations('settings.data');
  const f = useFormatters();
  const count = useSnapshot((snapshot) => snapshot.quarantined);
  const back = useSnapshot(recovered);
  if (count === 0) return null;
  const figure = (value: number) => createNumberInput(f.locales.numbers).format(decimal(String(value)));
  const values = { count, figure: figure(count), product: BRAND.name };
  // What exports still leave out: the some-back words name it, the all-back words say only the copies stay.
  const remaining = Math.max(count - back, 0);
  const recovery = { recovered: back, back: figure(back), remaining, rest: figure(remaining) };
  return (
    <p className="text-ink-2">{back === 0 ? t('setAside', values) : t('setAsideBack', { ...values, ...recovery })}</p>
  );
}
