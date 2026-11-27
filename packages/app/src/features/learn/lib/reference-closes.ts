import type { CoinId, PriceHistory, Result } from '@proofofcalm/core';
import { type Dataset, DatasetSchema } from '@proofofcalm/data';

// The simulator's price history (docs/EDUCATION.md §7 and §8): one dataset file per coin, served by the site at a
// relative path once the publish switch allows it (packages/data/README.md, The dataset). Until then the path
// answers 404, which is the screen's "not published yet", never a failure.

/** Why the closes are not there: not published yet, not reachable now, or not a dataset of this coin. */
export type ClosesFailure = { readonly kind: 'unpublished' } | { readonly kind: 'offline' } | { readonly kind: 'invalid' };

/** The dataset file of a coin, relative to the site's origin. */
export const closesPath = (coin: CoinId) => `/data/prices/${coin}-EUR.json`;

const failed = (kind: ClosesFailure['kind']): Result<Dataset, ClosesFailure> => ({ ok: false, error: { kind } });

/**
 * Loads one coin's reference closes in EUR. A 404 is unpublished; a fetch that rejects (fetch rejects with a
 * TypeError when the network fails), a connection that drops mid-body or any other error status is offline; a
 * body that is not JSON, fails the schema, names another coin or holds no day is invalid.
 */
export async function loadReferenceCloses(
  coin: CoinId,
  fetcher: typeof fetch = fetch,
): Promise<Result<Dataset, ClosesFailure>> {
  let response: Response;
  let text: string;
  try {
    response = await fetcher(closesPath(coin));
    if (response.status === 404) return failed('unpublished');
    if (!response.ok) return failed('offline');
    text = await response.text();
  } catch {
    return failed('offline');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failed('invalid');
  }
  const parsed = DatasetSchema.safeParse(body);
  if (!parsed.success || parsed.data.coin !== coin || parsed.data.days.length === 0) return failed('invalid');
  return { ok: true, value: parsed.data };
}

/** The dataset as the core's simulation takes it: `[date, close]` per day, the closes as the decimal strings stored. */
export const toPriceHistory = (dataset: Dataset): PriceHistory => dataset.days.map(({ date, close }) => [date, close]);
