import * as z from 'zod/mini';
import { CalendarDateSchema } from '../dates/calendar';

/** What passing the period does: a tax exemption, or a lower (long-term) rate. Same maths, other words. */
export const HoldingEffectSchema = z.enum(['exempt', 'lower-rate']);
export type HoldingEffect = z.infer<typeof HoldingEffectSchema>;

// docs/DOMAIN.md §2.1 and docs/JURISDICTIONS.md §2. `days` counts calendar days from the purchase
// (Portugal: 365); `years` is eligible the day after the anniversary (Germany, the US).
export const HoldingRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('days'),
    days: z.int().check(z.minimum(1), z.maximum(36_500)),
    effect: HoldingEffectSchema,
  }),
  z.strictObject({
    kind: z.literal('years'),
    years: z.int().check(z.minimum(1), z.maximum(100)),
    effect: HoldingEffectSchema,
  }),
]);
export type HoldingRule = z.infer<typeof HoldingRuleSchema>;

/** An enacted rule that applies to lots acquired on or after a date (Germany's draft reform would be one). */
export const HoldingRuleOverrideSchema = z.strictObject({
  acquiredFrom: CalendarDateSchema,
  rule: HoldingRuleSchema,
  note: z.string().check(z.maxLength(240)),
});
export type HoldingRuleOverride = z.infer<typeof HoldingRuleOverrideSchema>;
