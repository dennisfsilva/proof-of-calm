import {
  type Action,
  assertNever,
  type CurrencyCode,
  daysBetween,
  decimal,
  type Entry,
  isOpen,
  type MonthKey,
  type Phase,
  type Plan,
  type PlannedPart,
  plannedParts,
  recordedAmounts,
  slotStatuses,
  sum,
  UNDO_WINDOW_MS,
} from '@proofofcalm/core';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { CoinChip } from '@proofofcalm/ui/components/coin-chip';
import { coinColour } from '@proofofcalm/ui/lib/series';
import { lazy, type RefObject, Suspense, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { errorMessage } from '../../../lib/errors';
import { createNumberInput } from '../../../lib/format';
import { loadNamespace } from '../../../lib/i18n';
import { Link } from '../../../lib/navigation';
import { useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import { WhyLink } from '../../learn';
import { type Shown, todayActions } from '../actions';

// Today's hero (docs/DOMAIN.md §3.3, §3.5; docs/DESIGN.md §7): the one action that still asks for a buy,
// with one coin chip per planned part; otherwise the pause while it lasts; otherwise, past buying, where
// the plan is, one copy per phase kind; otherwise the handled current month (recorded, skipped, or paused
// by a pause that has ended) with the next buy day; otherwise the next buy day, never a past one, or that
// no buy day is left. A due or late action gets "Bought as planned" and "Bought a different amount", and a
// monthly one "Skip <month>" (CONTENT-STYLE §3, "Buy day, the one tap"); the pause, "Resume"; anything else
// to record, the "Record a purchase" link.

/** The Log's entry sheet with its messages, loaded on first use: never part of Today's script budget. */
const EntrySheet = lazy(async () => {
  const [log] = await Promise.all([import('../../log'), loadNamespace('log')]);
  return { default: log.EntrySheet };
});
/** The Log's skip sheet, loaded the same way. */
const SkipSheet = lazy(async () => {
  const [log] = await Promise.all([import('../../log'), loadNamespace('log')]);
  return { default: log.SkipSheet };
});

export type PrimaryActionProps = {
  readonly action: Action | null;
  readonly handled: Action | null;
  readonly phase: Phase;
};

type Text = {
  readonly heading: string;
  readonly body: string | null;
  /** The hold phase's "Why?": on the body's line, or on a line of its own when there is no body. */
  readonly why?: true;
};

/** A handled month reads the same whatever handled it: its status, then the next buy day (CONTENT-STYLE §3). */
const HANDLED = {
  done: 'action.done',
  skipped: 'action.skipped',
  paused: 'action.pausedMonth',
} as const;

export function PrimaryAction({ action, handled, phase }: PrimaryActionProps) {
  const t = useTranslations('today');
  const f = useFormatters();
  const today = useToday();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const heading = useRef<HTMLHeadingElement>(null);
  const oneTap = useOneTap(heading);
  if (plan === null) return null;
  const month = (slot: MonthKey | null) => (slot === null ? '' : f.month(slot));
  // A count in copy is the figure of the plan's number locale (docs/CONTENT-STYLE.md §4).
  const figure = (value: number) => createNumberInput(f.locales.numbers).format(decimal(String(value)));
  const ago = (due: Action['due']) => {
    const days = daysBetween(due, today);
    return { date: f.date(due), days, figure: figure(days) };
  };
  const statuses = slotStatuses(plan, entries, today);
  // The handled current month; before the first buy day, the first slot ahead when nothing asks for a buy.
  const ahead = statuses.find((slot) => slot.due >= today);
  const next = statuses.find((slot) => isOpen(slot.status) && slot.due > today);
  const { kind } = phase;
  const buying = kind === 'before' || kind === 'buy';
  const shown = handled ?? (ahead === undefined ? null : { slot: ahead.key, status: ahead.status });
  const settled =
    shown !== null && (shown.status === 'done' || shown.status === 'skipped' || shown.status === 'paused')
      ? { slot: shown.slot, status: shown.status }
      : null;

  const text = (): Text => {
    if (action !== null) {
      if (action.kind === 'lump') {
        const body = action.status === 'late' ? t('action.startingLate', ago(action.due)) : null;
        return { heading: t('action.starting', { date: f.date(action.due) }), body };
      }
      if (action.status === 'late') {
        return {
          heading: t('action.late', { month: month(action.slot) }),
          body: t('action.lateBody', ago(action.due)),
        };
      }
      if (action.status === 'due') return { heading: t('action.due', { month: month(action.slot) }), body: null };
      return { heading: t('action.upcoming', { date: f.date(action.due) }), body: null };
    }
    if (phase.pause !== null) {
      const { from, until } = phase.pause;
      return {
        heading:
          until === null ? t('action.pausedOpen', { date: f.date(from) }) : t('action.paused', { date: f.date(until) }),
        body: null,
      };
    }
    if (!buying) return phaseText(plan, kind);
    if (settled !== null) {
      return {
        heading: t(HANDLED[settled.status], { month: month(settled.slot) }),
        body: next === undefined ? null : t('action.next', { date: f.date(next.due) }),
      };
    }
    if (next !== undefined) return { heading: t('action.upcoming', { date: f.date(next.due) }), body: null };
    // No slot ahead: a plan with only a starting amount, or buying ended before the month's buy day.
    const opens = plan.sellWindow?.opens;
    return {
      heading: t('action.noneLeft'),
      body: opens === undefined ? null : t('phase.holdBody', { date: f.date(opens) }),
    };
  };

  const phaseText = ({ sellWindow: w }: Plan, past: Exclude<Phase['kind'], 'before' | 'buy'>): Text => {
    switch (past) {
      case 'hold':
        return {
          heading: t('phase.hold'),
          body: w === null ? null : t('phase.holdBody', { date: f.date(w.opens) }),
          why: true,
        };
      case 'sell':
        return { heading: t('phase.sell'), body: w === null ? null : t('phase.sellBody', { date: f.date(w.closes) }) };
      case 'exit':
        return { heading: t('phase.exit'), body: w === null ? null : t('phase.exitBody', { date: f.date(w.exitBy) }) };
      case 'done':
        if (w === null) return { heading: t('phase.hold'), body: null, why: true };
        return { heading: t('phase.done', { date: f.date(w.exitBy) }), body: null };
      default:
        return assertNever(past);
    }
  };

  const { heading: title, body, why = false } = text();
  // The parts the chips show are the ones the tap records, or it records nothing (§6 "One-tap").
  const parts = action === null ? null : plannedParts(plan, action.plannedAmount);
  const tappable = action !== null && (action.status === 'due' || action.status === 'late');
  const skippable = tappable ? action.slot : null;
  const recordable = action !== null || (buying && phase.pause === null && settled !== null);
  // While the pause lasts and nothing asks for a buy: Resume, never a link (CONTENT-STYLE §3, "Today, the month handled").
  const resumable = action === null && phase.pause !== null;
  return (
    <section aria-labelledby="today-action" className="flex flex-col gap-stack-sm">
      <h2
        ref={heading}
        id="today-action"
        tabIndex={-1}
        className="scroll-mt-result font-semibold text-20 tracking-heading"
      >
        {title}
      </h2>
      {(body !== null || why) && (
        <p className="text-16 text-ink-2">
          {body}
          {why && (
            <>
              {body !== null && ' '}
              <WhyLink
                module="start-here"
                section="why-some-people-hold"
                name={t('why.hold')}
                standalone={body === null}
              />
            </>
          )}
        </p>
      )}
      {parts !== null && <Chips plan={plan} parts={parts} label={t('action.parts')} />}
      {tappable ? (
        <div className="flex flex-wrap gap-target-gap">
          <Button onClick={() => void oneTap.tap(action, { parts: parts ?? [], currency: plan.payCurrency })}>
            {t('action.asPlanned')}
          </Button>
          <Button variant="secondary" onClick={() => oneTap.open(planned(action))}>
            {t('action.different')}
          </Button>
          {skippable !== null && (
            <Button variant="secondary" onClick={() => oneTap.skip(skippable)}>
              {t('action.skip', { month: month(skippable) })}
            </Button>
          )}
        </div>
      ) : resumable ? (
        <div className="flex flex-wrap gap-target-gap">
          <Button
            variant="secondary"
            disabled={oneTap.resuming}
            focusableWhenDisabled
            onClick={() => void oneTap.resume()}
          >
            {t('action.resume')}
          </Button>
        </div>
      ) : (
        recordable && (
          <div className="flex flex-wrap gap-target-gap">
            <Link href="/log" className={buttonVariants({ variant: 'secondary' })}>
              {t('action.record')}
            </Link>
          </div>
        )
      )}
      {oneTap.sheet}
    </section>
  );
}

type Target = { readonly kind: Action['kind']; readonly editing: readonly Entry[]; readonly slot?: MonthKey };
const planned = (action: Action): Target => ({
  kind: action.kind,
  editing: [],
  ...(action.slot !== null && { slot: action.slot }),
});

/**
 * "Bought as planned" (docs/DOMAIN.md §3.4, §6): the tap records the planned entries and says so for 8 s with
 * Edit; a coin with no price opens the form with the planned amounts instead, and a plan at the entry cap
 * says so in a toast. The sheet stays mounted once
 * loaded, so it closes with its content; it gives the focus back to its opener, or to the heading once the
 * opener is gone (the month is recorded, the toast closed).
 */
function useOneTap(heading: RefObject<HTMLHeadingElement | null>) {
  const t = useTranslations();
  const services = useServices();
  const format = useFormatters();
  const [actions] = useState(() => todayActions(services));
  const [target, setTarget] = useState<Target | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [skipping, setSkipping] = useState<{ readonly slot: MonthKey; readonly open: boolean } | null>(null);
  const opener = useRef<Element | null>(null);
  const say = (error: unknown) => {
    const message = errorMessage(error);
    services.toasts.add({ title: t(message.key as Parameters<typeof t>[0], message.values), timeout: UNDO_WINDOW_MS });
  };
  const open = (next: Target) => {
    opener.current = document.activeElement;
    setTarget(next);
    setSheetOpen(true);
  };
  const skip = (slot: MonthKey) => {
    opener.current = document.activeElement;
    setSkipping({ slot, open: true });
  };
  const recorded = (saved: readonly Entry[], currency: CurrencyCode) => {
    const [first] = saved;
    if (first === undefined) return;
    const kind = first.kind === 'lump' ? 'lump' : 'dca';
    services.toasts.add({
      title: <Recorded entries={saved} currency={currency} />,
      timeout: UNDO_WINDOW_MS,
      actionProps: { children: t('today.action.edit'), onClick: () => open({ kind, editing: saved }) },
    });
  };
  const tap = async (action: Action, shown: Shown) => {
    try {
      const result = await actions.boughtAsPlanned(action, shown);
      if (!result.ok && result.error.code === 'too-many-entries') {
        // The tap would take the plan past the cap, so no form opens (a smaller buy can still be saved on the Log):
        // the toast names the cap, grouped as the locale groups it.
        const max = createNumberInput(format.locales.numbers).format(decimal(String(result.error.max)));
        say({ ...result.error, max });
        heading.current?.focus();
        return;
      }
      if (!result.ok && result.error.code === 'plan-changed') {
        // The card re-renders with the plan as stored; the person checks it before tapping again.
        say(result.error);
        heading.current?.focus();
        return;
      }
      if (!result.ok) {
        open(planned(action));
        return;
      }
      if (result.value.length === 0) return;
      // The toast's words are the Log's: its namespace is in the provider before the toast shows.
      await loadNamespace('log');
      heading.current?.focus();
      recorded(result.value, shown.currency);
    } catch (error) {
      say(error);
    }
  };
  const done = (saved: readonly Entry[]) => {
    setSheetOpen(false);
    const currency = services.domain.store.getState().snapshot.plan?.payCurrency;
    if (target === null || currency === undefined) return;
    if (target.editing.length === 0) recorded(saved, currency);
    else if (saved.length > 0) services.toasts.add({ title: t('log.form.saved'), timeout: UNDO_WINDOW_MS });
  };
  const [resuming, setResuming] = useState(false);
  /** Resume (docs/DOMAIN.md §6): the button goes with the pause, so the heading takes the focus; a refusal is a toast. */
  const resume = async () => {
    setResuming(true);
    try {
      const result = await actions.resume();
      if (!result.ok) say(result.error);
    } catch (error) {
      say(error);
    } finally {
      setResuming(false);
      heading.current?.focus();
    }
  };
  const finalFocus = () => (opener.current?.isConnected === true ? true : (heading.current ?? true));
  const undone = () => heading.current?.focus();
  const sheet = (
    <Suspense fallback={null}>
      {target !== null && (
        <EntrySheet
          {...target}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onDone={done}
          finalFocus={finalFocus}
          onUndone={undone}
        />
      )}
      {skipping !== null && (
        <SkipSheet
          slot={skipping.slot}
          open={skipping.open}
          onOpenChange={(next) => setSkipping({ slot: skipping.slot, open: next })}
          finalFocus={finalFocus}
          onUndone={undone}
        />
      )}
    </Suspense>
  );
  return { tap, open, skip, resume, resuming, sheet };
}

/** "Recorded: 100,00 € on 20 Oct 2026.", in the Log's words; rendered by the toast, under the provider. */
function Recorded({ entries, currency }: { readonly entries: readonly Entry[]; readonly currency: CurrencyCode }) {
  const t = useTranslations('log');
  const f = useFormatters();
  const [first] = entries as readonly [Entry, ...Entry[]];
  const amount = f.money(sum(recordedAmounts(entries)), currency);
  const date = f.date(first.date);
  return entries.every((entry) => entry.coin === first.coin)
    ? t('recorded.one', { amount, coin: first.coin, date })
    : t('recorded.several', { amount, date });
}

function Chips({ plan, parts, label }: { plan: Plan; parts: readonly PlannedPart[]; label: string }) {
  const f = useFormatters();
  return (
    <ul aria-label={label} className="flex flex-wrap gap-stack-xs">
      {coloured(parts).map(({ part, colour }) => (
        <li key={part.coin}>
          <CoinChip coin={part.coin} colour={colour} amount={f.money(part.amount, plan.payCurrency)} />
        </li>
      ))}
    </ul>
  );
}

/** In the plan's coin order, as Portfolio's bar: a coin without a fixed colour takes the next extended one. */
function coloured<T extends { readonly coin: string }>(parts: readonly T[]) {
  const result: { part: T; colour: ReturnType<typeof coinColour> }[] = [];
  let extended = 0;
  for (const part of parts) {
    result.push({ part, colour: coinColour(part.coin, extended) });
    if (coinColour(part.coin, -1) === 'other') extended += 1;
  }
  return result;
}
