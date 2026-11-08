import { COUNTRY_CODES } from '@proofofcalm/content';
import { CoinIdSchema, CoinSchema, EntityIdSchema, type Template } from '@proofofcalm/core';
import * as z from 'zod/mini';

// The onboarding's session draft (ADR-0020 Readings): what was typed and chosen, and the step it was left on,
// kept by the drafts adapter so every step can be left and reopened in the same browser session.

/** The drafts adapter's form and entity of the onboarding: one plan, before it exists. */
export const ONBOARDING_DRAFT = { form: 'onboarding', entity: 'new' } as const;

const StepSchema = z.enum(['country', 'template', 'numbers', 'coins', 'dates', 'why', 'reminder', 'summary']);
export type Step = z.infer<typeof StepSchema>;

/** What the user has typed and chosen so far; amounts and dates as typed. */
const SetupDraftSchema = z.readonly(
  z.object({
    /** The plan's id, made once with the draft: the stored plan's and the calendar file's UID. */
    id: EntityIdSchema,
    country: z.nullable(z.enum(COUNTRY_CODES)),
    /** A template's starting point, or the user's own coins (the custom path). */
    path: z.enum(['template', 'custom']),
    templateId: z.nullable(z.string()),
    /** The custom path's coins and shares as typed. */
    coins: z.readonly(
      z.object({ coins: z.readonly(z.array(CoinSchema)), shares: z.readonly(z.record(CoinIdSchema, z.string())) }),
    ),
    monthly: z.string(),
    /** Optional: empty is no starting amount. */
    starting: z.string(),
    firstBuy: z.string(),
    /** Asked only when the template's dates cannot be used (`needsLastBuy`). */
    lastBuy: z.string(),
    /** The custom path's buy day; null is the first buy's day (`buyDayOf`). */
    buyDay: z.nullable(z.int().check(z.minimum(1), z.maximum(28))),
    /** The user kept a sell window that opens before the last purchase passes the rule. */
    acceptEarlyOpen: z.boolean(),
    /** The user's one sentence as typed (at most 280 characters, as `PlanSchema.why`); stored trimmed. */
    why: z.string().check(z.maxLength(280)),
    /** The reminder step's answer; null until it is given. */
    reminder: z.nullable(z.enum(['calendar', 'later'])),
  }),
);
export type SetupDraft = z.infer<typeof SetupDraftSchema>;

/** The draft with the step it was left on, as the drafts adapter keeps it. */
export const OnboardingDraftSchema = z.object({ step: StepSchema, draft: SetupDraftSchema });
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

/** The steps after the template path's numbers: reaching them took the numbers' Continue. */
const AFTER_NUMBERS: readonly Step[] = ['why', 'reminder', 'summary'];

/**
 * The step a restored draft opens on: the saved one, or the earliest whose choice no longer resolves (a country
 * without a profile, a template that is gone, a step of the other path). A draft saved after the numbers with the
 * early window accepted opens on the numbers: the acceptance is not restored, so it is asked again there.
 */
export function resumeStep(
  saved: OnboardingDraft,
  profiles: readonly { readonly code: string }[],
  templateById: (id: string | null) => Template | null,
): Step {
  const { step, draft } = saved;
  if (step === 'country' || !profiles.some((profile) => profile.code === draft.country)) return 'country';
  if (step === 'template') return 'template';
  if (draft.path === 'custom') return step === 'numbers' ? 'template' : step;
  if (step === 'coins' || step === 'dates' || templateById(draft.templateId) === null) return 'template';
  return draft.acceptEarlyOpen && AFTER_NUMBERS.includes(step) ? 'numbers' : step;
}
