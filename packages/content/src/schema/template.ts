// The starting points in packages/content/templates (docs/DOMAIN.md §5, ADR-0009): never personalised,
// never called recommended. The holding rule comes from the user's country, and the amounts and the first
// buy are always the user's, so a template carries none of them.
import * as z from 'zod/mini';
import { CatalogueCoinSchema } from './coin.ts';
import { CalendarDateSchema, DecimalSchema, ReviewerSchema } from './common.ts';
import { DrawdownSchema } from './drawdown.ts';

const SellWindowSchema = z.strictObject({
  opens: CalendarDateSchema,
  closes: CalendarDateSchema,
  exitBy: CalendarDateSchema,
});

export const TemplateSchema = z.strictObject({
  id: z.string().check(z.regex(/^[a-z0-9-]{1,40}$/)),
  name: z.string().check(z.minLength(1), z.maxLength(60)),
  oneLine: z.string().check(z.minLength(1), z.maxLength(160)),
  riskLabel: z.string().check(z.minLength(1), z.maxLength(60)),
  /** The falls the card's dated band is composed from (docs/LEGAL.md §4), in the order of `coins`. */
  drawdowns: z.array(DrawdownSchema).check(z.minLength(1)),
  /** Paragraphs separated by a blank line, each of at most five sentences (checked by the validator). */
  explanation: z.string().check(z.minLength(1), z.maxLength(1200)),
  coins: z.array(CatalogueCoinSchema).check(z.minLength(1)),
  split: z.record(z.string(), DecimalSchema),
  lastBuy: z.exactOptional(CalendarDateSchema),
  sellWindow: z.nullable(SellWindowSchema),
  references: z.strictObject({
    peakFrom: z.exactOptional(CalendarDateSchema),
    peakTo: z.exactOptional(CalendarDateSchema),
    halving: z.exactOptional(CalendarDateSchema),
  }),
  validUntil: z.exactOptional(CalendarDateSchema),
  lastReviewed: CalendarDateSchema,
  /** Template names need a human sign-off (docs/CONTENT-STYLE.md §2). */
  reviewedBy: ReviewerSchema,
});
export type ContentTemplate = z.infer<typeof TemplateSchema>;
