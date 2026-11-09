// The plan schema of the previous build, frozen: a copy of the strict v2 plan fields of 6548d03's
// packages/core/src/schema/plan.ts (`git show 6548d03:packages/core/src/schema/plan.ts`), the last
// build before plan schema v3. A rollback test parses what this build writes with it, as that build
// would (docs/RELEASE.md, rollback). The nested schemas are imported: none changed since 6548d03, and
// the strict object, its keys and the version literal are what a newer payload fails on. Never edit
// this copy to follow a later schema.
import * as z from 'zod/mini';
import { CalendarDateSchema, InstantSchema } from '../src/dates/calendar';
import { CurrencyCodeSchema } from '../src/money/currency';
import { MoneySchema } from '../src/money/decimal';
import { CoinSchema } from '../src/schema/coin';
import { HoldingRuleSchema } from '../src/schema/holding-rule';
import { CountryCodeSchema, EntityIdSchema } from '../src/schema/ids';
import {
  ExpectationsSchema,
  PauseSchema,
  ReferencesSchema,
  SellChecksSchema,
  SellWindowSchema,
  SkipSchema,
  SplitSchema,
} from '../src/schema/plan';

/** 6548d03's `PlanFieldsSchema`: the v2 plan exactly, with no acknowledgement fields. */
export const PreviousBuildPlanSchema = z.strictObject({
  id: EntityIdSchema,
  schemaVersion: z.literal(2),
  country: CountryCodeSchema,
  countryRuleVersion: z.int().check(z.minimum(0)),
  payCurrency: CurrencyCodeSchema,
  displayCurrency: CurrencyCodeSchema,
  coins: z.array(CoinSchema).check(z.minLength(1), z.maxLength(20)),
  split: SplitSchema,
  monthlyAmount: MoneySchema,
  startingAmount: MoneySchema,
  firstBuy: CalendarDateSchema,
  buyDay: z.int().check(z.minimum(1), z.maximum(28)),
  lastBuy: CalendarDateSchema,
  holdingRule: HoldingRuleSchema,
  sellWindow: z.nullable(SellWindowSchema),
  references: ReferencesSchema,
  expectations: ExpectationsSchema,
  pauses: z.array(PauseSchema),
  skips: z.array(SkipSchema),
  endedBuyingOn: z.nullable(CalendarDateSchema),
  sellChecks: SellChecksSchema,
  why: z.string().check(z.maxLength(280)),
  templateId: z.nullable(z.string().check(z.regex(/^[a-z0-9-]{1,40}$/))),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

/**
 * The version gate of the previous build's `readBackup`, frozen: that build wrote and read backups up to version 4
 * (the `held` kind) and answered `newer-version` above it before it read anything else.
 */
export function previousBuildBackupGate(json: { readonly schemaVersion: number }) {
  return json.schemaVersion > 4 ? { code: 'newer-version' as const, schemaVersion: json.schemaVersion } : null;
}
