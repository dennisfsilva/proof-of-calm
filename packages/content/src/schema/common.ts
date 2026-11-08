// Building blocks shared by the content schemas. The core's types are checked against what these infer
// (schema.test.ts); the runtime schemas are the content package's own, because the dependency rule lets
// content import the core's types only.
import * as z from 'zod/mini';

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const CalendarDateSchema = z.string().check(z.refine(isCalendarDate, 'Expected a calendar date YYYY-MM-DD'));
export const MonthDaySchema = z
  .string()
  .check(z.regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Expected a month and day MM-DD'));
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const ReviewerSchema = z.enum(['owner', 'agent-draft']);
export const CountryCodeSchema = z.string().check(z.regex(/^[A-Z]{2}$/, 'Expected a two-letter country code'));
export const CurrencyCodeSchema = z.enum(['EUR', 'USD', 'GBP', 'CHF']);
export const DecimalSchema = z.string().check(z.regex(/^(0|[1-9]\d*)(\.\d+)?$/, 'Expected a plain decimal'));

export const SourceSchema = z.strictObject({
  title: z.string().check(z.minLength(1)),
  url: z.url(),
  publisher: z.string().check(z.minLength(1)),
  kind: z.enum(['law', 'authority', 'court', 'secondary']),
  published: z.nullable(CalendarDateSchema),
  accessed: CalendarDateSchema,
});
export type Source = z.infer<typeof SourceSchema>;

const HoldingEffectSchema = z.enum(['exempt', 'lower-rate']);

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
