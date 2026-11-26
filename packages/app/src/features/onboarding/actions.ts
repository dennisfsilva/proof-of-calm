// The onboarding's one writer (docs/ARCHITECTURE.md "Inside packages/app"): the plan is already valid
// (startPlan), so the action only refuses a second plan or a kept currency it was not asked about, writes,
// counts and moves on to Today. `reacknowledge` is the one other write: the re-ask of the disclosure
// (docs/DOMAIN.md §2.1).
import {
  acknowledge,
  acknowledgementDue,
  type CurrencyCode,
  type KeptCurrencyQuestion,
  type Plan,
} from '@proofofcalm/core';
import { useRef, useState } from 'react';
import { riskWordingLanguage } from '../../lib/brand';
import { useRouter } from '../../lib/navigation';
import type { Snapshot } from '../../lib/ports';
import { type Services, useServices } from '../../lib/services';
import { keptQuestion } from '../../lib/store';

/**
 * Records the acknowledgement of `version` on the plan as stored, in the store's turn. It writes nothing
 * when no plan is due, so a second tap or another tab's acknowledgement changes nothing. A failed write
 * throws.
 */
export async function reacknowledge(
  { domain, clock, language }: Pick<Services, 'domain' | 'clock' | 'language'>,
  version: number,
): Promise<void> {
  await domain.write(({ plan }) =>
    plan !== null && acknowledgementDue(plan, version)
      ? { plan: acknowledge(plan, version, riskWordingLanguage(language), clock.now()) }
      : {},
  );
}

/** What Start was tapped under: the plan's country currency, and the kept-currency question the screen showed. */
export type Asked = { readonly next: CurrencyCode; readonly shown: KeptCurrencyQuestion | null };
export type CreateOutcome = 'created' | 'stored' | 'changed';

export type OnboardingActions = {
  /** True from the first tap until the write fails or finds a plan stored; Start is disabled meanwhile. */
  readonly pending: boolean;
  /**
   * Writes the plan once. The checks run in the write's turn on the rows as stored: a plan or a newer build's
   * plan row another tab wrote meanwhile is kept and the call gives `stored`; a kept currency the screen did not
   * show (ADR-0053) writes nothing and gives `changed`. A call while one is pending writes nothing and gives
   * that call's outcome. A failed write throws.
   */
  createPlan(plan: Plan, asked: Asked): Promise<CreateOutcome>;
};

/** The outcome the write's turn finds; an answer the stored rows no longer need still stands (ADR-0053). */
function turnOutcome(snapshot: Snapshot, { next, shown }: Asked): CreateOutcome {
  if (snapshot.plan !== null || snapshot.newer.plans > 0) return 'stored';
  const question = keptQuestion(snapshot, next);
  return question !== null && (shown === null || question.kept !== shown.kept) ? 'changed' : 'created';
}

export function useOnboardingActions(): OnboardingActions {
  const { domain, analytics } = useServices();
  const router = useRouter();
  // A ref, not the state: two taps in one event loop turn both see the same render.
  const writing = useRef<Promise<CreateOutcome> | null>(null);
  const [pending, setPending] = useState(false);
  const settle = () => {
    writing.current = null;
    setPending(false);
  };
  const write = async (plan: Plan, asked: Asked): Promise<CreateOutcome> => {
    let outcome: CreateOutcome = 'created';
    try {
      await domain.write((snapshot) => {
        outcome = turnOutcome(snapshot, asked);
        return outcome === 'created' ? { plan } : {};
      });
    } catch (error) {
      settle();
      throw error;
    }
    if (outcome !== 'created') {
      settle();
      return outcome;
    }
    analytics.count('plan_created');
    router.push('/today');
    return 'created';
  };
  return {
    pending,
    createPlan(plan, asked) {
      if (writing.current !== null) return writing.current;
      setPending(true);
      writing.current = write(plan, asked);
      return writing.current;
    },
  };
}
