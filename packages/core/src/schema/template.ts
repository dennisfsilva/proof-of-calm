// Templates are starting points, never recommendations (ADR-0009, docs/DOMAIN.md §5). Authored and
// validated in packages/content; parsed through this schema by the shell. The holding rule always
// comes from the user's country; the amounts and the first buy are always the user's.
import * as z from 'zod/mini';
import { CalendarDateSchema } from '../dates/calendar';
import { CoinSchema } from './coin';
import { ReferencesSchema, SplitSchema } from './plan';

export const TemplateSellWindowSchema = z.strictObject({
  opens: CalendarDateSchema,
  closes: CalendarDateSchema,
  exitBy: CalendarDateSchema,
});

export const TemplateSchema = z.looseObject({
  id: z.string().check(z.regex(/^[a-z0-9-]{1,40}$/)),
  name: z.string().check(z.minLength(1), z.maxLength(60)),
  oneLine: z.string().check(z.minLength(1), z.maxLength(160)),
  riskLabel: z.string().check(z.minLength(1), z.maxLength(60)),
  explanation: z.string().check(z.minLength(1), z.maxLength(1200)),
  coins: z.array(CoinSchema).check(z.minLength(1)),
  split: SplitSchema,
  /** A dated template (the Cycle plan) ends its buying on this date. */
  lastBuy: z.exactOptional(CalendarDateSchema),
  sellWindow: z.nullable(TemplateSellWindowSchema),
  references: ReferencesSchema,
  /** After this date the app asks for the dates instead of filling them (the prototype's recDatesOk). */
  validUntil: z.exactOptional(CalendarDateSchema),
  lastReviewed: CalendarDateSchema,
});
export type Template = z.infer<typeof TemplateSchema>;
