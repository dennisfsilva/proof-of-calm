import type { Entry, Plan } from '@proofofcalm/core';
import { Timeline } from '@proofofcalm/ui/charts/timeline';
import { buttonVariants } from '@proofofcalm/ui/components/button';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useFormatters, useRules, useSnapshot, useToday } from '../../../lib/services';
import { HoldingConditions, WhyLink } from '../../learn';
import { NoPlan } from '../../today';
import { planSummary, planTimeline } from '../lib/timeline';
import { EndBuying } from './end-buying';
import { PauseSection } from './pause-section';

// The Plan screen (ROADMAP M1, docs/DESIGN.md §8): the plan in its own words, how much is in so far,
// the timeline with its list and table, the holding note with the country's conditions (docs/LEGAL.md
// §4), the sellable-now lines in the sell phase, Pause or Resume and End buying while buying lasts (an
// ended plan says when it ended), "Edit plan", which opens Settings until the plan editors arrive, and
// "Review the plan", under "Change the plan", which shows while a plan exists. It reads no prices and no history. The h1 takes the focus when a dialog closes
// with nothing else left to give it to (docs/DESIGN.md §6).
export function PlanScreen() {
  const t = useTranslations('plan');
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 tabIndex={-1} className="text-28">
        {t('title')}
      </h1>
      {plan === null ? <NoPlan /> : <PlanBody plan={plan} entries={entries} />}
    </div>
  );
}

function PlanBody({ plan, entries }: { plan: Plan; entries: readonly Entry[] }) {
  const t = useTranslations('plan');
  const f = useFormatters();
  const today = useToday();
  const rules = useRules();
  const { timeline, summary } = useMemo(() => {
    const text = { f, t };
    return {
      timeline: planTimeline(plan, entries, today, rules, text),
      summary: planSummary(plan, entries, today, rules, text),
    };
  }, [plan, entries, today, rules, f, t]);
  const [lead, ...rest] = summary.reference;
  return (
    <>
      <section className="flex flex-col gap-stack-sm">
        <p className="font-semibold text-18 text-ink">
          {lead}
          {plan.sellWindow !== null && (
            <>
              {' '}
              <WhyLink module="cycles" section="the-window-is-a-discipline-device" name={t('why.window')} />
            </>
          )}
        </p>
        {rest.map((line) => (
          <p key={line} className="text-16 text-ink-2">
            {line}
          </p>
        ))}
        {summary.why !== null && <p className="text-16 text-ink-2">{summary.why}</p>}
        <p className="nums text-16 text-ink">{summary.totals}</p>
        {summary.beforeFirstBuy !== null && <p className="text-16 text-ink-2">{summary.beforeFirstBuy}</p>}
      </section>
      <section className="flex flex-col gap-stack-sm" aria-labelledby="plan-timeline">
        <h2 id="plan-timeline" className="font-semibold text-20">
          {t('timeline.heading')}
        </h2>
        <Timeline {...timeline} />
        {summary.holdingNote && (
          <>
            <p className="text-13 text-ink-2">{t('holding.note')}</p>
            <HoldingConditions />
          </>
        )}
        {plan.sellWindow !== null && (
          <p className="text-16 text-ink-2">
            {t('why.partsLine')} <WhyLink module="cycles" section="three-parts" name={t('why.parts')} />
          </p>
        )}
      </section>
      {summary.sellable.length > 0 && (
        <ul className="flex flex-col gap-1">
          {summary.sellable.map((line) => (
            <li key={line} className="nums text-16 text-ink">
              {line}
            </li>
          ))}
        </ul>
      )}
      <PauseSection />
      <section className="flex flex-col gap-stack-sm" aria-labelledby="plan-change">
        <h2 id="plan-change" className="font-semibold text-20">
          {t('change.heading')}
        </h2>
        <EndBuying />
        <Link href="/settings" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          {t('edit')}
        </Link>
        <Link href="/plan/review" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          {t('change.review')}
        </Link>
      </section>
    </>
  );
}
