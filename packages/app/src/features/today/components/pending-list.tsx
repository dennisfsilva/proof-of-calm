import type { Action } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';

// The quiet list under the primary action (docs/DOMAIN.md §3.3): every other action that still asks
// for a buy, oldest first, one line each in the words of the primary action's heading. No colour, no
// count badge: nothing nags (ADR-0013).

export type PendingListProps = { readonly actions: readonly Action[] };

export function PendingList({ actions }: PendingListProps) {
  const t = useTranslations('today');
  const f = useFormatters();
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby="today-pending" className="flex flex-col gap-stack-xs">
      <h2 id="today-pending" className="font-semibold text-16">
        {t('pending.heading')}
      </h2>
      <ul aria-labelledby="today-pending" className="flex flex-col gap-stack-xs text-14 text-ink-2">
        {actions.map((action) => {
          const date = f.date(action.due);
          return (
            <li key={action.slot ?? 'starting'} className="nums">
              {action.slot === null
                ? t('action.starting', { date })
                : t('pending.dca', { month: f.month(action.slot), date })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
