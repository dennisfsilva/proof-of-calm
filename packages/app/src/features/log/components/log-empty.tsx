import { compareDates, type Plan } from '@proofofcalm/core';
import { Empty, EmptyDescription } from '@proofofcalm/ui/components/empty';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useFormatters, useSnapshot, useToday } from '../../../lib/services';

/**
 * The Log's text while no entry is listed (docs/CONTENT-STYLE.md §3, the Empty rows): with the plan set aside as
 * unreadable and entries on this device, live (`stored`) or set aside too, it says why none is listed and links to
 * Settings' import (ADR-0019 Readings, 2026-11-26).
 */
export function LogEmpty({ plan, stored }: { readonly plan: Plan | null; readonly stored: boolean }) {
  const t = useTranslations('log');
  const f = useFormatters();
  const today = useToday();
  const unread = useSnapshot((snapshot) => snapshot.setAside.plans.length > 0);
  const entriesSetAside = useSnapshot((snapshot) => snapshot.setAside.entries.length > 0);
  const past = plan !== null && compareDates(plan.firstBuy, today) < 0;
  const text =
    plan === null
      ? unread && (stored || entriesSetAside)
        ? t.rich('empty.planSetAside', {
            settings: (chunks) => (
              <Link href="/settings" className="text-ink underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })
        : t('empty.noPlan')
      : t(past ? 'empty.firstBuyPast' : 'empty.firstBuy', { date: f.date(plan.firstBuy) });
  return (
    <Empty>
      <EmptyDescription>{text}</EmptyDescription>
    </Empty>
  );
}
