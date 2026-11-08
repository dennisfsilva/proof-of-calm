// The onboarding's one writer (docs/ARCHITECTURE.md "Inside packages/app"): the plan is already valid
// (startPlan), so the action only refuses a second plan, writes, counts and moves on to Today.
// `reacknowledge` is the one other write: the re-ask of the disclosure (docs/DOMAIN.md §2.1).
import { acknowledge, acknowledgementDue, type Plan } from '@proofofcalm/core';
import { useRef, useState } from 'react';
import { useRouter } from '../../lib/navigation';
import { type Services, useServices } from '../../lib/services';

/**
 * Records the acknowledgement of `version` on the plan as stored, in the store's turn. It writes nothing
 * when no plan is due, so a second tap or another tab's acknowledgement changes nothing. A failed write
 * throws.
 */
export async function reacknowledge(
  { domain, clock }: Pick<Services, 'domain' | 'clock'>,
  version: number,
): Promise<void> {
  await domain.write(({ plan }) =>
    plan !== null && acknowledgementDue(plan, version) ? { plan: acknowledge(plan, version, clock.now()) } : {},
  );
}

export type OnboardingActions = {
  /** True from the first tap until the write fails or finds a plan stored; Start is disabled meanwhile. */
  readonly pending: boolean;
  /**
   * Writes the plan once. The stored-plan check runs in the write's turn on the rows as stored, so a plan
   * another tab wrote meanwhile is kept and the call gives `stored`. A call while one is pending writes
   * nothing and gives that call's outcome. A failed write throws.
   */
  createPlan(plan: Plan): Promise<'created' | 'stored'>;
};

export function useOnboardingActions(): OnboardingActions {
  const { domain, analytics } = useServices();
  const router = useRouter();
  // A ref, not the state: two taps in one event loop turn both see the same render.
  const writing = useRef<Promise<'created' | 'stored'> | null>(null);
  const [pending, setPending] = useState(false);
  const settle = () => {
    writing.current = null;
    setPending(false);
  };
  const write = async (plan: Plan): Promise<'created' | 'stored'> => {
    let stored = false;
    try {
      await domain.write((snapshot) => {
        stored = snapshot.plan !== null;
        return stored ? {} : { plan };
      });
    } catch (error) {
      settle();
      throw error;
    }
    if (stored) {
      settle();
      return 'stored';
    }
    analytics.count('plan_created');
    router.push('/today');
    return 'created';
  };
  return {
    pending,
    createPlan(plan) {
      if (writing.current !== null) return writing.current;
      setPending(true);
      writing.current = write(plan);
      return writing.current;
    },
  };
}
