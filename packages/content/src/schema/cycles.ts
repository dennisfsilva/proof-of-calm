// The completed cycles' maximum drawdowns per coin: the rows of the risk module's bar chart and the Red day page's
// scale of past falls (docs/EDUCATION.md §2 and §6, docs/DOMAIN.md §3.11). Completed cycles only: the current
// cycle is computed from prices, never stored.
import * as z from 'zod/mini';
import { CalendarDateSchema, ConfidenceSchema, ReviewerSchema } from './common.ts';
import { DrawdownSchema } from './drawdown.ts';

/** A template's drawdown with the research's confidence (docs/EDUCATION.md §9: high unless the series is thin). */
export const CycleDrawdownSchema = z.extend(DrawdownSchema, { confidence: ConfidenceSchema });
export type CycleDrawdown = z.infer<typeof CycleDrawdownSchema>;

export const CycleDrawdownsSchema = z.strictObject({
  lastReviewed: CalendarDateSchema,
  /** Figures a person acts on carry the owner's sign-off (docs/CONTENT-OPS.md §1). */
  reviewedBy: ReviewerSchema,
  /** In catalogue ticker order, then by `high`; the validator checks the order and that each coin's high is once. */
  drawdowns: z.array(CycleDrawdownSchema).check(z.minLength(1)),
});
export type CycleDrawdowns = z.infer<typeof CycleDrawdownsSchema>;
