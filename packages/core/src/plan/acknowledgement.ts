// The plan-creation disclosure asked again (docs/DOMAIN.md §2.1, docs/LEGAL.md §4): only when a recorded
// wording version is below the current one. Nothing recorded (null and 0) is never asked, and a version
// above the current one is a rollback, never asked either.
import { type Instant, stampAfter } from '../dates/calendar';
import type { Plan } from '../schema/plan';

export function acknowledgementDue(plan: Pick<Plan, 'riskWordingVersion'>, current: number): boolean {
  return plan.riskWordingVersion >= 1 && plan.riskWordingVersion < current;
}

/** Records the acknowledgement of `version` at `now`, in a write strictly later than the stored plan's. */
export function acknowledge(plan: Plan, version: number, now: Instant): Plan {
  return {
    ...plan,
    riskAcknowledgedAt: now,
    riskWordingVersion: version,
    updatedAt: stampAfter(now, plan.updatedAt),
  };
}
