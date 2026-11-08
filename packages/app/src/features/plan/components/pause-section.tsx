import { type CalendarDate, type Plan, pauseOn } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { type ErrorMessage, errorMessage } from '../../../lib/errors';
import { useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import { planActions } from '../actions';

// Pause and Resume on the Plan screen (docs/DOMAIN.md §6 "Pause", "Resume"; CONTENT-STYLE §3 "Pause"), while
// buying lasts: unpaused, what a pause does and "Pause from today", an open pause; paused, the day it began in
// a polite live region and "Resume". Pause from today and Resume are one button whose words and action follow
// the plan's state: React keeps its node through every swap, from a press here or another tab's write, so the
// focus stays on it with nothing to move. This replaces the keyed swap of pull request 220, chosen so that a
// fresh button took the focus and was announced: that remount dropped the focus to the page's body when another
// tab's write swapped the button under it. Now the focused button's name changes to the new words, which screen
// readers read for the focused control, and the status line announces a pause. A refusal shows under the button
// until the plan is paused or resumed. An overlap gets the section's own line: lib/errors' "Choose other dates"
// names fields this section does not have.

const OVERLAP: ErrorMessage = { key: 'plan.pause.overlap', values: {} };

export function PauseSection() {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const today = useToday();
  if (plan === null || today > plan.lastBuy || plan.endedBuyingOn !== null) return null;
  return <PauseControls plan={plan} today={today} />;
}

function PauseControls({ plan, today }: { readonly plan: Plan; readonly today: CalendarDate }) {
  const t = useTranslations('plan.pause');
  const words = useTranslations();
  const f = useFormatters();
  const services = useServices();
  const [actions] = useState(() => planActions(services));
  const [pending, setPending] = useState(false);
  // A refusal holds the state it was refused under: once the plan is paused or resumed (another tab), it ends.
  const [problem, setProblem] = useState<{ message: ErrorMessage; paused: boolean } | null>(null);
  const current = pauseOn(plan, today);
  const paused = current !== null;
  if (problem !== null && problem.paused !== paused) setProblem(null);

  const press = async () => {
    setPending(true);
    setProblem(null);
    const under = paused;
    try {
      const result = under ? await actions.resume() : await actions.pause();
      if (!result.ok) {
        const message = result.error.code === 'pauses-overlap' ? OVERLAP : errorMessage(result.error);
        setProblem({ message, paused: under });
      }
    } catch (error) {
      setProblem({ message: errorMessage(error), paused: under });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="plan-pause" className="flex flex-col gap-stack-sm">
      <h2 id="plan-pause" className="font-semibold text-20">
        {t('heading')}
      </h2>
      {/* A block, not a flex item: the live region stays mounted while empty and adds no gap. */}
      <div>
        {!paused && <p className="text-16 text-ink-2">{t('body')}</p>}
        <p role="status" aria-live="polite" className="nums text-16 text-ink">
          {current === null ? '' : t('since', { date: f.date(current.from) })}
        </p>
      </div>
      <Button
        variant="secondary"
        className="self-start"
        disabled={pending}
        focusableWhenDisabled
        onClick={() => void press()}
      >
        {paused ? t('resume') : t('pause')}
      </Button>
      {problem !== null && problem.paused === paused && (
        <p role="alert" className="text-13 text-negative">
          {words(problem.message.key as Parameters<typeof words>[0], problem.message.values)}
        </p>
      )}
    </section>
  );
}
