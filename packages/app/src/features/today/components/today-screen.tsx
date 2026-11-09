import {
  actionsNow,
  type BannerKey,
  backupNeeded,
  bannerFor,
  type CalendarDate,
  type CoinId,
  holdingContext,
  isOpen,
  isPositive,
  leadAction,
  liveEntries,
  type Plan,
  phase as phaseOf,
  portfolio,
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
  type RedDayModel,
  useClock,
  useFormatters,
  usePlatform,
  usePrices,
  useRules,
  useServices,
  useSnapshot,
  useToday,
} from '../../../lib/services';
import { WhyLink } from '../../learn';
import { todayActions } from '../actions';
import { PendingList } from './pending-list';
import { PricesLine, useOnline } from './prices-line';
import { PrimaryAction } from './primary-action';
import { RedDayBanner } from './red-day-banner';
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

type RedDayFoot = {
  readonly key: BannerKey;
  readonly lastRed: NonNullable<RedDayModel['lastRed']>;
  readonly coins: readonly CoinId[];
};

/**
 * The red-day banner of this visit (docs/DOMAIN.md §3.11; docs/DESIGN.md §8): asked once, when the visit starts
 * with units held, and recorded as it shows, so it shows on this visit only; undefined while the model is on its
 * way, null for none. A failed read is no episode, and says nothing. `dismiss` hides it, repeating the write
 * if the first failed; that one toasts on failure, as the rule-change notice does.
 */
function useRedDayFoot(plan: Plan, held: boolean) {
  const t = useTranslations('today.redDay');
  const services = useServices();
  const [asked] = useState(held);
  const [foot, setFoot] = useState<RedDayFoot | null | undefined>(asked ? undefined : null);
  const recorded = useRef(false);
  useEffect(() => {
    if (!asked) return;
    let live = true;
    const { domain, clock, redDay } = services;
    const today = clock.today();
    const settle = async () => {
      const model = await redDay
        .model({ plan, entries: domain.store.getState().snapshot.entries, today })
        .catch(() => null);
      if (!live) return;
      const banner = bannerFor({
        today,
        redDay: model?.episode ?? null,
        ruleChange: null,
        backupNeeded: false,
        dismissed: domain.store.getState().snapshot.prefs.dismissedBanners,
      });
      const lastRed = model?.lastRed ?? null;
      if (banner === null || lastRed === null) return setFoot(null);
      setFoot({ key: banner.key, lastRed, coins: model?.figure?.coins ?? [] });
      try {
        await todayActions(services).recordBanner(banner.key);
        recorded.current = true;
      } catch (error) {
        reportError(error);
      }
    };
    void settle();
    return () => {
      live = false;
    };
  }, [asked, plan, services]);
  const record = async (key: BannerKey) => {
    if (recorded.current) return;
    try {
      await todayActions(services).recordBanner(key);
      recorded.current = true;
    } catch (error) {
      reportError(error);
      services.toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS });
    }
  };
  return { foot, record, hide: () => setFoot(null) };
}

/** The foot of Today: the one banner `bannerFor` picks, else the durability line. */
function FootBanner({ plan, today }: { plan: Plan; today: CalendarDate }) {
  const t = useTranslations('today');
  const f = useFormatters();
  const clock = useClock();
  const platform = usePlatform();
  const rules = useRules();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const prefs = useSnapshot((snapshot) => snapshot.prefs);
  const held = useMemo(
    () => portfolio(plan, entries).positions.some((position) => isPositive(position.units)),
    [plan, entries],
  );
  const red = useRedDayFoot(plan, held);
  // A country with no profile of its own gets the generic rules, under another code: no notice applies to it.
  const ruleChange = rules !== null && rules.code === plan.country ? ruleChangeNotice(plan, rules) : null;
  if (red.foot === undefined) return null;
  if (red.foot !== null) {
    const { key } = red.foot;
    const dismiss = () => {
      red.hide();
      document.getElementById('today-action')?.focus({ preventScroll: true });
      void red.record(key);
    };
    return (
      <RedDayBanner
        lastRed={red.foot.lastRed}
        coins={red.foot.coins}
        onOpen={() => void red.record(key)}
        onDismiss={dismiss}
      />
    );
  }
  // The red day settled for this visit: once shown or passed over, it never comes back before the next visit.
  const banner = bannerFor({
    today,
    redDay: null,
    ruleChange,
    backupNeeded: backupNeeded(entries, prefs, false),
    dismissed: prefs.dismissedBanners,
  });
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
  const last = prefs.lastBackupAt;
  return (
    <p role="status" className="rounded-lg border border-line p-inset text-14 text-ink-2">
      {last === null
        ? t.rich('banner.never', { link: link('/settings') })
        : t.rich('banner.last', { link: link('/settings'), date: f.instantDate(last, clock.timeZone) })}
    </p>
  );
}
