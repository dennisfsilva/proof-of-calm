import {
  actionsNow,
  backupNeeded,
  bannerFor,
  type CalendarDate,
  holdingContext,
  isOpen,
  isPositive,
  leadAction,
  liveEntries,
  type PhaseKind,
  type Plan,
  phase as phaseOf,
  portfolio,
  type RedDayEpisode,
  reviewAsked,
  ruleChangeNotice,
  type StripSegment,
  strip,
  UNDO_WINDOW_MS,
} from '@proofofcalm/core';
import { ProgressStrip } from '@proofofcalm/ui/charts/progress-strip';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@proofofcalm/ui/components/empty';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { Link } from '../../../lib/navigation';
import {
  reviewSince,
  useClock,
  useFormatters,
  usePlatform,
  usePrices,
  useReviewDates,
  useRules,
  useServices,
  useSnapshot,
  useToday,
} from '../../../lib/services';
import { WhyLink } from '../../learn';
import { todayActions } from '../actions';
import { AnnualReviewBanner } from './annual-review-banner';
import { PendingList } from './pending-list';
import { PricesLine, useOnline } from './prices-line';
import { PrimaryAction } from './primary-action';
import { RedDayFoot } from './red-day-foot';
import { RuleChangeBanner } from './rule-change-banner';

// Today (docs/DOMAIN.md §3.3 to §3.5, §3.10, §3.11; docs/DESIGN.md §7): the primary action first, the
// quiet pending list, the portfolio number, the strip with its today marker (the way to Plan) and at
// most one banner (the red-day banner, a rule-change notice, or the backup banner), or in its place the durability line.
// Everything but the prices is in the snapshot when the shell shows the screen; the prices line keeps its
// height before the first fetch, so the value arriving moves nothing below it.

const SCREEN = 'mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg';
const link = (href: string) => (chunks: ReactNode) => (
  <Link href={href} className="text-ink underline underline-offset-4">
    {chunks}
  </Link>
);

/** No plan yet: one sentence with its two ways in, the same on Today, Plan and Portfolio. */
export function NoPlan({ onImport }: { readonly onImport?: (() => void) | undefined }) {
  const t = useTranslations('today');
  // On Settings, which /settings already shows, importing is an action on the screen: the host passes it.
  const action = (chunks: ReactNode) => (
    <button type="button" onClick={onImport} className="cursor-pointer text-ink underline underline-offset-4">
      {chunks}
    </button>
  );
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>
          {t.rich('empty.noPlan', { setup: link('/onboarding'), import: onImport ? action : link('/settings') })}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function TodayScreen() {
  const t = useTranslations('today');
  const plan = useSnapshot((snapshot) => snapshot.plan);
  return (
    <div className={SCREEN}>
      <h1 className="scroll-mt-result text-28">{t('title')}</h1>
      {plan === null ? <NoPlan /> : <TodayBody plan={plan} />}
    </div>
  );
}

function TodayBody({ plan }: { plan: Plan }) {
  const today = useToday();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const { action, handled, pending, phase } = useMemo(() => {
    const actions = actionsNow(plan, entries, today);
    const phase = phaseOf(plan, today);
    // After the buying phase the phase leads and months left open stay in the pending list (§3.3).
    const action = leadAction(actions, phase);
    return {
      action,
      handled: actions.find((candidate) => candidate.slot !== null && !isOpen(candidate.status)) ?? null,
      pending: actions.filter((candidate) => candidate !== action && isOpen(candidate.status)),
      phase,
    };
  }, [plan, entries, today]);
  return (
    <>
      <PrimaryAction action={action} handled={handled} phase={phase} />
      <PendingList actions={pending} />
      <PortfolioNumber plan={plan} />
      <PlanStrip plan={plan} today={today} />
      <FootBanner plan={plan} today={today} phase={phase.kind} />
    </>
  );
}

function PortfolioNumber({ plan }: { plan: Plan }) {
  const t = useTranslations('today');
  const f = useFormatters();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const { state: prices, failure } = usePrices();
  const online = useOnline();
  const rules = useRules();
  // The profile's lot scope and rule decide which sales take units with no recorded cost (DOMAIN §3.6).
  const value = useMemo(
    () => portfolio(plan, entries, prices?.snapshot ?? null, holdingContext(plan, rules)),
    [plan, entries, prices, rules],
  );
  const priced = value.value !== null && prices !== null;
  return (
    <dl className="flex flex-col">
      <dt className="text-13 text-ink-2">{t(priced ? 'portfolio.value' : 'portfolio.invested')}</dt>
      <dd className="nums font-semibold text-40">{f.money(value.value ?? value.invested, plan.payCurrency)}</dd>
      {/* One line always, empty until priced: the reserved height (no layout shift). */}
      <dd className="min-h-[1lh] text-13 text-ink-2">
        {priced && <PricesLine prices={prices} online={online} failure={failure} />}
      </dd>
    </dl>
  );
}

function PlanStrip({ plan, today }: { plan: Plan; today: CalendarDate }) {
  const t = useTranslations('today');
  const f = useFormatters();
  const geometry = useMemo(() => strip(plan, today), [plan, today]);
  const { sellWindow: w } = plan;
  const bounds: Record<StripSegment['kind'], readonly [CalendarDate, CalendarDate | null]> = {
    buy: [plan.firstBuy, plan.lastBuy],
    hold: [plan.lastBuy, w?.opens ?? null],
    sell: [w?.opens ?? plan.lastBuy, w?.closes ?? null],
    exit: [w?.closes ?? plan.lastBuy, w?.exitBy ?? null],
  };
  const rows = geometry.segments.map(({ kind }) => {
    const [from, to] = bounds[kind];
    return { kind, label: t(`strip.${kind}`), from: f.date(from), to: to === null ? '' : f.date(to) };
  });
  return (
    <section className="flex flex-col gap-stack-sm">
      <div className="flex flex-wrap items-center gap-target-gap">
        <Link
          href="/plan"
          className="inline-flex min-h-target items-center font-semibold text-16 text-ink underline underline-offset-4"
        >
          {t('strip.link')}
        </Link>
        {w !== null && (
          <WhyLink standalone module="cycles" section="the-window-is-a-discipline-device" name={t('why.window')} />
        )}
      </div>
      <ProgressStrip
        strip={geometry}
        label={t('strip.label', {
          start: f.date(geometry.start),
          end: f.date(geometry.end),
          // Without a sell window the hold has no end; the strip's end is only where it stops drawing.
          open: w === null ? 'yes' : 'no',
          today: f.date(today),
        })}
        phases={rows.map(({ kind, label, from, to }) => ({
          kind,
          label,
          range: to === '' ? t('strip.from', { from }) : t('strip.range', { from, to }),
        }))}
        table={{
          summary: t('strip.table'),
          columns: [t('strip.phase'), t('strip.start'), t('strip.end')],
          rows: rows.map(({ label, from, to }) => [label, from, to]),
        }}
      />
    </section>
  );
}

/**
 * The foot of Today (docs/DOMAIN.md §3.11; docs/DESIGN.md §8): it settles once per visit. A visit that starts with
 * units held waits for the red-day model, then shows its banner or the next box; otherwise the next box at once.
 */
function FootBanner({ plan, today, phase }: { plan: Plan; today: CalendarDate; phase: PhaseKind }) {
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const [held] = useState(() => portfolio(plan, entries).positions.some((position) => isPositive(position.units)));
  const next = (redDay: RedDayEpisode | null) => (
    <NextBanner plan={plan} today={today} phase={phase} held={held} redDay={redDay} />
  );
  return held ? <RedDayFoot plan={plan} next={next} /> : next(null);
}

type NextBannerProps = {
  readonly plan: Plan;
  readonly today: CalendarDate;
  readonly phase: PhaseKind;
  /** Units were held when the visit started. */
  readonly held: boolean;
  /** The red-day episode under way: it holds the annual review back, and its banner never shows here. */
  readonly redDay: RedDayEpisode | null;
};

/** The foot's box after the red day: the one banner `bannerFor` picks, each rendered by its kind, else the durability line. */
function NextBanner({ plan, today, phase, held, redDay }: NextBannerProps) {
  const t = useTranslations('today');
  const f = useFormatters();
  const services = useServices();
  const clock = useClock();
  const platform = usePlatform();
  const rules = useRules();
  const dates = useReviewDates();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const prefs = useSnapshot((snapshot) => snapshot.prefs);
  // A country with no profile of its own gets the generic rules, under another code: no notice applies to it.
  const ruleChange = rules !== null && rules.code === plan.country ? ruleChangeNotice(plan, rules) : null;
  const banner = bannerFor({
    today,
    redDay: null,
    ruleChange,
    annualReview: dates !== null && reviewAsked(dates, today, { phase, held, redDay }),
    backupNeeded: backupNeeded(entries, prefs, false),
    dismissed: prefs.dismissedBanners,
  });
  const later = useRef(false);
  const kind = banner?.kind ?? null;
  // Later's button goes with the review, so once the commit has removed it the card's heading takes the focus and
  // comes into view by the least scroll, as after the red day's Dismiss (docs/DESIGN.md §6).
  useEffect(() => {
    if (!later.current || kind === 'annual-review') return;
    later.current = false;
    const heading = document.getElementById('today-action');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'nearest' });
  }, [kind]);
  // Without a banner, the durability line once live entries exist, counted as the banner counts them (ADR-0004):
  // quiet, no dismiss. The backup banner says the same and names the export, so one thing at most stands here.
  // The installed app asks only for the export.
  if (banner === null) {
    const line = platform.installed() ? t('durabilityInstalled') : t('durability');
    return liveEntries(entries).length > 0 ? <p className="text-14 text-ink-2">{line}</p> : null;
  }
  if (banner.kind === 'rule-change' && ruleChange !== null) {
    return <RuleChangeBanner notice={ruleChange} country={rules?.name ?? ruleChange.country} />;
  }
  if (banner.kind === 'annual-review' && dates !== null) {
    const key = banner.key;
    const onLater = async () => {
      later.current = true;
      try {
        await todayActions(services).recordBanner(key);
      } catch (error) {
        later.current = false;
        reportError(error);
        services.toasts.add({ title: t('review.failed'), timeout: UNDO_WINDOW_MS });
      }
    };
    return <AnnualReviewBanner since={reviewSince(dates)} onLater={() => void onLater()} />;
  }
  if (banner.kind !== 'backup-needed') return null;
  const last = prefs.lastBackupAt;
  return (
    <p role="status" className="rounded-lg border border-line p-inset text-14 text-ink-2">
      {last === null
        ? t.rich('banner.never', { link: link('/settings') })
        : t.rich('banner.last', { link: link('/settings'), date: f.instantDate(last, clock.timeZone) })}
    </p>
  );
}
