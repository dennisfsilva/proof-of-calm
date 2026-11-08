// The parts of a country profile the core consumes (docs/DOMAIN.md §4). Profiles are authored and fully
// validated in packages/content (docs/JURISDICTIONS.md §2); the shell passes them in, parsed through
// this schema, which keeps the fields the core reads and lets the rest through.
import * as z from 'zod/mini';
import { CalendarDateSchema } from '../dates/calendar';
import { CurrencyCodeSchema } from '../money/currency';
import { HoldingRuleOverrideSchema, HoldingRuleSchema } from './holding-rule';
import { CountryCodeSchema } from './ids';

export const MonthDaySchema = z
  .string()
  .check(z.regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Expected a month and day MM-DD'));
export type MonthDay = z.infer<typeof MonthDaySchema>;

export const ComputationModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('per-lot') }),
  z.strictObject({ kind: z.literal('portfolio-wide') }),
  z.strictObject({ kind: z.literal('wealth-snapshot'), date: MonthDaySchema }),
]);
export type ComputationModel = z.infer<typeof ComputationModelSchema>;

export const LotRuleSchema = z.enum(['fifo', 'lifo', 'average', 'pooled', 'specific', 'unspecified']);
export type LotRule = z.infer<typeof LotRuleSchema>;

export const LotScopeSchema = z.enum(['global', 'per-venue']);
export type LotScope = z.infer<typeof LotScopeSchema>;

export const CountryRulesSchema = z.looseObject({
  code: CountryCodeSchema,
  name: z.string().check(z.minLength(1)),
  currency: CurrencyCodeSchema,
  locales: z.array(z.string()).check(z.minLength(1)),
  numberFormatLocale: z.string(),
  dateFormatLocale: z.string(),
  timezones: z.array(z.string()),
  /** docs/JURISDICTIONS.md §3: `low` where many English speakers in the zone are visitors (Portugal). */
  englishConfidence: z.exactOptional(z.enum(['medium', 'low'])),
  taxYear: z.looseObject({ start: MonthDaySchema, end: MonthDaySchema }),
  computationModel: ComputationModelSchema,
  holdingRule: HoldingRuleSchema,
  holdingRuleOverrides: z.array(HoldingRuleOverrideSchema),
  holdingRuleConditions: z.array(z.string()),
  lotRule: LotRuleSchema,
  lotScope: LotScopeSchema,
  status: z.looseObject({
    version: z.int().check(z.minimum(1)),
    changedOn: CalendarDateSchema,
    changeNotice: z.nullable(z.string()),
    lastReviewed: CalendarDateSchema,
    nextReviewDue: CalendarDateSchema,
  }),
});
export type CountryRules = z.infer<typeof CountryRulesSchema>;
