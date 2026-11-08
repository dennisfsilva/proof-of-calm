import * as z from 'zod/mini';
import { CalendarDateSchema, InstantSchema } from '../dates/calendar';
import { CurrencyCodeSchema } from '../money/currency';
import { PercentSchema, PriceSchema } from '../money/decimal';
import { CoinIdSchema } from './ids';

// docs/DOMAIN.md §3.11. Live prices are decoration and estimates; plan maths never depends on them.
export const PriceSnapshotSchema = z.strictObject({
  at: InstantSchema,
  /** Coin → currency → price; a coin may lack a currency. */
  prices: z.record(CoinIdSchema, z.partialRecord(CurrencyCodeSchema, PriceSchema)),
  /** Coin → change over 24 hours in percent, in the pay currency. */
  change24h: z.exactOptional(z.record(CoinIdSchema, PercentSchema)),
});
export type PriceSnapshot = z.infer<typeof PriceSnapshotSchema>;

function ascending(closes: readonly (readonly [string, string])[]): boolean {
  let previous = '';
  for (const [date] of closes) {
    if (date <= previous) return false;
    previous = date;
  }
  return true;
}

/** Daily closes of one coin in one currency, strictly ascending by date. */
export const PriceHistorySchema = z
  .array(z.tuple([CalendarDateSchema, PriceSchema]))
  .check(z.refine(ascending, 'Expected closes in ascending date order, one per day'));
export type PriceHistory = z.infer<typeof PriceHistorySchema>;

/** The daily closes of several coins, all in one currency (the pay currency for the value chart). */
export const PriceHistoriesSchema = z.strictObject({
  currency: CurrencyCodeSchema,
  coins: z.record(CoinIdSchema, PriceHistorySchema),
});
export type PriceHistories = z.infer<typeof PriceHistoriesSchema>;
