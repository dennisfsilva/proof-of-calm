// One country profile per file in packages/content/jurisdictions (docs/JURISDICTIONS.md §2). The shape
// is fixed by that document; the core consumes it through its looser CountryRules schema.
import * as z from 'zod/mini';
import {
  CalendarDateSchema,
  ConfidenceSchema,
  CountryCodeSchema,
  CurrencyCodeSchema,
  HoldingRuleSchema,
  MonthDaySchema,
  ReviewerSchema,
  SourceSchema,
} from './common.ts';

const short = (max: number) => z.string().check(z.maxLength(max));

export const TaxableEventSchema = z.strictObject({
  event: z.enum([
    'sale-to-fiat',
    'crypto-to-crypto',
    'crypto-to-stablecoin',
    'spending',
    'own-wallet-transfer',
    'gift-or-inheritance',
    'staking-or-airdrop',
  ]),
  taxable: z.enum(['yes', 'no', 'depends']),
  note: short(240),
});

export const RateSchema = z.strictObject({
  label: short(80),
  value: short(80),
  /** The first disposal date the value applies to. */
  validFrom: CalendarDateSchema,
  validTo: z.nullable(CalendarDateSchema),
  note: z.exactOptional(short(240)),
});

export const PendingChangeSchema = z.strictObject({
  title: short(160),
  status: z.enum(['proposed', 'enacted', 'in-force']),
  effectiveFrom: z.nullable(CalendarDateSchema),
  summary: short(400),
  source: SourceSchema,
});

export const JurisdictionCardSchema = z.strictObject({
  classification: short(240),
  taxableEvents: z.array(TaxableEventSchema).check(z.minLength(1)),
  rates: z.array(RateSchema).check(z.minLength(1)),
  allowances: z.array(short(240)),
  holdingRuleText: short(400),
  lotRuleText: short(240),
  losses: short(240),
  reporting: z.array(short(240)).check(z.minLength(1)),
  caveats: z.array(short(240)).check(z.minLength(1)),
  /** The card text shown in the app: at most 60 words (checked by the validator). */
  summary60: short(420),
});

export const ComputationModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('per-lot') }),
  z.strictObject({ kind: z.literal('portfolio-wide') }),
  z.strictObject({ kind: z.literal('wealth-snapshot'), date: MonthDaySchema }),
]);

export const HoldingRuleOverrideSchema = z.strictObject({
  acquiredFrom: CalendarDateSchema,
  rule: HoldingRuleSchema,
  note: short(240),
});

/** A source's name within its profile, lower case with hyphens, naming what it is: `pt-cirs-art10`. */
export const SourceKeySchema = z.string().check(z.regex(/^[a-z0-9-]+$/));

export const ProfileSourceSchema = z.extend(SourceSchema, { key: SourceKeySchema });

/** The source each rule of the card links to, by key; the validator checks that a source has it. */
export const RuleSourcesSchema = z.strictObject({
  holdingRule: SourceKeySchema,
  lotRule: SourceKeySchema,
  rates: SourceKeySchema,
  losses: SourceKeySchema,
  reporting: SourceKeySchema,
});

export const CountryProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  code: CountryCodeSchema,
  name: z.string().check(z.minLength(1)),
  currency: CurrencyCodeSchema,
  locales: z.array(z.string()).check(z.minLength(1)),
  numberFormatLocale: z.string(),
  dateFormatLocale: z.string(),
  timezones: z.array(z.string()).check(z.minLength(1)),
  englishConfidence: z.exactOptional(z.enum(['medium', 'low'])),
  taxYear: z.strictObject({ start: MonthDaySchema, end: MonthDaySchema }),
  filingNote: short(240),
  computationModel: ComputationModelSchema,
  holdingRule: HoldingRuleSchema,
  holdingRuleOverrides: z.array(HoldingRuleOverrideSchema),
  holdingRuleConditions: z.array(short(240)),
  lotRule: z.enum(['fifo', 'lifo', 'average', 'pooled', 'specific', 'unspecified']),
  lotScope: z.enum(['global', 'per-venue']),
  lotRuleNote: short(240),
  card: JurisdictionCardSchema,
  pendingChanges: z.array(PendingChangeSchema),
  sources: z.array(ProfileSourceSchema).check(z.minLength(1)),
  ruleSources: RuleSourcesSchema,
  status: z.strictObject({
    confidence: ConfidenceSchema,
    version: z.int().check(z.minimum(1)),
    changedOn: CalendarDateSchema,
    changeNotice: z.nullable(short(240)),
    lastReviewed: CalendarDateSchema,
    nextReviewDue: CalendarDateSchema,
    reviewedBy: ReviewerSchema,
  }),
});
export type CountryProfile = z.infer<typeof CountryProfileSchema>;
