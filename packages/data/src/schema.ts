// The price history's shapes (ADR-0036, Reading of 2026-11-27; ADR-0006): the private store's daily
// closes per exchange and pair, the public dataset's reference closes in EUR, and the ECB rates file.
// The dates and decimals are the core's schemas, so no type is written twice; closes and rates are
// plain decimal strings above zero, never numbers (ADR-0017). This package holds no value while the
// publish switch is off (publish.ts, README.md).
import {
  type CalendarDate,
  CalendarDateSchema,
  CoinIdSchema,
  compareDates,
  type Decimal,
  isDecimalString,
  isPositive,
  PriceSchema,
  RatioSchema,
} from '@proofofcalm/core';
import * as z from 'zod/mini';

export const ExchangeSchema = z.enum(['kraken', 'bitstamp', 'coinbase']);
export type Exchange = z.infer<typeof ExchangeSchema>;

/** The quotes collected per exchange; the reference is computed in EUR only (README.md). */
export const QuoteSchema = z.enum(['EUR', 'USD']);
export type Quote = z.infer<typeof QuoteSchema>;

// The refinement runs after a failed decimal check too, so it tests the string before big.js reads it.
const aboveZero = (value: Decimal) => isDecimalString(value) && isPositive(value);
const CloseSchema = PriceSchema.check(z.refine(aboveZero, 'Expected a close above zero'));

/** One line of a store file `closes/<exchange>/<COIN>-<QUOTE>.csv`: the close dated that UTC day. */
export const StoreRowSchema = z.strictObject({ date: CalendarDateSchema, close: CloseSchema });
export type StoreRow = z.infer<typeof StoreRowSchema>;

/** The store file's first line. */
export const STORE_HEADER = 'date,close';

// Dates strictly ascending: sorted and never twice. Written for any input, since an element that
// failed its own schema still reaches this check.
function ascending(days: readonly { readonly date: CalendarDate }[]): boolean {
  let previous: CalendarDate | undefined;
  for (const day of days) {
    if (previous !== undefined && compareDates(previous, day.date) >= 0) return false;
    previous = day.date;
  }
  return true;
}
const ASCENDING = 'Expected dates in ascending order, each once';

/** A store file's rows, in file order. */
export const StoreRowsSchema = z.array(StoreRowSchema).check(z.refine(ascending, ASCENDING));

/** A reference close: the mean of the day's closes, and how many exchanges gave one. */
export const ReferenceDaySchema = z.strictObject({
  date: CalendarDateSchema,
  close: CloseSchema,
  sources: z.literal([1, 2, 3]),
});
export type ReferenceDay = z.infer<typeof ReferenceDaySchema>;

/** The dataset file `prices/<COIN>-EUR.json`. */
export const DatasetSchema = z.strictObject({
  coin: CoinIdSchema,
  currency: z.literal('EUR'),
  days: z.array(ReferenceDaySchema).check(z.refine(ascending, ASCENDING)),
});
export type Dataset = z.infer<typeof DatasetSchema>;

/** The ECB reference rates file: USD per EUR on each day the ECB published one (the shape only). */
export const FxFileSchema = z.strictObject({
  base: z.literal('EUR'),
  currency: z.literal('USD'),
  days: z
    .array(
      z.strictObject({
        date: CalendarDateSchema,
        rate: RatioSchema.check(z.refine(aboveZero, 'Expected a rate above zero')),
      }),
    )
    .check(z.refine(ascending, ASCENDING)),
});
export type FxFile = z.infer<typeof FxFileSchema>;
