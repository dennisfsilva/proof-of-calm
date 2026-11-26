import { compareDates, type Plan } from '@proofofcalm/core';
import { Empty, EmptyDescription } from '@proofofcalm/ui/components/empty';
import { useTranslations } from 'use-intl';
import { useFormatters, useToday } from '../../../lib/services';

/** The Log's text while no entry is live (docs/CONTENT-STYLE.md §3, the Empty rows). */
export function LogEmpty({ plan }: { readonly plan: Plan | null }) {
  const t = useTranslations('log');
  const f = useFormatters();
  const today = useToday();
  const past = plan !== null && compareDates(plan.firstBuy, today) < 0;
  return (
    <Empty>
      <EmptyDescription>
        {plan === null
          ? t('empty.noPlan')
          : t(past ? 'empty.firstBuyPast' : 'empty.firstBuy', { date: f.date(plan.firstBuy) })}
      </EmptyDescription>
    </Empty>
  );
}
