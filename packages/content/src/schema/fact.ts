// Every number a Learn module cites, with its source and date (docs/CONTENT-OPS.md §7, docs/EDUCATION.md §9).
import * as z from 'zod/mini';
import { CalendarDateSchema, ConfidenceSchema } from './common.ts';

export const FactSchema = z.strictObject({
  key: z.string().check(z.regex(/^[a-z]\.[a-z0-9-]+$/, 'Expected a key such as "a.btc-drawdowns"')),
  /** The statement as the modules quote it, with its numbers, units and dates. */
  value: z.string().check(z.minLength(1), z.maxLength(1200)),
  unit: z.string().check(z.maxLength(40)),
  date: CalendarDateSchema,
  source: z.url(),
  publisher: z.string().check(z.minLength(1)),
  accessed: CalendarDateSchema,
  confidence: ConfidenceSchema,
  lastReviewed: CalendarDateSchema,
});
export type Fact = z.infer<typeof FactSchema>;
