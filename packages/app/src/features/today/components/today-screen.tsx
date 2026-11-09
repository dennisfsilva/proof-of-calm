import {
  actionsNow,
  type CalendarDate,
  holdingContext,
  isOpen,
  leadAction,
  type Plan,
  phase as phaseOf,
  portfolio,
  type StripSegment,
  strip,
} from '@proofofcalm/core';
import { ProgressStrip } from '@proofofcalm/ui/charts/progress-strip';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@proofofcalm/ui/components/empty';
import { Component, lazy, type ReactNode, Suspense, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useFormatters, usePrices, useRules, useSnapshot, useToday } from '../../../lib/services';
import { WhyLink } from '../../learn';
import { PendingList } from './pending-list';
import { PricesLine, useOnline } from './prices-line';
import { PrimaryAction } from './primary-action';

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
      <FootBanner plan={plan} today={today} />
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

// The foot loads on demand (./foot); a foot that cannot load, or cannot render, leaves the screen above it whole.
const Foot = lazy(async () => ({ default: (await import('./foot')).Foot }));

type FootBoundaryState = { readonly failed: boolean };

/** The foot's banners are optional reading: one that fails stops here and says nothing about its own absence. */
class FootBoundary extends Component<{ readonly children: ReactNode }, FootBoundaryState> {
  override state: FootBoundaryState = { failed: false };

  static getDerivedStateFromError(): FootBoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function FootBanner({ plan, today }: { plan: Plan; today: CalendarDate }) {
  return (
    <FootBoundary>
      <Suspense fallback={null}>
        <Foot plan={plan} today={today} />
      </Suspense>
    </FootBoundary>
  );
}
