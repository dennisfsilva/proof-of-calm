import { GENERIC_COUNTRY } from '@proofofcalm/content';
import { type Plan, type ReviewDates, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { Link } from '../../../lib/navigation';
import {
  reviewSince,
  useFormatters,
  useProfile,
  useReviewDates,
  useRules,
  useServices,
  useSnapshot,
  useToday,
} from '../../../lib/services';
import { CountryDateLine } from '../../learn';
import { NoPlan } from '../../today';
import { planActions } from '../actions';
import { reviewSummary } from '../lib/review';
import { planReference } from '../lib/timeline';
import { reviewVenues } from '../lib/venues';
import { VenueList } from './venue-list';

// The annual review page (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page (M2)"): the day the review
// counts from; the plan in the Plan screen's words, the person's note quoted as the fall page quotes it, and
// `Edit plan`; a rule change not yet seen, then the rules held with their date line; the units the Log shows at each
// venue (./venue-list); then `Mark as reviewed`. Opening it writes nothing; only the button records a review. The
// first line keeps the day it named when the page opened, so after the mark the result line alone names the review's. Once the commit has replaced the button, the result line takes the focus (docs/DESIGN.md
// §6); a failed write keeps the button and the focus where they are, and the toast says so.

const BACK =
  'inline-flex min-h-target items-center self-start font-semibold text-16 text-ink underline underline-offset-4';
const SECONDARY = buttonVariants({ variant: 'secondary', className: 'self-start' });

export function ReviewScreen() {
  const t = useTranslations('plan.review');
  const plan = useSnapshot((snapshot) => snapshot.plan);
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <Link href="/plan" className={BACK}>
        {t('back')}
      </Link>
      <h1 tabIndex={-1} className="text-28">
        {t('title')}
      </h1>
      {/* Another plan (an import in another tab) opens the page anew: its own first line and the button. */}
      {plan === null ? <NoPlan /> : <ReviewBody key={plan.id} plan={plan} />}
    </div>
  );
}

function ReviewBody({ plan }: { readonly plan: Plan }) {
  const t = useTranslations('plan.review');
  const tPlan = useTranslations('plan');
  const f = useFormatters();
  const services = useServices();
  const dates = useReviewDates();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const rules = useRules();
  const profile = useProfile(rules?.code);
  const today = useToday();
  const [marked, setMarked] = useState(false);
  /** Set while the write runs: a second press does nothing, and the button keeps the focus (never disabled). */
  const busy = useRef(false);
  const line = useRef<HTMLParagraphElement>(null);
  /** The review dates as the page first had them: the first line keeps them until the page opens again. */
  const [opened, setOpened] = useState<ReviewDates | null>(dates);
  if (opened === null && dates !== null) setOpened(dates);
  const venues = useMemo(() => reviewVenues(plan, entries, today), [plan, entries, today]);

  useEffect(() => {
    if (!marked) return;
    line.current?.focus({ preventScroll: true });
    line.current?.scrollIntoView({ block: 'nearest' });
  }, [marked]);

  if (dates === null) return null;
  const summary = reviewSummary(plan, rules, profile, dates, today);
  const held = summary.rules;
  const notice = held?.ruleChange ?? null;
  const generic = held === null || held.generic;
  const since = reviewSince(opened ?? dates);
  const card = generic ? '/learn/countries' : `/learn/countries/${plan.country.toLowerCase()}`;

  const mark = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await planActions(services).recordReview();
      setMarked(true);
    } catch (error) {
      reportError(error);
      services.toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS });
    } finally {
      busy.current = false;
    }
  };

  return (
    <>
      <p className="text-16">{t('since', { kind: since.kind, date: f.date(since.on) })}</p>
      <section className="flex flex-col gap-stack-sm" aria-labelledby="review-right">
        <h2 id="review-right" className="font-semibold text-20">
          {t('right.heading')}
        </h2>
        {planReference(plan, { f, t: tPlan }).map((line) => (
          <p key={line} className="text-16">
            {line}
          </p>
        ))}
        {summary.note !== null && (
          <div className="flex flex-col gap-stack-xs">
            <h3 className="font-semibold text-16">{t('right.noteLabel')}</h3>
            <p className="text-16">{t('right.note', { date: f.date(dates.createdOn), note: summary.note })}</p>
          </div>
        )}
        <Link href="/settings" className={SECONDARY}>
          {tPlan('edit')}
        </Link>
      </section>
      <section className="flex flex-col gap-stack-sm" aria-labelledby="review-rules">
        <h2 id="review-rules" className="font-semibold text-20">
          {t('rules.heading')}
        </h2>
        {notice !== null && held !== null && (
          <p className="text-16">
            {notice.changeNotice === null
              ? t('rules.changed', {
                  country: held.country,
                  date: f.date(notice.changedOn),
                  kind: notice.country === GENERIC_COUNTRY ? 'generic' : 'country',
                })
              : t('rules.notice', { date: f.date(notice.changedOn), notice: notice.changeNotice })}
          </p>
        )}
        {held !== null && (
          <>
            {!held.generic && <p className="text-16">{t('rules.country', { country: held.country })}</p>}
            <CountryDateLine
              country={{
                reviewed: f.date(held.checkedOn),
                source: held.source,
                unreviewed: held.generic ? true : undefined,
                underReview: held.underReview,
              }}
            />
          </>
        )}
        <Link href={card} className={SECONDARY}>
          {t('rules.link', { kind: generic ? 'generic' : 'country', country: held?.country ?? '' })}
        </Link>
      </section>
      <VenueList venues={venues} today={today} />
      {!marked || dates.reviewedOn === null ? (
        <Button className="self-start" onClick={() => void mark()}>
          {t('mark')}
        </Button>
      ) : (
        <p ref={line} tabIndex={-1} className="scroll-mt-result text-16">
          {t('marked', { date: f.date(dates.reviewedOn), next: f.date(summary.nextOn) })}
        </p>
      )}
    </>
  );
}
