// The pairs the pipeline collects per coin and exchange, as each exchange names them: Kraken's AssetPairs
// `altname` and Bitstamp's trading-pairs-info `url_symbol`, read on the date README.md gives. Listings
// only, no prices. Coinbase stays off until it consents in writing (ADR-0036), so it has no entry.
import { CoinIdSchema } from '@proofofcalm/core';
import { ExchangeSchema } from '@proofofcalm/data';
import * as z from 'zod/mini';
import raw from './pairs.json' with { type: 'json' };

// Capitals and digits only, as the store's file names take them (store.ts).
const CoinSchema = CoinIdSchema.check(z.regex(/^[A-Z0-9]{1,12}$/, 'Expected capitals and digits'));
const SymbolSchema = z.string().check(z.regex(/^[A-Za-z0-9]{1,24}$/, 'Expected letters and digits'));
const QuotesSchema = z
  .strictObject({ EUR: z.optional(SymbolSchema), USD: z.optional(SymbolSchema) })
  .check(z.refine((quotes) => Object.keys(quotes).length > 0, 'Expected at least one quote'));

export const PairsSchema = z.record(CoinSchema, z.partialRecord(ExchangeSchema, QuotesSchema));
export type Pairs = z.infer<typeof PairsSchema>;

/** `pairs.json`, checked when the module loads. */
export const PAIRS: Pairs = PairsSchema.parse(raw);
