// Reads a plan payload written under an earlier schema version (docs/DOMAIN.md §2.1): storage rows and
// backup files of the previous build hold v2 plans. The upgrade only adds what v3 added; the schema
// still judges the result, so a damaged v2 plan fails as it would have. `writtenPlan` is its inverse
// for writing: a plan goes out at the lowest version that holds it, so the previous build reads it.
import { isRecord } from '../json';
import { PLAN_SCHEMA_VERSION, type Plan } from './plan';

const PREVIOUS_PLAN_VERSION = 2;

/** A v2 payload gains no acknowledgement (null and 0) and becomes v3; anything else is returned unchanged. */
export function upgradePlan(raw: unknown): unknown {
  if (!isRecord(raw) || raw.schemaVersion !== PREVIOUS_PLAN_VERSION) return raw;
  return { riskAcknowledgedAt: null, riskWordingVersion: 0, ...raw, schemaVersion: PLAN_SCHEMA_VERSION };
}

/** The v2 plan: the v3 plan without the acknowledgement, as the previous build's strict schema reads it. */
type PlanV2 = Omit<Plan, 'schemaVersion' | 'riskAcknowledgedAt' | 'riskWordingVersion'> & {
  readonly schemaVersion: typeof PREVIOUS_PLAN_VERSION;
};

/**
 * The payload a plan is written at, in a row or a backup, and its version: v2 while nothing is recorded
 * (null and 0), v3 once anything is. `upgradePlan` gives the plan back exactly from either.
 */
export function writtenPlan(
  plan: Plan,
):
  | { readonly schemaVersion: typeof PREVIOUS_PLAN_VERSION; readonly payload: PlanV2 }
  | { readonly schemaVersion: typeof PLAN_SCHEMA_VERSION; readonly payload: Plan } {
  const { riskAcknowledgedAt, riskWordingVersion, ...rest } = plan;
  const recorded = riskAcknowledgedAt !== null || riskWordingVersion !== 0;
  if (recorded) return { schemaVersion: PLAN_SCHEMA_VERSION, payload: plan };
  return { schemaVersion: PREVIOUS_PLAN_VERSION, payload: { ...rest, schemaVersion: PREVIOUS_PLAN_VERSION } };
}
