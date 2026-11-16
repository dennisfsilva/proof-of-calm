// Reads a plan payload written under an earlier schema version (docs/DOMAIN.md §2.1): storage rows and
// backup files of earlier builds hold v2 and v3 plans. The upgrade only adds what later versions added;
// the schema still judges the result, so a damaged plan fails as it would have. `writtenPlan` is its
// inverse for writing: a plan goes out at the lowest version that holds it, so earlier builds read it.
import { isRecord } from '../json';
import { acknowledgementRecorded, PLAN_SCHEMA_VERSION, type Plan } from './plan';

const V2 = 2;
const V3 = 3;

/** The language every acknowledgement before v4 was given in: the disclosure had only its English text. */
const LANGUAGE_BEFORE_V4 = 'en';

/**
 * A v2 payload gains no acknowledgement (null, 0 and null); a v3 payload gains `en` when anything is
 * recorded, else null; both become v4. Anything else is returned unchanged.
 */
export function upgradePlan(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (raw.schemaVersion === V2) {
    return {
      riskAcknowledgedAt: null,
      riskWordingVersion: 0,
      riskLanguage: null,
      ...raw,
      schemaVersion: PLAN_SCHEMA_VERSION,
    };
  }
  if (raw.schemaVersion !== V3) return raw;
  const recorded = raw.riskAcknowledgedAt !== null || raw.riskWordingVersion !== 0;
  return { riskLanguage: recorded ? LANGUAGE_BEFORE_V4 : null, ...raw, schemaVersion: PLAN_SCHEMA_VERSION };
}

/** The v3 plan: the v4 plan without the recorded language, as main's strict schema reads it. */
export type PlanV3 = Omit<Plan, 'schemaVersion' | 'riskLanguage'> & { readonly schemaVersion: typeof V3 };

/** The v2 plan: the v3 plan without the acknowledgement, as the build before v3 reads it. */
type PlanV2 = Omit<PlanV3, 'schemaVersion' | 'riskAcknowledgedAt' | 'riskWordingVersion'> & {
  readonly schemaVersion: typeof V2;
};

/** The plan's v3 payload; it loses the recorded language, so only an `en` or null one survives the trip. */
export function planV3(plan: Plan): PlanV3 {
  const { riskLanguage: _language, ...rest } = plan;
  return { ...rest, schemaVersion: V3 };
}

/**
 * The payload a plan is written at, in a row or a backup, and its version: v2 while nothing is recorded
 * (null, 0 and null), v3 once anything is in English, v4 for another language. `upgradePlan` gives the
 * plan back exactly from each.
 */
export function writtenPlan(
  plan: Plan,
):
  | { readonly schemaVersion: typeof V2; readonly payload: PlanV2 }
  | { readonly schemaVersion: typeof V3; readonly payload: PlanV3 }
  | { readonly schemaVersion: typeof PLAN_SCHEMA_VERSION; readonly payload: Plan } {
  if (plan.riskLanguage !== null && plan.riskLanguage !== LANGUAGE_BEFORE_V4) {
    return { schemaVersion: PLAN_SCHEMA_VERSION, payload: plan };
  }
  if (acknowledgementRecorded(plan)) return { schemaVersion: V3, payload: planV3(plan) };
  const { riskAcknowledgedAt: _at, riskWordingVersion: _version, riskLanguage: _language, ...rest } = plan;
  return { schemaVersion: V2, payload: { ...rest, schemaVersion: V2 } };
}
