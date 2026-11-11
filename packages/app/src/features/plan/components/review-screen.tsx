import { GENERIC_COUNTRY } from '@proofofcalm/content';
import { type Plan, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { Link } from '../../../lib/navigation';
import { useFormatters, useReviewDates, useRules, useServices, useSnapshot, useToday } from '../../../lib/services';
import { CountryDateLine } from '../../learn';
import { NoPlan } from '../../today';
import { planActions } from '../actions';
import { reviewSummary } from '../lib/review';

// The annual review page (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page (M2)"): the day the review
// counts from, the person's note with the ways to the plan and its settings, the rules held with their date
// line and a rule change not yet seen, then `Mark as reviewed`. Opening it writes nothing; only the button
// records a review. Once the commit has replaced the button, the result line takes the focus (docs/DESIGN.md
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
      {plan === null ? <NoPlan /> : <ReviewBody plan={plan} />}
    </div>
  );
}

function ReviewBody({ plan }: { readonly plan: Plan }) {
  const t = useTranslations('plan.review');
  const tNotice = useTranslations('today.ruleChange');
  const f = useFormatters();
  const services = useServices();
  const dates = useReviewDates();
  const rules = useRules();
  const today = useToday();
  const [marked, setMarked] = useState(false);
  /** Set while the write runs: a second press does nothing, and the button keeps the focus (never disabled). */
  const busy = useRef(false);
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!marked) return;
    line.current?.focus({ preventScroll: true });
    line.current?.scrollIntoView({ block: 'nearest' });
  }, [marked]);

  if (dates === null) return null;
  const summary = reviewSummary(plan, rules, dates, today);
  const held = summary.rules;
  const notice = held?.ruleChange ?? null;
  const generic = held === null || held.generic;
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
      <p className="text-16">{t('since', { kind: summary.since.kind, date: f.date(summary.since.on) })}</p>
      <section className="flex flex-col gap-stack-sm" aria-labelledby="review-right">
        <h2 id="review-right" className="font-semibold text-20">
          {t('right.heading')}
        </h2>
        {summary.note !== null && <p className="text-16 text-ink-2">{t('right.note', { note: summary.note })}</p>}
        <Link href="/plan" className={SECONDARY}>
          {t('right.see')}
        </Link>
        <Link href="/settings" className={SECONDARY}>
          {t('right.change')}
        </Link>
      </section>
      <section className="flex flex-col gap-stack-sm" aria-labelledby="review-rules">
        <h2 id="review-rules" className="font-semibold text-20">
          {t('rules.heading')}
        </h2>
        {held !== null && (
          <>
            <p className="text-16">{t('rules.country', { country: held.country })}</p>
            <CountryDateLine
              country={{
                reviewed: f.date(held.checkedOn),
                source: null,
                unreviewed: held.generic ? true : undefined,
                underReview: held.underReview,
              }}
            />
          </>
        )}
        {notice !== null && held !== null && (
          <p className="text-16">
            {notice.changeNotice === null
              ? tNotice('generic', {
                  country: held.country,
                  date: f.date(notice.changedOn),
                  kind: notice.country === GENERIC_COUNTRY ? 'generic' : 'country',
                })
              : tNotice('notice', { date: f.date(notice.changedOn), notice: notice.changeNotice })}
          </p>
        )}
        <Link href={card} className={SECONDARY}>
          {t('rules.link', { kind: generic ? 'generic' : 'country', country: held?.country ?? '' })}
        </Link>
      </section>
      {!marked || dates.reviewedOn === null ? (
        <Button className="self-start" onClick={() => void mark()}>
          {t('mark')}
        </Button>
      ) : (
        <p ref={line} tabIndex={-1} className="text-16">
          {t('marked', { date: f.date(dates.reviewedOn), next: f.date(summary.nextOn) })}
        </p>
      )}
    </>
  );
}
