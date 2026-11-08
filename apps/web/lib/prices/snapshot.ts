// The upstream /simple/price matrix as the core's PriceSnapshot (docs/DOMAIN.md §3.11): prices per coin
// in every currency, the 24-hour change in the requested one, and the moment the data describes.
import { COINS } from '@proofofcalm/content';
import {
  CURRENCIES,
  type CurrencyCode,
  fromFloat,
  type Instant,
  instantFromEpochMs,
  type PriceSnapshot,
  PriceSnapshotSchema,
} from '@proofofcalm/core';
import * as z from 'zod/mini';

/** CoinGecko's answer: per CoinGecko id, `eur`, `eur_24h_change`, …, `last_updated_at` (seconds). */
export const UpstreamMatrixSchema = z.record(z.string(), z.record(z.string(), z.nullable(z.number())));
export type UpstreamMatrix = z.infer<typeof UpstreamMatrixSchema>;

const PRICE_DP = 10;
const CHANGE_DP = 4;

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The snapshot the route serves, validated by the core's schema, or null when the matrix holds no
 * usable price. `fetchedAt` stands in for the data's own time when the upstream gives none.
 */
export function toSnapshot(matrix: UpstreamMatrix, currency: CurrencyCode, fetchedAt: Instant): PriceSnapshot | null {
  const prices: Record<string, Record<string, string>> = {};
  const change24h: Record<string, string> = {};
  let latest = 0;
  for (const coin of COINS) {
    const quote = matrix[coin.geckoId];
    if (quote === undefined) continue;
    const quoted: Record<string, string> = {};
    for (const code of CURRENCIES) {
      const price = quote[code.toLowerCase()];
      if (finite(price) && price > 0) quoted[code] = fromFloat(price, PRICE_DP);
    }
    if (Object.keys(quoted).length === 0) continue;
    prices[coin.id] = quoted;
    const change = quote[`${currency.toLowerCase()}_24h_change`];
    if (finite(change)) change24h[coin.id] = fromFloat(change, CHANGE_DP);
    const updated = quote.last_updated_at;
    if (finite(updated) && updated > latest) latest = updated;
  }
  if (Object.keys(prices).length === 0) return null;
  const parsed = PriceSnapshotSchema.safeParse({
    at: latest > 0 ? instantFromEpochMs(Math.round(latest) * 1000) : fetchedAt,
    prices,
    ...(Object.keys(change24h).length > 0 ? { change24h } : {}),
  });
  return parsed.success ? parsed.data : null;
}
