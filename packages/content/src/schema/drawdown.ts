// One coin's fall from its intraday high to its intraday low (ADR-0009's check, docs/DOMAIN.md §5), shared by
// the templates' dated bands and the cycles file (docs/EDUCATION.md §2 and §6).
import * as z from 'zod/mini';
import { CalendarDateSchema, DecimalSchema } from './common.ts';

/**
 * A fall with its dated source: a series that holds both ends, or the high's in `source` and the low's in
 * `lowSource` when one request cannot span them. A coin that has not regained its high adds a `lowSource`
 * that runs to today, because its low can still move.
 */
export const DrawdownSchema = z.strictObject({
  coin: z.string().check(z.minLength(1)),
  high: CalendarDateSchema,
  low: CalendarDateSchema,
  /** Whole percent, as the card's band shows it. */
  fall: DecimalSchema,
  source: z.url(),
  lowSource: z.optional(z.url()),
  publisher: z.string().check(z.minLength(1)),
  accessed: CalendarDateSchema,
});
export type ContentDrawdown = z.infer<typeof DrawdownSchema>;
